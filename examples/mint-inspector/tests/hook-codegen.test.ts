import { describe, expect, it } from "vitest";
import { classifyExtraMeta, formatHookCodegen, generateHookTransferCodegen } from "../src/hook-codegen";

describe("classifyExtraMeta", () => {
  it("treats a literal pubkey (discriminator 0) as statically resolvable", () => {
    const result = classifyExtraMeta(0);
    expect(result.kind).toBe("literal-pubkey");
    expect(result.staticallyResolvable).toBe(true);
  });

  it("treats a hook PDA (discriminator 1) as statically resolvable", () => {
    expect(classifyExtraMeta(1).kind).toBe("pda-on-hook");
    expect(classifyExtraMeta(1).staticallyResolvable).toBe(true);
  });

  it("treats a pubkey-from-account-data (discriminator 2) as runtime-only", () => {
    const result = classifyExtraMeta(2);
    expect(result.kind).toBe("pubkey-from-account-data");
    expect(result.staticallyResolvable).toBe(false);
  });

  it("treats an external PDA (discriminator >= 0x80) as runtime-only", () => {
    const result = classifyExtraMeta(0x80);
    expect(result.kind).toBe("external-pda");
    expect(result.staticallyResolvable).toBe(false);
  });

  it("flags an unrecognized discriminator as unknown and runtime-only", () => {
    const result = classifyExtraMeta(50);
    expect(result.kind).toBe("unknown");
    expect(result.staticallyResolvable).toBe(false);
  });
});

describe("generateHookTransferCodegen", () => {
  it("emits a correct transfer client that resolves against the Execute account set", () => {
    const result = generateHookTransferCodegen({
      mint: "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo",
      hookProgramId: "wns1gDLt8fgLcGhWi5MqAqgXpwEP1JftKE9eZnXS1HM",
      decimals: 6,
    });

    expect(result.decimals).toBe(6);
    // Uses the maintained resolver and the Token-2022 program id.
    expect(result.code).toContain("createTransferCheckedWithTransferHookInstruction");
    expect(result.code).toContain("TOKEN_2022_PROGRAM_ID");
    expect(result.code).toContain("2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo");
    // The Execute account model is surfaced, with the validation account in it.
    expect(result.executeAccountOrder.some((account) => account.includes("validation"))).toBe(true);
    // The #6064 resolution pitfall is documented.
    expect(result.caveats.join(" ")).toContain("Execute account list");
  });

  it("defaults decimals to 9", () => {
    const result = generateHookTransferCodegen({ mint: "MintX", hookProgramId: "HookX" });
    expect(result.decimals).toBe(9);
  });

  it("renders a report with the account order and caveats", () => {
    const report = formatHookCodegen(
      generateHookTransferCodegen({ mint: "MintX", hookProgramId: "HookX" }),
    );
    expect(report).toContain("Execute account order");
    expect(report).toContain("Resolution caveats");
    expect(report).toContain("createTransferCheckedWithTransferHookInstruction");
  });
});
