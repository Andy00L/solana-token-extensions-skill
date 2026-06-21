//! A fail-closed Token-2022 transfer hook that enforces a per-destination allowlist.
//!
//! Security properties (see ../../skill/transfer-hook-security.md):
//! - Fail closed: Execute denies unless the destination's allow PDA exists.
//! - Gated on transfer: Execute rejects unless the token accounts are transferring,
//!   so it cannot be called standalone.
//! - Read-only accounts: the hook treats every transfer account as read only and
//!   never assumes a signer.
//! - PDA validation: the allow account must equal the expected per-destination PDA.

// The Solana entrypoint macro emits internal `custom-heap` and `custom-panic`
// cfgs that newer rustc flags as unexpected. They are benign macro internals.
#![allow(unexpected_cfgs)]

mod error;
mod processor;

use solana_program::{
    account_info::AccountInfo, entrypoint, entrypoint::ProgramResult, pubkey::Pubkey,
};

pub use error::AllowlistError;

/// Seed prefix for a per-destination allow account. Source: this program.
pub const ALLOW_SEED_PREFIX: &[u8] = b"allow";

entrypoint!(process_instruction);

fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    processor::process(program_id, accounts, instruction_data)
}
