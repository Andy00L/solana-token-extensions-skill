#!/usr/bin/env node
/**
 * CLI entry for the Token-2022 mint inspector.
 *
 * Usage:
 *   inspect-mint <MINT_ADDRESS> [--rpc <URL>] [--json]
 *
 * It fetches the mint from an RPC, decodes its extensions, and prints an
 * integration risk report. Errors are surfaced on stderr with a [InspectMintCli]
 * prefix and a non-zero exit code. The inspector is read only: it reads public
 * account data and never signs, sends, or logs any secret.
 */
import { describeError } from "./describe-error";
import { fetchMintAccount, formatFetchError } from "./fetch-account";
import { formatDecodeError, formatReport, inspectAccount } from "./inspect";

// Solana public mainnet RPC. Source: https://solana.com/docs/core/clusters
const DEFAULT_RPC_URL = "https://api.mainnet-beta.solana.com";

const USAGE = [
  "Usage: inspect-mint <MINT_ADDRESS> [--rpc <URL>] [--json]",
  "",
  "  <MINT_ADDRESS>   base58 mint address to inspect",
  `  --rpc <URL>      RPC endpoint (default: ${DEFAULT_RPC_URL})`,
  "  --json           print the inspection as JSON instead of text",
  "  -h, --help       show this help",
].join("\n");

type ParsedArgs =
  | { status: "help" }
  | { status: "error"; message: string }
  | { status: "ok"; address: string; rpcUrl: string; json: boolean };

function parseArgs(argv: string[]): ParsedArgs {
  let address: string | null = null;
  let rpcUrl = DEFAULT_RPC_URL;
  let json = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "-h" || argument === "--help") {
      return { status: "help" };
    }
    if (argument === "--json") {
      json = true;
      continue;
    }
    if (argument === "--rpc") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        return { status: "error", message: "--rpc requires a URL value" };
      }
      rpcUrl = value;
      index += 1;
      continue;
    }
    if (argument.startsWith("-")) {
      return { status: "error", message: `unknown flag: ${argument}` };
    }
    if (address === null) {
      address = argument;
      continue;
    }
    return { status: "error", message: `unexpected extra argument: ${argument}` };
  }

  if (address === null) {
    return { status: "error", message: "missing required mint address" };
  }
  return { status: "ok", address, rpcUrl, json };
}

async function runCli(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv);

  if (parsed.status === "help") {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  if (parsed.status === "error") {
    process.stderr.write(`[InspectMintCli] ${parsed.message}\n${USAGE}\n`);
    return 2;
  }

  const fetched = await fetchMintAccount(parsed.address, parsed.rpcUrl);
  if (fetched.status === "error") {
    process.stderr.write(`[InspectMintCli] ${formatFetchError(fetched.reason)}\n`);
    return 1;
  }

  const result = inspectAccount(fetched.address, fetched.account);
  if (result.status === "error") {
    if (parsed.json) {
      process.stdout.write(`${JSON.stringify({ status: "error", reason: result.reason }, null, 2)}\n`);
    } else {
      process.stderr.write(`[InspectMintCli] ${formatDecodeError(result.reason)}\n`);
    }
    return 1;
  }

  if (parsed.json) {
    process.stdout.write(`${JSON.stringify(result.inspection, null, 2)}\n`);
  } else {
    process.stdout.write(`${formatReport(result.inspection)}\n`);
  }
  return 0;
}

// Exit explicitly rather than waiting for the event loop to drain: the RPC client
// can keep a keep-alive socket open after the report is written, which would
// otherwise delay exit. Output is written synchronously inside runCli first.
runCli(process.argv.slice(2))
  .then((code) => {
    process.exit(code);
  })
  .catch((fatalError: unknown) => {
    process.stderr.write(`[InspectMintCli] unexpected error: ${describeError(fatalError)}\n`);
    process.exit(1);
  });
