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
import { describe, expect, it } from "vitest";

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

describe.skipIf(!existsSync(HOOK_SO_PATH))("transfer hook allowlist e2e", () => {
  it("blocks a non-allowlisted destination, then allows it after AddToAllowlist", () => {
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
    expect(didFail(created)).toBe(false);

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
    expect(didFail(sendTransaction(svm, [initMetas], payer, []))).toBe(false);

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
    expect(didFail(minted)).toBe(false);

    const [allowPda] = PublicKey.findProgramAddressSync(
      [Buffer.from(ALLOW_SEED), recipientAccount.toBuffer()],
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
    expect(didFail(sendTransaction(svm, [buildTransfer()], payer, []))).toBe(true);

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
    expect(didFail(sendTransaction(svm, [addToAllowlist], payer, []))).toBe(false);
    const allowAccount = svm.getAccount(allowPda);
    expect(allowAccount).not.toBeNull();
    expect(allowAccount?.owner.equals(hookProgramId)).toBe(true);

    // 6. ALLOW: the same transfer now succeeds.
    expect(didFail(sendTransaction(svm, [buildTransfer()], payer, []))).toBe(false);
  });
});
