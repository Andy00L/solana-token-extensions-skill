/**
 * Real Solana mainnet-beta mint accounts, captured once on 2026-06-22 via
 * getAccountInfo (base64 encoding) from https://api.mainnet-beta.solana.com.
 * Public on-chain data, embedded so the decoder and the scored eval runner are
 * proven against real, widely known mints fully offline and deterministically
 * (no IO). Consumed by the test suite (tests/real-mint-decode.test.ts) and the
 * eval runner (src/evals.ts, the npm run evals tool). To refresh, re-run
 * getAccountInfo for each address and replace dataBase64.
 */
import { type AccountInfo, PublicKey } from "@solana/web3.js";

export type RealMintFixture = {
  name: string;
  address: string;
  owner: string;
  dataBase64: string;
};

export const REAL_MINT_FIXTURES: RealMintFixture[] = [
  {
    name: "PYUSD",
    address: "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo",
    owner: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
    dataBase64:
      "AQAAAGyRqkllkBL4q+lh7CS2EHSSZUdTL/CU7VtpOYLbmHMTZV9F8/ZcAgAGAQEAAAAXhTJh72q4Uypn8FOGWq0xKT/PB88SCrW5oVcGVI3AKwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQMAIAAXhTJh72q4Uypn8FOGWq0xKT/PB88SCrW5oVcGVI3AKwwAIAAXhTJh72q4Uypn8FOGWq0xKT/PB88SCrW5oVcGVI3AKwEAbAAXhTJh72q4Uypn8FOGWq0xKT/PB88SCrW5oVcGVI3AKxeFMmHvarhTKmfwU4ZarTEpP88HzxIKtbmhVwZUjcArAAAAAAAAAABdAgAAAAAAAAAAAAAAAAAAAABdAgAAAAAAAAAAAAAAAAAAAAAEAEEAF4UyYe9quFMqZ/BThlqtMSk/zwfPEgq1uaFXBlSNwCsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAIEAF4UyYe9quFMqZ/BThlqtMSk/zwfPEgq1uaFXBlSNwCscN+ZDO3ME3YJzeuQNm4vzxJ9bDmxJqNUzKLPlBpAcVwEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgBAABeFMmHvarhTKmfwU4ZarTEpP88HzxIKtbmhVwZUjcArAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAASAEAAF4UyYe9quFMqZ/BThlqtMSk/zwfPEgq1uaFXBlSNwCsXkkg7bIoqh7dHHYFPlZH5OVyECpzj2fTVun06S4p0nhMArgAXhTJh72q4Uypn8FOGWq0xKT/PB88SCrW5oVcGVI3AKxeSSDtsiiqHt0cdgU+Vkfk5XIQKnOPZ9NW6fTpLinSeCgAAAFBheVBhbCBVU0QFAAAAUFlVU0RPAAAAaHR0cHM6Ly90b2tlbi1tZXRhZGF0YS5wYXhvcy5jb20vcHl1c2RfbWV0YWRhdGEvcHJvZC9zb2xhbmEvcHl1c2RfbWV0YWRhdGEuanNvbgAAAAA=",
  },
  {
    name: "USDC",
    address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    dataBase64:
      "AQAAAJj+huiNm+Lqi8HMpIeLKYjCQPUrhCS/tA7Rot3LXhmb7QfELUMcHQAGAQEAAABicKqKWcWUBbRShshncubNEm6bil06OFNtN/e0FOi2Zw==",
  },
  {
    name: "BERN",
    address: "CKfatsPMUf8SkiURsDXs7eK6GWb4Jsd6UDbs7twMCWxo",
    owner: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
    dataBase64:
      "AAAAAF6FlBDp84quKJTnIC3eZq7d8SbOoKlPCfCAsA30E9mWuDXjWFJWAAAFAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEAbABehZQQ6fOKriiU5yAt3mau3fEmzqCpTwnwgLAN9BPZll6FlBDp84quKJTnIC3eZq7d8SbOoKlPCfCAsA30E9mWCxxYXAQAAABwAgAAAAAAAACg3sWtyTU2pAG6AgAAAAAAAACg3sWtyTU2DQE=",
  },
  {
    name: "sUSD",
    address: "susdabGDNbhrnCa6ncrYo81u4s9GM8ecK2UwMyZiq4X",
    owner: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
    dataBase64:
      "AQAAANpjM6+BanntT5UvyxF9uP1+LQ1a+5Aldw2IJuYeMmRjsppk15wBAAAGAQEAAADaYzOvgWp57U+VL8sRfbj9fi0NWvuQJXcNiCbmHjJkYwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAARIAQAAqpgX3nueQKh9NhKxwqZr3XUzv+pWuMzy8NKpH1cWgRQ0K0vbypqnvQ02Wv3mNmdmCIhiPOmJy5kxC6nYpI330CgA0ANpjM6+BanntT5UvyxF9uP1+LQ1a+5Aldw2IJuYeMmRj5jH3ZgAAAADlAtZKOWoAAAAAPwoTAI8A2mMzr4Fqee1PlS/LEX24/X4tDVr7kCV3DYgm5h4yZGMNCtL28qap70NNlr95jZnZgiIYjzpicuZMQup2KSN99AsAAABTb2xheWVyIFVTRAQAAABzVVNEMAAAAGh0dHBzOi8vbWV0YWRhdGEuc29sYXllci5vcmcvc3VzZC9tZXRhLWRhdGEuanNvbgAAAAA=",
  },
  {
    name: "BNDRG",
    address: "8eDYWjDKmCR5B3UJm95gaG8zCdT5anWakTZG1PyWpBm9",
    owner: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
    dataBase64:
      "AQAAAH1kgRel7ALi6T9rEfJZSGlLkU2sdtK8QqtO+0JWI8m+AQAAAAAAAAAAAQEAAAB9ZIEXpewC4uk/axHyWUhpS5FNrHbSvEKrTvtCViPJvgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAARIAQACX4ARhCCT8nQBhGjHVkghPAfMrTuW/bKUigDREzgaH6nGKey+8mUgwuXCnXtvpSrBELPYZs+hb+PaMsAao3BkQFgBAAJfgBGEIJPydAGEaMdWSCE8B8ytO5b9spSKANETOBofqwWsDJaBHX4Bn8WCMoY2Z7++zlora8jXIBi1CvQSCCUYOAEAAl+AEYQgk/J0AYRox1ZIITwHzK07lv2ylIoA0RM4Gh+oOCThnJ0f1l+ELDEJ3FBb+fTE6tbuMqViumiKX0XZNHAMAIAB9ZIEXpewC4uk/axHyWUhpS5FNrHbSvEKrTvtCViPJvhMA+wCX4ARhCCT8nQBhGjHVkghPAfMrTuW/bKUigDREzgaH6nGKey+8mUgwuXCnXtvpSrBELPYZs+hb+PaMsAao3BkQEAAAAEJhbmFuYSBEcmFnb24gIzIFAAAAQk5EUkdAAAAAaHR0cHM6Ly9iZS5yYWZmbGVzLnRoZXByaW1lcy5pby9zdGF0aWMvYmFuYW5hLWRyYWdvbi9tZXRhLzEuanNvbgIAAAAUAAAAcm95YWx0eV9iYXNpc19wb2ludHMDAAAANTAwLAAAAEJEcmdnamY0SmZROVI3a21ZdUd6VnRXZTdzNFNaODZhdWJxc3ZtdXZEMXRtAwAAADEwMA==",
  },
  {
    name: "USDG",
    address: "2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH",
    owner: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
    dataBase64:
      "AQAAACW7+VRuvzdb7gNflgBBldomzRryvPU2iRUDDIKjMLX+wm88kXd/AgAGAQEAAAAXhTJh72q4Uypn8FOGWq0xKT/PB88SCrW5oVcGVI3AKwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQMAIAAXhTJh72q4Uypn8FOGWq0xKT/PB88SCrW5oVcGVI3AKwwAIAAXhTJh72q4Uypn8FOGWq0xKT/PB88SCrW5oVcGVI3AKwEAbAAXhTJh72q4Uypn8FOGWq0xKT/PB88SCrW5oVcGVI3AKxeFMmHvarhTKmfwU4ZarTEpP88HzxIKtbmhVwZUjcArAAAAAAAAAADSAgAAAAAAAAAAAAAAAAAAAADSAgAAAAAAAAAAAAAAAAAAAAAEAEEAF4UyYe9quFMqZ/BThlqtMSk/zwfPEgq1uaFXBlSNwCsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAIEAF4UyYe9quFMqZ/BThlqtMSk/zwfPEgq1uaFXBlSNwCsm0cx6nT0Kf+Fu2TflaERKcxbP98dKRVQu4LCksu7ubQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgBAABeFMmHvarhTKmfwU4ZarTEpP88HzxIKtbmhVwZUjcArAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAASAEAAF4UyYe9quFMqZ/BThlqtMSk/zwfPEgq1uaFXBlSNwCscLuZ/Ek327fKp0r9eOlM8dwG1j42qlXIQoeWwYYzSvhMArgAXhTJh72q4Uypn8FOGWq0xKT/PB88SCrW5oVcGVI3AKxwu5n8STfbt8qnSv146Uzx3AbWPjaqVchCh5bBhjNK+DQAAAEdsb2JhbCBEb2xsYXIEAAAAVVNER00AAABodHRwczovL3Rva2VuLW1ldGFkYXRhLnBheG9zLmNvbS91c2RnX21ldGFkYXRhL3Byb2Qvc29sYW5hL3VzZGdfbWV0YWRhdGEuanNvbgAAAAA=",
  },
  {
    name: "USDT",
    address: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    dataBase64:
      "AQAAAAXqnPFs5BGY8aSZN8iMNwqU1K//ibW6y470XmMku3j3+rXRQGCkDQAGAQEAAAAF6pzxbOQRmPGkmTfIjDcKlNSv/4m1usuO9F5jJLt49w==",
  },
  {
    name: "WSOL",
    address: "So11111111111111111111111111111111111111112",
    owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    dataBase64:
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==",
  },
  {
    name: "BONK",
    address: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    dataBase64:
      "AAAAAHlZUWfaSAxa4TRFAdIRt3NjQOP73wDs3mO2TciKzC8c7Q2mKeoAHnoFAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==",
  },
  {
    name: "JUP",
    address: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
    owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    dataBase64:
      "AAAAAAR52GkzETukAZvPEQhyTvOJYJx7N+gEvMOLMHR3hqi8133mHFlhGAAGAQAAAAAEedhpMxE7pAGbzxEIck7ziWCcezfoBLzDizB0d4aovA==",
  },
];

/** Rebuild an AccountInfo<Buffer> from a captured fixture for offline decoding. */
export function fixtureAccountInfo(fixture: RealMintFixture): AccountInfo<Buffer> {
  return {
    owner: new PublicKey(fixture.owner),
    data: Buffer.from(fixture.dataBase64, "base64"),
    executable: false,
    lamports: 0,
    rentEpoch: 0,
  };
}

/** The mint address of a captured fixture as a PublicKey. */
export function fixtureAddress(fixture: RealMintFixture): PublicKey {
  return new PublicKey(fixture.address);
}

/** Look up a captured fixture by name, or null when none matches. */
export function fixtureByName(name: string): RealMintFixture | null {
  return REAL_MINT_FIXTURES.find((fixture) => fixture.name === name) ?? null;
}

// The WNS (Wen New Standard) transfer-hook program that the BNDRG fixture points at,
// captured on 2026-06-28. The program account is an UpgradeableLoaderState::Program
// record (tag 2) storing its ProgramData address; the 45-byte ProgramData header
// (tag 3 + slot + Option<Pubkey>) carries the upgrade authority. Enough to decode the
// hook's mutability offline. As captured, the hook is upgradeable: its bytecode can
// be swapped by the authority below, which is exactly the second-hop risk the
// inspector now surfaces.
export const WNS_HOOK_PROGRAM = {
  programId: "wns1gDLt8fgLcGhWi5MqAqgXpwEP1JftKE9eZnXS1HM",
  programDataAddress: "BPxcNmr1PtocxmV9tY8cCUR6PMhAnaAajd6NNKqQj5Ae",
  upgradeAuthority: "yaoYaopKcDsMxnjbT1jBdvYz6XRmjPdAPHczsCraERc",
  loaderOwner: "BPFLoaderUpgradeab1e11111111111111111111111",
  programBase64: "AgAAAJp2hoCtSw5VXF5b+HerQc0LGJ9vmAMM3jBChS0V4C+/",
  programDataBase64: "AwAAAPDfmBAAAAAAAQ5+vvPOYKYRN+zRJnFe2/3gM+wm5qDDWD+yEd+S729/",
} as const;

/** Rebuild an AccountInfo<Buffer> for a captured BPF-loader (program/programdata) blob. */
export function loaderAccountInfo(base64: string, executable: boolean): AccountInfo<Buffer> {
  return {
    owner: new PublicKey(WNS_HOOK_PROGRAM.loaderOwner),
    data: Buffer.from(base64, "base64"),
    executable,
    lamports: 0,
    rentEpoch: 0,
  };
}
