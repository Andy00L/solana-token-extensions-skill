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
import type { DecodeError } from "./decode-mint";
import { describeError } from "./describe-error";
import { type FetchError, fetchCurrentEpoch, fetchMintAccount, formatFetchError } from "./fetch-account";
import { formatDecodeError, formatReport, inspectAccount } from "./inspect";
import { formatBatchInputError, formatBatchReport, handleInspectMany } from "./inspect-many";
import { formatGenerateReport, generateMintScaffold } from "./generate-mint";

// Solana public mainnet RPC. Source: https://solana.com/docs/core/clusters
const DEFAULT_RPC_URL = "https://api.mainnet-beta.solana.com";

const USAGE = [
  "Usage: inspect-mint <ADDRESS> [<ADDRESS> ...] [--rpc <URL>] [--json]",
  "",
  "  <ADDRESS>        base58 mint or token account address to inspect;",
  "                   pass more than one to run a batch (portfolio) triage",
  `  --rpc <URL>      RPC endpoint (default: ${DEFAULT_RPC_URL})`,
  "  --scaffold <IDS> generate a Token-2022 mint scaffold for a comma-separated",
  "                   extension-id set instead of inspecting (offline)",
  "  --decimals <N>   mint decimals for --scaffold (default 9)",
  "  --json           print the output as JSON instead of text",
  "  -h, --help       show this help",
].join("\n");

type ParsedArgs =
  | { status: "help" }
  | { status: "error"; message: string }
  | { status: "ok"; addresses: string[]; rpcUrl: string; json: boolean }
  | { status: "scaffold"; extensions: string[]; decimals: number; json: boolean };

function parseArgs(argv: string[]): ParsedArgs {
  const addresses: string[] = [];
  let rpcUrl = DEFAULT_RPC_URL;
  let json = false;
  let scaffold: string | null = null;
  let decimals = 9; // default mint decimals for --scaffold; SPL convention

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
    if (argument === "--scaffold") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        return { status: "error", message: "--scaffold requires a comma-separated extension id list" };
      }
      scaffold = value;
      index += 1;
      continue;
    }
    if (argument === "--decimals") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        return { status: "error", message: "--decimals requires a number" };
      }
      const parsedDecimals = Number.parseInt(value, 10);
      if (!Number.isInteger(parsedDecimals) || parsedDecimals < 0) {
        return { status: "error", message: `invalid --decimals value: ${value}` };
      }
      decimals = parsedDecimals;
      index += 1;
      continue;
    }
    if (argument.startsWith("-")) {
      return { status: "error", message: `unknown flag: ${argument}` };
    }
    addresses.push(argument);
  }

  if (scaffold !== null) {
    const extensions = scaffold
      .split(",")
      .map((extensionId) => extensionId.trim())
      .filter((extensionId) => extensionId.length > 0);
    if (extensions.length === 0) {
      return { status: "error", message: "--scaffold needs at least one extension id" };
    }
    return { status: "scaffold", extensions, decimals, json };
  }

  if (addresses.length === 0) {
    return { status: "error", message: "missing required mint address" };
  }
  return { status: "ok", addresses, rpcUrl, json };
}

// Emit an inspection error. In --json mode every error is a structured object on
// stdout so the output stays machine-readable; otherwise a prefixed line on stderr.
function emitError(asJson: boolean, message: string, reason: FetchError | DecodeError): void {
  if (asJson) {
    process.stdout.write(`${JSON.stringify({ status: "error", reason }, null, 2)}\n`);
  } else {
    process.stderr.write(`[InspectMintCli] ${message}\n`);
  }
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

  // Offline scaffold generation: vet an extension set and emit mint creation code.
  if (parsed.status === "scaffold") {
    const result = generateMintScaffold({ extensions: parsed.extensions, decimals: parsed.decimals });
    if (parsed.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      process.stdout.write(`${formatGenerateReport(result)}\n`);
    }
    return result.status === "rejected" ? 2 : 0;
  }

  // More than one address: run a batch (portfolio) triage. A bad address inside
  // the batch becomes an error verdict in the report rather than failing the run.
  if (parsed.addresses.length > 1) {
    const epoch = await fetchCurrentEpoch(parsed.rpcUrl);
    const output = await handleInspectMany(
      { mintAddresses: parsed.addresses, rpcUrl: parsed.rpcUrl, currentEpoch: epoch ?? undefined },
      fetchMintAccount,
      DEFAULT_RPC_URL,
    );
    if (output.status === "error") {
      if (parsed.json) {
        process.stdout.write(`${JSON.stringify({ status: "error", reason: output.reason }, null, 2)}\n`);
      } else {
        process.stderr.write(`[InspectMintCli] ${formatBatchInputError(output.reason)}\n`);
      }
      return 2;
    }
    if (parsed.json) {
      process.stdout.write(`${JSON.stringify(output.report, null, 2)}\n`);
    } else {
      process.stdout.write(`${formatBatchReport(output.report)}\n`);
    }
    return 0;
  }

  const epoch = await fetchCurrentEpoch(parsed.rpcUrl);
  const fetched = await fetchMintAccount(parsed.addresses[0], parsed.rpcUrl);
  if (fetched.status === "error") {
    emitError(parsed.json, formatFetchError(fetched.reason), fetched.reason);
    return 1;
  }

  const result = inspectAccount(fetched.address, fetched.account, epoch ?? undefined);
  if (result.status === "error") {
    emitError(parsed.json, formatDecodeError(result.reason), result.reason);
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
