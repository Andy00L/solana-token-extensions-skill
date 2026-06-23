#!/usr/bin/env node
/**
 * MCP stdio server exposing two read-only tools, inspect_mint and
 * check_extension_compatibility, so an agent in the Solana AI Kit can inspect a
 * live mint and vet a proposed extension set without writing code. It is a thin
 * transport over the tested handler cores: it wires the SDK to them and formats
 * the result. Both tools are read only and never sign, send, or log any secret.
 * Source: @modelcontextprotocol/sdk server/mcp.js (registerTool) and server/stdio.js.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { DecodeError } from "./decode-mint";
import { describeError } from "./describe-error";
import { type FetchError, fetchMintAccount, formatFetchError } from "./fetch-account";
import { formatDecodeError, formatReport } from "./inspect";
import { handleInspectMint } from "./mcp-tool";
import { checkCompatibility, formatCompatibilityReport } from "./check-compatibility";

// Solana public mainnet RPC. Source: https://solana.com/docs/core/clusters
const DEFAULT_RPC_URL = "https://api.mainnet-beta.solana.com";
const SERVER_NAME = "solana-token-extensions-mint-inspector";
const SERVER_VERSION = "1.0.0";

function formatToolError(reason: FetchError | DecodeError): string {
  switch (reason.kind) {
    case "invalid-address":
    case "rpc-failed":
      return formatFetchError(reason);
    default:
      return formatDecodeError(reason);
  }
}

const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

server.registerTool(
  "inspect_mint",
  {
    title: "Inspect a Token-2022 mint",
    description:
      "Decode a Solana mint's Token-2022 extensions and report wallet, DEX, and CEX integration risks. Read only: it fetches public account data and never signs or sends.",
    inputSchema: {
      mintAddress: z.string().describe("base58 mint address to inspect"),
      rpcUrl: z.string().optional().describe("RPC endpoint; defaults to Solana mainnet-beta"),
    },
  },
  async (args) => {
    const output = await handleInspectMint(
      { mintAddress: args.mintAddress, rpcUrl: args.rpcUrl },
      fetchMintAccount,
      DEFAULT_RPC_URL,
    );
    if (output.status === "error") {
      return {
        content: [{ type: "text", text: `inspect_mint failed: ${formatToolError(output.reason)}` }],
        isError: true,
      };
    }
    return {
      content: [
        { type: "text", text: formatReport(output.inspection) },
        { type: "text", text: JSON.stringify(output.inspection) },
      ],
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
  },
  async (args) => {
    const result = checkCompatibility({ extensions: args.extensions });
    return {
      content: [
        { type: "text", text: formatCompatibilityReport(result) },
        { type: "text", text: JSON.stringify(result) },
      ],
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
