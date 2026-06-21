#!/usr/bin/env node
/**
 * MCP stdio server exposing one tool, inspect_mint, so an agent in the Solana AI
 * Kit can inspect a mint without writing code. It is a thin transport over the
 * tested handleInspectMint core: it wires the SDK to that handler and formats the
 * result. The tool is read only and never signs, sends, or logs any secret.
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

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`[InspectMintMcp] ${SERVER_NAME} ready on stdio\n`);
}

main().catch((fatalError: unknown) => {
  process.stderr.write(`[InspectMintMcp] fatal: ${describeError(fatalError)}\n`);
  process.exitCode = 1;
});
