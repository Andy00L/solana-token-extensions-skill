/**
 * Test fixtures: build Token-2022 and classic SPL mints inside LiteSVM and return
 * their account data as AccountInfo<Buffer>, so the decoder runs against real
 * on-chain serialization, offline and deterministic. These builders cover the
 * specific extension sets the inspector tests assert on; they are not a general
 * mint builder (the demo builder lives in ../../ts-multi-extension-mint).
 */
import {
  type AccountInfo,
  Keypair,
  type PublicKey,
  SystemProgram,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  AccountState,
  ExtensionType,
  LENGTH_SIZE,
  MINT_SIZE,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  TYPE_SIZE,
  createInitializeDefaultAccountStateInstruction,
  createInitializeInterestBearingMintInstruction,
  createInitializeMetadataPointerInstruction,
  createInitializeMint2Instruction,
  createInitializeMintCloseAuthorityInstruction,
  createInitializeNonTransferableMintInstruction,
  createInitializePausableConfigInstruction,
  createInitializePermanentDelegateInstruction,
  createInitializeScaledUiAmountConfigInstruction,
  createInitializeTransferFeeConfigInstruction,
  createInitializeTransferHookInstruction,
  getMintLen,
} from "@solana/spl-token";
import { type TokenMetadata, createInitializeInstruction, pack } from "@solana/spl-token-metadata";
import { FailedTransactionMetadata, type LiteSVM } from "litesvm";

const DEMO_DECIMALS = 9; // base-10 decimals for fixtures
const DEMO_FEE_BASIS_POINTS = 50; // 0.50%
const DEMO_MAX_FEE = 5_000_000_000n; // 5 tokens at 9 decimals, unit: base units
const DEMO_INTEREST_BASIS_POINTS = 500; // 5.00% per year for display
const DEMO_SCALED_UI_MULTIPLIER = 2; // display multiplier for the controls fixture

/** Fund a fresh in-memory payer. Never logged; generated per test. */
export function fundedPayer(svm: LiteSVM): Keypair {
  const payer = Keypair.generate();
  svm.airdrop(payer.publicKey, 100_000_000_000n); // 100 SOL, unit: lamports
  return payer;
}

/** Read an account from LiteSVM as AccountInfo<Buffer>, or throw if missing. */
export function readAccountInfo(svm: LiteSVM, address: PublicKey): AccountInfo<Buffer> {
  const info = svm.getAccount(address);
  if (info === null) {
    throw new Error(`fixture account missing: ${address.toBase58()}`);
  }
  return { ...info, data: Buffer.from(info.data) };
}

function sendMintTransaction(
  svm: LiteSVM,
  payer: Keypair,
  mintKeypair: Keypair,
  instructions: TransactionInstruction[],
): void {
  const transaction = new Transaction().add(...instructions);
  transaction.recentBlockhash = svm.latestBlockhash();
  transaction.feePayer = payer.publicKey;
  transaction.sign(payer, mintKeypair);
  const result = svm.sendTransaction(transaction);
  if (result instanceof FailedTransactionMetadata) {
    throw new Error(`fixture mint build failed: ${result.meta().logs().join("; ")}`);
  }
}

/**
 * A Token-2022 mint carrying transfer fee, transfer hook, default account state
 * (frozen), metadata pointer, interest-bearing, and on-chain token metadata. The
 * hook program id is a random address: decoding reads the pointer and never runs it.
 */
export function createRichMint(svm: LiteSVM, payer: Keypair): { mint: PublicKey; hookProgramId: PublicKey } {
  const mintKeypair = Keypair.generate();
  const mint = mintKeypair.publicKey;
  const authority = payer.publicKey;
  const hookProgramId = Keypair.generate().publicKey;

  const metadata: TokenMetadata = {
    updateAuthority: authority,
    mint,
    name: "Risky Token",
    symbol: "RISK",
    uri: "https://example.com/risk.json",
    additionalMetadata: [["category", "test"]],
  };

  const fixedExtensions = [
    ExtensionType.TransferFeeConfig,
    ExtensionType.TransferHook,
    ExtensionType.DefaultAccountState,
    ExtensionType.MetadataPointer,
    ExtensionType.InterestBearingConfig,
  ];
  const mintLength = getMintLen(fixedExtensions);
  const metadataLength = TYPE_SIZE + LENGTH_SIZE + pack(metadata).length;
  const rentLamports = svm.minimumBalanceForRentExemption(BigInt(mintLength + metadataLength));

  sendMintTransaction(svm, payer, mintKeypair, [
    SystemProgram.createAccount({
      fromPubkey: authority,
      newAccountPubkey: mint,
      space: mintLength,
      lamports: Number(rentLamports),
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeTransferFeeConfigInstruction(
      mint,
      authority,
      authority,
      DEMO_FEE_BASIS_POINTS,
      DEMO_MAX_FEE,
      TOKEN_2022_PROGRAM_ID,
    ),
    createInitializeTransferHookInstruction(mint, authority, hookProgramId, TOKEN_2022_PROGRAM_ID),
    createInitializeDefaultAccountStateInstruction(mint, AccountState.Frozen, TOKEN_2022_PROGRAM_ID),
    createInitializeMetadataPointerInstruction(mint, authority, mint, TOKEN_2022_PROGRAM_ID),
    createInitializeInterestBearingMintInstruction(mint, authority, DEMO_INTEREST_BASIS_POINTS, TOKEN_2022_PROGRAM_ID),
    // Freeze authority is required for DefaultAccountState to make sense.
    createInitializeMint2Instruction(mint, DEMO_DECIMALS, authority, authority, TOKEN_2022_PROGRAM_ID),
    createInitializeInstruction({
      programId: TOKEN_2022_PROGRAM_ID,
      metadata: mint,
      updateAuthority: authority,
      mint,
      mintAuthority: authority,
      name: metadata.name,
      symbol: metadata.symbol,
      uri: metadata.uri,
    }),
  ]);

  return { mint, hookProgramId };
}

/**
 * A Token-2022 mint carrying Non-Transferable and Transfer Hook together. The base
 * program accepts the init even though the pair is logically incompatible, which
 * is exactly what the compatibility matrix documents.
 */
export function createNonTransferableHookMint(svm: LiteSVM, payer: Keypair): PublicKey {
  const mintKeypair = Keypair.generate();
  const mint = mintKeypair.publicKey;
  const authority = payer.publicKey;
  const hookProgramId = Keypair.generate().publicKey;

  const mintLength = getMintLen([ExtensionType.NonTransferable, ExtensionType.TransferHook]);
  const rentLamports = svm.minimumBalanceForRentExemption(BigInt(mintLength));

  sendMintTransaction(svm, payer, mintKeypair, [
    SystemProgram.createAccount({
      fromPubkey: authority,
      newAccountPubkey: mint,
      space: mintLength,
      lamports: Number(rentLamports),
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeNonTransferableMintInstruction(mint, TOKEN_2022_PROGRAM_ID),
    createInitializeTransferHookInstruction(mint, authority, hookProgramId, TOKEN_2022_PROGRAM_ID),
    createInitializeMint2Instruction(mint, 0, authority, null, TOKEN_2022_PROGRAM_ID),
  ]);

  return mint;
}

/**
 * A Token-2022 mint carrying Scaled UI Amount, Pausable, Permanent Delegate, and
 * Mint Close Authority. No well-known mainnet mint combines these four, so this
 * builder exercises their decode paths offline against the real serialization.
 */
export function createControlsMint(svm: LiteSVM, payer: Keypair): { mint: PublicKey; delegate: PublicKey } {
  const mintKeypair = Keypair.generate();
  const mint = mintKeypair.publicKey;
  const authority = payer.publicKey;
  const delegate = Keypair.generate().publicKey;

  const fixedExtensions = [
    ExtensionType.ScaledUiAmountConfig,
    ExtensionType.PausableConfig,
    ExtensionType.PermanentDelegate,
    ExtensionType.MintCloseAuthority,
  ];
  const mintLength = getMintLen(fixedExtensions);
  const rentLamports = svm.minimumBalanceForRentExemption(BigInt(mintLength));

  sendMintTransaction(svm, payer, mintKeypair, [
    SystemProgram.createAccount({
      fromPubkey: authority,
      newAccountPubkey: mint,
      space: mintLength,
      lamports: Number(rentLamports),
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeScaledUiAmountConfigInstruction(mint, authority, DEMO_SCALED_UI_MULTIPLIER, TOKEN_2022_PROGRAM_ID),
    createInitializePausableConfigInstruction(mint, authority, TOKEN_2022_PROGRAM_ID),
    createInitializePermanentDelegateInstruction(mint, delegate, TOKEN_2022_PROGRAM_ID),
    createInitializeMintCloseAuthorityInstruction(mint, authority, TOKEN_2022_PROGRAM_ID),
    createInitializeMint2Instruction(mint, DEMO_DECIMALS, authority, authority, TOKEN_2022_PROGRAM_ID),
  ]);

  return { mint, delegate };
}

/** A classic SPL Token mint (owned by the original Token program, no extensions). */
export function createClassicMint(svm: LiteSVM, payer: Keypair): PublicKey {
  const mintKeypair = Keypair.generate();
  const mint = mintKeypair.publicKey;
  const authority = payer.publicKey;
  const rentLamports = svm.minimumBalanceForRentExemption(BigInt(MINT_SIZE));

  sendMintTransaction(svm, payer, mintKeypair, [
    SystemProgram.createAccount({
      fromPubkey: authority,
      newAccountPubkey: mint,
      space: MINT_SIZE,
      lamports: Number(rentLamports),
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMint2Instruction(mint, 6, authority, authority, TOKEN_PROGRAM_ID),
  ]);

  return mint;
}
