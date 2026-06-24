//! A fail-closed Token-2022 transfer hook that enforces a per-destination allowlist,
//! scoped to the mint so two mints sharing this hook never share an allowlist.
//!
//! Security properties (see ../../skill/transfer-hook-security.md):
//! - Fail closed: Execute denies unless the destination's allow PDA exists.
//! - Gated on transfer: Execute rejects unless the token accounts are transferring,
//!   so it cannot be called standalone.
//! - Read-only accounts: the hook treats every transfer account as read only and
//!   never assumes a signer.
//! - Validated mint: AddToAllowlist rejects a mint account not owned by the
//!   Token-2022 program before trusting its authority, and Execute confirms each
//!   token account belongs to the mint (checklist items 4 and 5).
//! - PDA validation: the allow account must equal the expected per-(mint,
//!   destination) PDA, so two mints sharing this hook never share an allowlist.

// The Solana entrypoint macro emits internal `custom-heap` and `custom-panic`
// cfgs that newer rustc flags as unexpected. They are benign macro internals.
#![allow(unexpected_cfgs)]

mod error;
mod processor;

use solana_program::{
    account_info::AccountInfo, entrypoint, entrypoint::ProgramResult, pubkey::Pubkey,
};

pub use error::AllowlistError;

/// Seed prefix for an allow account, keyed by (mint, destination). Source: this program.
pub const ALLOW_SEED_PREFIX: &[u8] = b"allow";

/// Program-specific instruction tag for AddToAllowlist. Chosen so it does not
/// collide with the transfer-hook interface discriminators (which are sha256
/// derived). The off-chain client prepends these eight bytes to the data.
pub const ADD_TO_ALLOWLIST_DISCRIMINATOR: [u8; 8] = [240, 1, 2, 3, 4, 5, 6, 7];

entrypoint!(process_instruction);

fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    processor::process(program_id, accounts, instruction_data)
}
