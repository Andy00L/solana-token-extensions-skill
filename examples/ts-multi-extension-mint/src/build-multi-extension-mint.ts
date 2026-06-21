/**
 * Build and operate a Token-2022 mint that combines four extensions:
 * transfer fee, metadata pointer, token metadata, and interest-bearing.
 *
 * Every function returns a discriminated result. There is no throw in this
 * module. LiteSVM reports a failed transaction as a value
 * (FailedTransactionMetadata), which we map to a typed error.
 * Source: LiteSVM sendTransaction return type, node_modules/litesvm/dist/index.d.ts.
 */
import {
  type AccountInfo,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  type Account,
  ExtensionType,
  LENGTH_SIZE,
  type Mint,
  TOKEN_2022_PROGRAM_ID,
  TYPE_SIZE,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeInterestBearingMintInstruction,
  createInitializeMetadataPointerInstruction,
  createInitializeMint2Instruction,
  createInitializeTransferFeeConfigInstruction,
  createMintToCheckedInstruction,
  createTransferCheckedWithFeeInstruction,
  createWithdrawWithheldTokensFromAccountsInstruction,
  getAssociatedTokenAddressSync,
  getMintLen,
  unpackAccount,
  unpackMint,
} from "@solana/spl-token";
import {
  type TokenMetadata,
  createInitializeInstruction,
  createUpdateFieldInstruction,
  pack,
} from "@solana/spl-token-metadata";
import { FailedTransactionMetadata, LiteSVM } from "litesvm";

// Demo token parameters. Unit and source noted per the Rust and TypeScript rules.
export const MINT_DECIMALS = 9; // base-10 decimals for the demo token
export const TRANSFER_FEE_BASIS_POINTS = 50; // 0.50%, source: chosen for the demo
export const MAX_TRANSFER_FEE = 5_000_000_000n; // 5 tokens at 9 decimals, unit: base units
export const INTEREST_RATE_BASIS_POINTS = 500; // 5.00% per year for display, source: chosen for the demo
export const DEMO_METADATA_FIELD = "category"; // custom metadata field key for the demo
export const DEMO_METADATA_VALUE = "demo"; // custom metadata field value for the demo

const FEE_BASIS_POINTS_DENOMINATOR = 10_000n; // basis points denominator, source: SPL transfer fee math
const TOKEN_NAME = "Demo Extension Token";
const TOKEN_SYMBOL = "DEXT";
const TOKEN_URI = "https://example.com/dext.json";

export type TokenError = {
  kind: "transaction-failed";
  step: string;
  logs: string[];
};

export type MintBuildResult =
  | { status: "ok"; mint: PublicKey; decimals: number; metadata: TokenMetadata }
  | { status: "error"; reason: TokenError };

export type OperationResult =
  | { status: "ok" }
  | { status: "error"; reason: TokenError };

function executeTransaction(
  svm: LiteSVM,
  instructions: TransactionInstruction[],
  feePayer: Keypair,
  extraSigners: Keypair[],
  step: string,
): OperationResult {
  const transaction = new Transaction();
  transaction.add(...instructions);
  transaction.recentBlockhash = svm.latestBlockhash();
  transaction.feePayer = feePayer.publicKey;
  transaction.sign(feePayer, ...extraSigners);
  const sendResult = svm.sendTransaction(transaction);
  if (sendResult instanceof FailedTransactionMetadata) {
    return {
      status: "error",
      reason: { kind: "transaction-failed", step, logs: sendResult.meta().logs() },
    };
  }
  return { status: "ok" };
}

/**
 * Create a Token-2022 mint with transfer fee, metadata pointer, token metadata,
 * and interest-bearing config, then set one custom metadata field. Fixed-length
 * extensions are initialized before InitializeMint, and the variable-length
 * metadata after it, in a single transaction.
 * Source: solana.com metadata pointer guide.
 */
export function buildMultiExtensionMint(svm: LiteSVM, payer: Keypair): MintBuildResult {
  const mintKeypair = Keypair.generate();
  const mintAddress = mintKeypair.publicKey;
  const authority = payer.publicKey;

  const metadata: TokenMetadata = {
    updateAuthority: authority,
    mint: mintAddress,
    name: TOKEN_NAME,
    symbol: TOKEN_SYMBOL,
    uri: TOKEN_URI,
    additionalMetadata: [[DEMO_METADATA_FIELD, DEMO_METADATA_VALUE]],
  };

  const fixedExtensions = [
    ExtensionType.TransferFeeConfig,
    ExtensionType.MetadataPointer,
    ExtensionType.InterestBearingConfig,
  ];
  const mintLength = getMintLen(fixedExtensions);
  const metadataLength = TYPE_SIZE + LENGTH_SIZE + pack(metadata).length;
  const rentLamports = svm.minimumBalanceForRentExemption(BigInt(mintLength + metadataLength));

  const instructions: TransactionInstruction[] = [
    SystemProgram.createAccount({
      fromPubkey: authority,
      newAccountPubkey: mintAddress,
      space: mintLength,
      lamports: Number(rentLamports),
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeTransferFeeConfigInstruction(
      mintAddress,
      authority,
      authority,
      TRANSFER_FEE_BASIS_POINTS,
      MAX_TRANSFER_FEE,
      TOKEN_2022_PROGRAM_ID,
    ),
    createInitializeMetadataPointerInstruction(
      mintAddress,
      authority,
      mintAddress,
      TOKEN_2022_PROGRAM_ID,
    ),
    createInitializeInterestBearingMintInstruction(
      mintAddress,
      authority,
      INTEREST_RATE_BASIS_POINTS,
      TOKEN_2022_PROGRAM_ID,
    ),
    createInitializeMint2Instruction(
      mintAddress,
      MINT_DECIMALS,
      authority,
      authority,
      TOKEN_2022_PROGRAM_ID,
    ),
    createInitializeInstruction({
      programId: TOKEN_2022_PROGRAM_ID,
      metadata: mintAddress,
      updateAuthority: authority,
      mint: mintAddress,
      mintAuthority: authority,
      name: metadata.name,
      symbol: metadata.symbol,
      uri: metadata.uri,
    }),
    createUpdateFieldInstruction({
      programId: TOKEN_2022_PROGRAM_ID,
      metadata: mintAddress,
      updateAuthority: authority,
      field: DEMO_METADATA_FIELD,
      value: DEMO_METADATA_VALUE,
    }),
  ];

  const created = executeTransaction(svm, instructions, payer, [mintKeypair], "create-and-initialize-mint");
  if (created.status === "error") {
    return { status: "error", reason: created.reason };
  }
  return { status: "ok", mint: mintAddress, decimals: MINT_DECIMALS, metadata };
}

/**
 * Attempt to initialize a fixed mint extension after InitializeMint, which is
 * the wrong order. The program requires fixed extensions before InitializeMint,
 * so a correct client receives a failed transaction as a value, not a throw.
 * This proves the ordering rule from ../../skill/compatibility-matrix.md in code.
 */
export function attemptExtensionAfterInitMint(svm: LiteSVM, payer: Keypair): OperationResult {
  const mintKeypair = Keypair.generate();
  const mintAddress = mintKeypair.publicKey;
  const authority = payer.publicKey;
  const mintLength = getMintLen([ExtensionType.TransferFeeConfig]);
  const rentLamports = svm.minimumBalanceForRentExemption(BigInt(mintLength));

  return executeTransaction(
    svm,
    [
      SystemProgram.createAccount({
        fromPubkey: authority,
        newAccountPubkey: mintAddress,
        space: mintLength,
        lamports: Number(rentLamports),
        programId: TOKEN_2022_PROGRAM_ID,
      }),
      // Wrong order on purpose: InitializeMint runs before the fixed extension.
      createInitializeMint2Instruction(mintAddress, MINT_DECIMALS, authority, authority, TOKEN_2022_PROGRAM_ID),
      createInitializeTransferFeeConfigInstruction(
        mintAddress,
        authority,
        authority,
        TRANSFER_FEE_BASIS_POINTS,
        MAX_TRANSFER_FEE,
        TOKEN_2022_PROGRAM_ID,
      ),
    ],
    payer,
    [mintKeypair],
    "init-extension-after-mint",
  );
}

/** Create the owner's associated account if needed and mint base units to it. */
export function mintTokens(
  svm: LiteSVM,
  payer: Keypair,
  mint: PublicKey,
  owner: PublicKey,
  amount: bigint,
): OperationResult {
  const ownerAccount = associatedAccountFor(mint, owner);
  return executeTransaction(
    svm,
    [
      createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, ownerAccount, owner, mint, TOKEN_2022_PROGRAM_ID),
      createMintToCheckedInstruction(mint, ownerAccount, payer.publicKey, amount, MINT_DECIMALS, [], TOKEN_2022_PROGRAM_ID),
    ],
    payer,
    [],
    "mint-tokens",
  );
}

/** The transfer fee the program withholds for an amount, floored and capped. */
export function computeTransferFee(amount: bigint): bigint {
  const fee = (amount * BigInt(TRANSFER_FEE_BASIS_POINTS)) / FEE_BASIS_POINTS_DENOMINATOR;
  return fee > MAX_TRANSFER_FEE ? MAX_TRANSFER_FEE : fee;
}

/** Transfer with the checked-fee instruction so the fee is asserted on-chain. */
export function transferWithFee(
  svm: LiteSVM,
  payer: Keypair,
  mint: PublicKey,
  sourceOwner: Keypair,
  destinationOwner: PublicKey,
  amount: bigint,
): OperationResult {
  const sourceAccount = associatedAccountFor(mint, sourceOwner.publicKey);
  const destinationAccount = associatedAccountFor(mint, destinationOwner);
  const fee = computeTransferFee(amount);
  const extraSigners = sourceOwner.publicKey.equals(payer.publicKey) ? [] : [sourceOwner];
  return executeTransaction(
    svm,
    [
      createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, destinationAccount, destinationOwner, mint, TOKEN_2022_PROGRAM_ID),
      createTransferCheckedWithFeeInstruction(
        sourceAccount,
        mint,
        destinationAccount,
        sourceOwner.publicKey,
        amount,
        MINT_DECIMALS,
        fee,
        [],
        TOKEN_2022_PROGRAM_ID,
      ),
    ],
    payer,
    extraSigners,
    "transfer-with-fee",
  );
}

/** Sweep withheld fees from the given token accounts into a fee-collector account. */
export function withdrawWithheldFees(
  svm: LiteSVM,
  payer: Keypair,
  mint: PublicKey,
  feeCollectorOwner: PublicKey,
  sourceAccounts: PublicKey[],
): OperationResult {
  const feeCollectorAccount = associatedAccountFor(mint, feeCollectorOwner);
  return executeTransaction(
    svm,
    [
      createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, feeCollectorAccount, feeCollectorOwner, mint, TOKEN_2022_PROGRAM_ID),
      createWithdrawWithheldTokensFromAccountsInstruction(mint, feeCollectorAccount, payer.publicKey, [], sourceAccounts, TOKEN_2022_PROGRAM_ID),
    ],
    payer,
    [],
    "withdraw-withheld-fees",
  );
}

/** Read and unpack a Token-2022 mint from LiteSVM, converting bytes to a Buffer. */
export function readMint(svm: LiteSVM, mint: PublicKey): Mint | null {
  const info = svm.getAccount(mint);
  if (info === null) {
    return null;
  }
  const bufferInfo: AccountInfo<Buffer> = { ...info, data: Buffer.from(info.data) };
  return unpackMint(mint, bufferInfo, TOKEN_2022_PROGRAM_ID);
}

/** Read and unpack a Token-2022 token account from LiteSVM. */
export function readTokenAccount(svm: LiteSVM, account: PublicKey): Account | null {
  const info = svm.getAccount(account);
  if (info === null) {
    return null;
  }
  const bufferInfo: AccountInfo<Buffer> = { ...info, data: Buffer.from(info.data) };
  return unpackAccount(account, bufferInfo, TOKEN_2022_PROGRAM_ID);
}

/** The Token-2022 associated token account address for a mint and owner. */
export function associatedAccountFor(mint: PublicKey, owner: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(mint, owner, false, TOKEN_2022_PROGRAM_ID);
}
