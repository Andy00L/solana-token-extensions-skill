/**
 * End-to-end proof that the compiled transfer-hook allowlist program blocks a
 * non-allowlisted destination and allows it after AddToAllowlist, run through a
 * real Token-2022 transfer in LiteSVM.
 *
 * This is an executable integration script, not a vitest test, run with tsx in a
 * plain Node process. LiteSVM's native addon intermittently aborts (std::bad_alloc)
 * when it executes BPF programs inside a vitest worker pool, but is stable in a
 * plain process; the unit suites that only build and read mints stay under vitest.
 * Run with: npm run e2e (which invokes tsx on this file). Exits non-zero on failure.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMint2Instruction,
  createInitializeTransferHookInstruction,
  createMintToCheckedInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  getExtraAccountMetaAddress,
  getMintLen,
} from "@solana/spl-token";
import { FailedTransactionMetadata, LiteSVM } from "litesvm";

// The compiled hook program, produced by `cargo build-sbf` in the sibling crate.
const HOOK_SO_PATH = fileURLToPath(
  new URL("../../transfer-hook-allowlist/target/deploy/transfer_hook_allowlist.so", import.meta.url),
);

const DECIMALS = 9; // base-10 decimals for the demo token
const AIRDROP_LAMPORTS = 100_000_000_000n; // 100 SOL, unit: lamports
const MINT_AMOUNT = 1_000_000_000n; // 1 token, unit: base units
const TRANSFER_AMOUNT = 1_000_000_000n; // 1 token, unit: base units
const ALLOW_SEED = "allow"; // source: transfer_hook_allowlist::ALLOW_SEED_PREFIX
// source: transfer_hook_allowlist::ADD_TO_ALLOWLIST_DISCRIMINATOR
const ADD_TO_ALLOWLIST_DISCRIMINATOR = Uint8Array.from([240, 1, 2, 3, 4, 5, 6, 7]);

function initializeExtraMetasDiscriminator(): Buffer {
  // The SPL discriminator is the first 8 bytes of the sha256 of the namespace.
  return createHash("sha256")
    .update("spl-transfer-hook-interface:initialize-extra-account-metas")
    .digest()
    .subarray(0, 8);
}

function sendTransaction(
  svm: LiteSVM,
  instructions: TransactionInstruction[],
  feePayer: Keypair,
  extraSigners: Keypair[],
) {
  // Advance the blockhash so two otherwise-identical transactions (the blocked
  // and the allowed transfer) get distinct signatures and are not deduplicated.
  svm.expireBlockhash();
  const transaction = new Transaction();
  transaction.add(...instructions);
  transaction.recentBlockhash = svm.latestBlockhash();
  transaction.feePayer = feePayer.publicKey;
  transaction.sign(feePayer, ...extraSigners);
  return svm.sendTransaction(transaction);
}

function didFail(result: ReturnType<LiteSVM["sendTransaction"]>): boolean {
  return result instanceof FailedTransactionMetadata;
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[e2e] assertion failed: ${message}`);
  }
}

function runTransferHookE2e(): void {
  const svm = new LiteSVM();
  const hookProgramId = Keypair.generate().publicKey;
  svm.addProgramFromFile(hookProgramId, HOOK_SO_PATH);

  const payer = Keypair.generate();
  svm.airdrop(payer.publicKey, AIRDROP_LAMPORTS);
  const recipient = Keypair.generate();

  // 1. Create a Token-2022 mint with the transfer hook pointing at our program.
  const mint = Keypair.generate();
  const mintLength = getMintLen([ExtensionType.TransferHook]);
  const rentLamports = svm.minimumBalanceForRentExemption(BigInt(mintLength));
  const created = sendTransaction(
    svm,
    [
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: mint.publicKey,
        space: mintLength,
        lamports: Number(rentLamports),
        programId: TOKEN_2022_PROGRAM_ID,
      }),
      createInitializeTransferHookInstruction(mint.publicKey, payer.publicKey, hookProgramId, TOKEN_2022_PROGRAM_ID),
      createInitializeMint2Instruction(mint.publicKey, DECIMALS, payer.publicKey, payer.publicKey, TOKEN_2022_PROGRAM_ID),
    ],
    payer,
    [mint],
  );
  assert(!didFail(created), "mint creation should succeed");

  // 2. Initialize the ExtraAccountMetaList through the hook's own instruction.
  const validationPda = getExtraAccountMetaAddress(mint.publicKey, hookProgramId);
  const emptyListLength = Buffer.alloc(4); // u32 length 0; the hook writes its own list
  const initMetas = new TransactionInstruction({
    programId: hookProgramId,
    keys: [
      { pubkey: validationPda, isSigner: false, isWritable: true },
      { pubkey: mint.publicKey, isSigner: false, isWritable: false },
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([initializeExtraMetasDiscriminator(), emptyListLength]),
  });
  assert(!didFail(sendTransaction(svm, [initMetas], payer, [])), "ExtraAccountMetaList init should succeed");

  // 3. Mint to the payer, and create the recipient account.
  const payerAccount = getAssociatedTokenAddressSync(mint.publicKey, payer.publicKey, false, TOKEN_2022_PROGRAM_ID);
  const recipientAccount = getAssociatedTokenAddressSync(mint.publicKey, recipient.publicKey, false, TOKEN_2022_PROGRAM_ID);
  const minted = sendTransaction(
    svm,
    [
      createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, payerAccount, payer.publicKey, mint.publicKey, TOKEN_2022_PROGRAM_ID),
      createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, recipientAccount, recipient.publicKey, mint.publicKey, TOKEN_2022_PROGRAM_ID),
      createMintToCheckedInstruction(mint.publicKey, payerAccount, payer.publicKey, MINT_AMOUNT, DECIMALS, [], TOKEN_2022_PROGRAM_ID),
    ],
    payer,
    [],
  );
  assert(!didFail(minted), "mint-to and ATA creation should succeed");

  // The allow PDA is scoped to (mint, destination), matching the hook's seeds.
  const [allowPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(ALLOW_SEED), mint.publicKey.toBuffer(), recipientAccount.toBuffer()],
    hookProgramId,
  );

  // A transfer-with-hook instruction: a base transferChecked plus the resolved
  // extra account, the hook program, and the validation account, in that order.
  function buildTransfer(): TransactionInstruction {
    const instruction = createTransferCheckedInstruction(
      payerAccount,
      mint.publicKey,
      recipientAccount,
      payer.publicKey,
      TRANSFER_AMOUNT,
      DECIMALS,
      [],
      TOKEN_2022_PROGRAM_ID,
    );
    instruction.keys.push(
      { pubkey: allowPda, isSigner: false, isWritable: false },
      { pubkey: hookProgramId, isSigner: false, isWritable: false },
      { pubkey: validationPda, isSigner: false, isWritable: false },
    );
    return instruction;
  }

  // 4. BLOCK: the destination is not allowlisted, so the hook denies the transfer.
  assert(didFail(sendTransaction(svm, [buildTransfer()], payer, [])), "transfer to a non-allowlisted destination should be blocked");

  // 5. The mint authority allowlists the destination, creating its allow PDA.
  const addToAllowlist = new TransactionInstruction({
    programId: hookProgramId,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: mint.publicKey, isSigner: false, isWritable: false },
      { pubkey: allowPda, isSigner: false, isWritable: true },
      { pubkey: recipientAccount, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(ADD_TO_ALLOWLIST_DISCRIMINATOR),
  });
  assert(!didFail(sendTransaction(svm, [addToAllowlist], payer, [])), "AddToAllowlist should succeed");
  const allowAccount = svm.getAccount(allowPda);
  assert(allowAccount !== null, "allow PDA should exist after AddToAllowlist");
  assert(allowAccount?.owner.equals(hookProgramId) === true, "allow PDA should be owned by the hook program");

  // 6. ALLOW: the same transfer now succeeds.
  assert(!didFail(sendTransaction(svm, [buildTransfer()], payer, [])), "transfer to an allowlisted destination should succeed");
}

function main(): void {
  if (!existsSync(HOOK_SO_PATH)) {
    process.stdout.write(`[e2e] skipped: compiled hook not found at ${HOOK_SO_PATH} (run cargo build-sbf first)\n`);
    return;
  }
  runTransferHookE2e();
  process.stdout.write("[e2e] transfer hook allowlist: blocked then allowed, 1 scenario passed\n");
}

main();
