#!/usr/bin/env node
/**
 * MCP stdio server exposing five read-only tools, inspect_mint, inspect_many,
 * check_extension_compatibility, scaffold_mint, and generate_hook_transfer, so an
 * agent in the Solana AI Kit can inspect a live mint, triage a list of mints, vet a
 * proposed extension set, scaffold a correct mint, and generate a transfer-hook
 * transfer client, without writing code. It is a thin transport over the tested
 * handler cores: it wires the SDK to them and formats the result. Every tool is read
 * only and never signs, sends, or logs any secret.
 * Source: @modelcontextprotocol/sdk server/mcp.js (registerTool) and server/stdio.js.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { describeError } from "./describe-error";
import { fetchCurrentEpoch, fetchMintAccount, fetchMintAccounts } from "./fetch-account";
import { formatAccountError, formatReport, inspectionSummary } from "./inspect";
import { handleInspectMint } from "./mcp-tool";
import { batchSummary, formatBatchInputError, formatBatchReport, handleInspectMany } from "./inspect-many";
import { checkCompatibility, compatibilitySummary, formatCompatibilityReport } from "./check-compatibility";
import { formatGenerateReport, generateMintScaffold, generateMintSummary } from "./generate-mint";
import { formatHookCodegen, generateHookTransferCodegen, hookCodegenSummary } from "./hook-codegen";

// Solana public mainnet RPC. Source: https://solana.com/docs/core/clusters
const DEFAULT_RPC_URL = "https://api.mainnet-beta.solana.com";
const SERVER_NAME = "solana-token-extensions-mint-inspector";
const SERVER_VERSION = "1.0.0";

const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

// Output schemas for the structured (agent-consumable) verdict each tool returns
// alongside its text. Source: @modelcontextprotocol/sdk registerTool outputSchema.
const severityEnum = z.enum(["critical", "high", "medium", "low", "info"]);
const INSPECTION_VERDICT_SHAPE = {
  kind: z.enum(["mint", "token-account"]),
  address: z.string(),
  severity: severityEnum,
  score: z.number(),
  cexBlockers: z.array(z.string()),
  dexFrictions: z.array(z.string()),
  walletCaveats: z.array(z.string()),
};
const BATCH_VERDICT_SHAPE = {
  total: z.number(),
  inspected: z.number(),
  failed: z.number(),
  worstSeverity: severityEnum,
  withCexBlockers: z.number(),
  verdicts: z.array(
    z.object({
      address: z.string(),
      status: z.enum(["ok", "error"]),
      severity: severityEnum.optional(),
      score: z.number().optional(),
      cexBlockers: z.array(z.string()).optional(),
    }),
  ),
};
const COMPAT_VERDICT_SHAPE = {
  recognized: z.array(z.string()),
  unrecognized: z.array(z.string()),
  severity: severityEnum,
  score: z.number(),
  cexBlockers: z.array(z.string()),
  conflicts: z.array(z.object({ extensions: z.array(z.string()), severity: severityEnum, title: z.string() })),
};
const SCAFFOLD_VERDICT_SHAPE = {
  status: z.enum(["ok", "rejected"]),
  reason: z.string().optional(),
  recognized: z.array(z.string()),
  scaffoldable: z.array(z.string()),
  unsupported: z.array(z.string()),
  stepCount: z.number(),
};
const HOOK_VERDICT_SHAPE = {
  mint: z.string(),
  hookProgramId: z.string(),
  decimals: z.number(),
  validationPda: z.string(),
  executeAccountOrder: z.array(z.string()),
  caveats: z.array(z.string()),
};

// Read-only tool annotations. Source: MCP tools spec 2025-06-18 (ToolAnnotations).
// All three tools are read-only and never write state; the two RPC tools touch the
// open world (mainnet), the offline checker does not and is deterministic.
const RPC_READ_ANNOTATIONS = { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true };
const OFFLINE_READ_ANNOTATIONS = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

server.registerTool(
  "inspect_mint",
  {
    title: "Inspect a Token-2022 mint",
    description:
      "Decode a Solana mint or token account. For a mint: its Token-2022 extensions and the wallet, DEX, and CEX integration risks. For a token account: its balance, frozen state, withheld fees, and account extensions. Read only: it fetches public account data and never signs or sends.",
    inputSchema: {
      mintAddress: z.string().describe("base58 mint or token account address to inspect"),
      rpcUrl: z.string().optional().describe("RPC endpoint; defaults to Solana mainnet-beta"),
    },
    outputSchema: INSPECTION_VERDICT_SHAPE,
    annotations: RPC_READ_ANNOTATIONS,
  },
  async (args) => {
    const currentEpoch = await fetchCurrentEpoch(args.rpcUrl ?? DEFAULT_RPC_URL);
    const output = await handleInspectMint(
      { mintAddress: args.mintAddress, rpcUrl: args.rpcUrl, currentEpoch: currentEpoch ?? undefined },
      fetchMintAccount,
      DEFAULT_RPC_URL,
    );
    if (output.status === "error") {
      return {
        content: [{ type: "text", text: `inspect_mint failed: ${formatAccountError(output.reason)}` }],
        isError: true,
      };
    }
    return {
      content: [
        { type: "text", text: formatReport(output.inspection) },
        { type: "text", text: JSON.stringify(output.inspection) },
      ],
      structuredContent: inspectionSummary(output.inspection),
    };
  },
);

server.registerTool(
  "inspect_many",
  {
    title: "Inspect many Token-2022 mints at once",
    description:
      "Triage a list of Solana mints or token accounts in one call: a per-address verdict (severity and 0-to-100 risk score) and an aggregate roll-up (worst verdict, counts by severity, and how many carry a CEX listing blocker). Built for vetting a listing set or a holdings list. Read only; up to 50 addresses per call.",
    inputSchema: {
      mintAddresses: z.array(z.string()).describe("base58 mint or token account addresses to inspect (up to 50)"),
      rpcUrl: z.string().optional().describe("RPC endpoint; defaults to Solana mainnet-beta"),
    },
    outputSchema: BATCH_VERDICT_SHAPE,
    annotations: RPC_READ_ANNOTATIONS,
  },
  async (args) => {
    const currentEpoch = await fetchCurrentEpoch(args.rpcUrl ?? DEFAULT_RPC_URL);
    const output = await handleInspectMany(
      { mintAddresses: args.mintAddresses, rpcUrl: args.rpcUrl, currentEpoch: currentEpoch ?? undefined },
      fetchMintAccounts,
      DEFAULT_RPC_URL,
    );
    if (output.status === "error") {
      return {
        content: [{ type: "text", text: `inspect_many failed: ${formatBatchInputError(output.reason)}` }],
        isError: true,
      };
    }
    return {
      content: [
        { type: "text", text: formatBatchReport(output.report) },
        { type: "text", text: JSON.stringify(output.report) },
      ],
      structuredContent: batchSummary(output.report),
    };
  },
);

server.registerTool(
  "check_extension_compatibility",
  {
    title: "Check a Token-2022 extension set",
    description:
      "Validate a proposed set of Token-2022 extension ids for conflicts and wallet, DEX, and CEX integration posture, before writing any mint code. Read only and offline. Pass extension ids such as transfer-fee, transfer-hook, permanent-delegate, confidential-transfer, non-transferable, interest-bearing, scaled-ui-amount, pausable, default-account-state.",
    inputSchema: {
      extensions: z.array(z.string()).describe("extension ids to validate together"),
    },
    outputSchema: COMPAT_VERDICT_SHAPE,
    annotations: OFFLINE_READ_ANNOTATIONS,
  },
  async (args) => {
    const result = checkCompatibility({ extensions: args.extensions });
    return {
      content: [
        { type: "text", text: formatCompatibilityReport(result) },
        { type: "text", text: JSON.stringify(result) },
      ],
      structuredContent: compatibilitySummary(result),
    };
  },
);

server.registerTool(
  "scaffold_mint",
  {
    title: "Scaffold a Token-2022 mint",
    description:
      "Generate a correct, correctly-ordered, correctly-sized Token-2022 mint creation scaffold from a set of extension ids, refusing any set the runtime would reject at initialization. Read only and offline. Returns an init plan and TypeScript code with placeholders to fill in.",
    inputSchema: {
      extensions: z.array(z.string()).describe("extension ids to include in the mint (for example transfer-fee, metadata-pointer, token-metadata)"),
      decimals: z.number().int().min(0).max(18).optional().describe("mint decimals (default 9)"),
    },
    outputSchema: SCAFFOLD_VERDICT_SHAPE,
    annotations: OFFLINE_READ_ANNOTATIONS,
  },
  async (args) => {
    const result = generateMintScaffold({ extensions: args.extensions, decimals: args.decimals });
    return {
      content: [
        { type: "text", text: formatGenerateReport(result) },
        { type: "text", text: JSON.stringify(result) },
      ],
      structuredContent: generateMintSummary(result),
    };
  },
);

server.registerTool(
  "generate_hook_transfer",
  {
    title: "Generate a transfer-hook transfer client",
    description:
      "Generate a correct client snippet to transfer a Token-2022 mint that has an active transfer hook, with the extra accounts resolved against the Execute account set (the fix for the most common hook-integration bug), plus a static classification of the hook's extra-account model and the resolution caveats. Read only and offline.",
    inputSchema: {
      mint: z.string().describe("base58 mint address that carries the transfer hook"),
      hookProgramId: z.string().describe("base58 transfer-hook program id, from the mint's transfer-hook extension"),
      decimals: z.number().int().min(0).max(18).optional().describe("mint decimals (default 9)"),
    },
    outputSchema: HOOK_VERDICT_SHAPE,
    annotations: OFFLINE_READ_ANNOTATIONS,
  },
  async (args) => {
    const result = generateHookTransferCodegen({ mint: args.mint, hookProgramId: args.hookProgramId, decimals: args.decimals });
    return {
      content: [
        { type: "text", text: formatHookCodegen(result) },
        { type: "text", text: JSON.stringify(result) },
      ],
      structuredContent: hookCodegenSummary(result),
    };
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`[InspectMintMcp] ${SERVER_NAME} ready on stdio\n`);
}

main().catch((fatalError: unknown) => {
  process.stderr.write(`[InspectMintMcp] fatal: ${describeError(fatalError)}\n`);
  process.exitCode = 1;
});
