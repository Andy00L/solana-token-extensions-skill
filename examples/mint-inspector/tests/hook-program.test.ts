import { type AccountInfo, PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import {
  BPF_UPGRADEABLE_LOADER_ID,
  assessHookProgram,
  buildHookProgramFinding,
  decodeProgramDataAddress,
  decodeUpgradeAuthority,
} from "../src/hook-program";

const UPGRADEABLE_LOADER = new PublicKey(BPF_UPGRADEABLE_LOADER_ID);
const FIXED_LOADER = new PublicKey("BPFLoader2111111111111111111111111111111111");
const PROGRAM_DATA_ADDRESS = new PublicKey("4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi");
const UPGRADE_AUTHORITY = new PublicKey("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin");

function account(owner: PublicKey, data: Buffer, executable = false): AccountInfo<Buffer> {
  return { owner, data, executable, lamports: 0, rentEpoch: 0 };
}

// A BPF-upgradeable Program record: u32 tag 2, then the 32-byte programdata address.
function programRecord(programDataAddress: PublicKey): AccountInfo<Buffer> {
  const data = Buffer.alloc(36);
  data.writeUInt32LE(2, 0);
  programDataAddress.toBuffer().copy(data, 4);
  return account(UPGRADEABLE_LOADER, data, true);
}

// A ProgramData record: u32 tag 3, u64 slot, then Option<Pubkey> (tag byte 12).
function programDataRecord(upgradeAuthority: PublicKey | null): AccountInfo<Buffer> {
  const data = Buffer.alloc(45);
  data.writeUInt32LE(3, 0);
  data.writeBigUInt64LE(100n, 4);
  if (upgradeAuthority === null) {
    data[12] = 0;
  } else {
    data[12] = 1;
    upgradeAuthority.toBuffer().copy(data, 13);
  }
  return account(UPGRADEABLE_LOADER, data);
}

describe("hook-program byte decoders (offline)", () => {
  it("reads the programdata address from an upgradeable Program record", () => {
    expect(decodeProgramDataAddress(programRecord(PROGRAM_DATA_ADDRESS))).toBe(PROGRAM_DATA_ADDRESS.toBase58());
  });

  it("returns null when the account is not owned by the upgradeable loader", () => {
    expect(decodeProgramDataAddress(account(FIXED_LOADER, Buffer.alloc(36)))).toBeNull();
  });

  it("decodes a live upgrade authority and a renounced (immutable) one", () => {
    expect(decodeUpgradeAuthority(programDataRecord(UPGRADE_AUTHORITY))).toEqual({
      upgradeAuthority: UPGRADE_AUTHORITY.toBase58(),
    });
    expect(decodeUpgradeAuthority(programDataRecord(null))).toEqual({ upgradeAuthority: null });
  });

  it("returns null for a ProgramData buffer that is too short or wrongly tagged", () => {
    expect(decodeUpgradeAuthority(account(UPGRADEABLE_LOADER, Buffer.alloc(10)))).toBeNull();
    const wrongTag = Buffer.alloc(45);
    wrongTag.writeUInt32LE(2, 0);
    expect(decodeUpgradeAuthority(account(UPGRADEABLE_LOADER, wrongTag))).toBeNull();
  });
});

describe("assessHookProgram (mutability verdict)", () => {
  it("flags an upgradeable hook with its authority", () => {
    const verdict = assessHookProgram(programRecord(PROGRAM_DATA_ADDRESS), programDataRecord(UPGRADE_AUTHORITY));
    expect(verdict).toEqual({ kind: "upgradeable", upgradeAuthority: UPGRADE_AUTHORITY.toBase58() });
  });

  it("treats a renounced upgrade authority as immutable", () => {
    expect(assessHookProgram(programRecord(PROGRAM_DATA_ADDRESS), programDataRecord(null))).toEqual({ kind: "immutable" });
  });

  it("treats a non-upgradeable loader as fixed (frozen bytecode)", () => {
    expect(assessHookProgram(account(FIXED_LOADER, Buffer.alloc(36), true), null)).toEqual({ kind: "fixed-loader" });
  });

  it("is undecodable (not assumed safe) when the ProgramData account is missing", () => {
    const verdict = assessHookProgram(programRecord(PROGRAM_DATA_ADDRESS), null);
    expect(verdict.kind).toBe("undecodable");
  });
});

describe("buildHookProgramFinding", () => {
  it("makes an upgradeable hook a HIGH finding naming the authority", () => {
    const finding = buildHookProgramFinding({ kind: "upgradeable", upgradeAuthority: UPGRADE_AUTHORITY.toBase58() });
    expect(finding.severity).toBe("high");
    expect(finding.extension).toBe("transfer-hook-program");
    expect(finding.detail).toContain(UPGRADE_AUTHORITY.toBase58());
  });

  it("makes an immutable hook an INFO finding, and an undecodable read a LOW caveat", () => {
    expect(buildHookProgramFinding({ kind: "immutable" }).severity).toBe("info");
    expect(buildHookProgramFinding({ kind: "fixed-loader" }).severity).toBe("info");
    expect(buildHookProgramFinding({ kind: "undecodable", reason: "x" }).severity).toBe("low");
  });
});
