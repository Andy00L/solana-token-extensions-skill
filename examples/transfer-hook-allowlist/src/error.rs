//! Errors returned by the allowlist transfer hook.
use solana_program::program_error::ProgramError;

/// Distinct failure modes of the allowlist hook. Different modes map to
/// different custom codes so a caller can tell them apart.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AllowlistError {
    /// The destination is not allowed: its allow PDA does not exist.
    DestinationNotAllowed,
    /// The provided allow account is not the expected per-(mint, destination) PDA.
    UnexpectedAllowAccount,
    /// The signer is not the mint authority, so it may not manage the allowlist.
    UnauthorizedAllowlistManager,
    /// A token account passed to Execute does not belong to the mint being
    /// transferred (account-linkage check, transfer-hook-security.md item 5).
    AccountMintMismatch,
    /// The mint account is not owned by the Token-2022 program, so its fields
    /// cannot be trusted (validate-the-mint check, transfer-hook-security.md item 4).
    UnexpectedMintOwner,
}

// Custom program error codes. Distinct values, source: this program.
const DESTINATION_NOT_ALLOWED_CODE: u32 = 1;
const UNEXPECTED_ALLOW_ACCOUNT_CODE: u32 = 2;
const UNAUTHORIZED_ALLOWLIST_MANAGER_CODE: u32 = 3;
const ACCOUNT_MINT_MISMATCH_CODE: u32 = 4;
const UNEXPECTED_MINT_OWNER_CODE: u32 = 5;

impl From<AllowlistError> for ProgramError {
    fn from(error: AllowlistError) -> Self {
        match error {
            AllowlistError::DestinationNotAllowed => {
                ProgramError::Custom(DESTINATION_NOT_ALLOWED_CODE)
            }
            AllowlistError::UnexpectedAllowAccount => {
                ProgramError::Custom(UNEXPECTED_ALLOW_ACCOUNT_CODE)
            }
            AllowlistError::UnauthorizedAllowlistManager => {
                ProgramError::Custom(UNAUTHORIZED_ALLOWLIST_MANAGER_CODE)
            }
            AllowlistError::AccountMintMismatch => {
                ProgramError::Custom(ACCOUNT_MINT_MISMATCH_CODE)
            }
            AllowlistError::UnexpectedMintOwner => {
                ProgramError::Custom(UNEXPECTED_MINT_OWNER_CODE)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn errors_map_to_distinct_codes() {
        let codes = [
            ProgramError::from(AllowlistError::DestinationNotAllowed),
            ProgramError::from(AllowlistError::UnexpectedAllowAccount),
            ProgramError::from(AllowlistError::UnauthorizedAllowlistManager),
            ProgramError::from(AllowlistError::AccountMintMismatch),
            ProgramError::from(AllowlistError::UnexpectedMintOwner),
        ];
        // Every failure mode must produce a distinct custom code.
        for (left_index, left) in codes.iter().enumerate() {
            for (right_index, right) in codes.iter().enumerate() {
                if left_index != right_index {
                    assert_ne!(left, right);
                }
            }
        }
        assert_eq!(codes[0], ProgramError::Custom(DESTINATION_NOT_ALLOWED_CODE));
        assert_eq!(codes[4], ProgramError::Custom(UNEXPECTED_MINT_OWNER_CODE));
    }
}
