//! Errors returned by the allowlist transfer hook.
use solana_program::program_error::ProgramError;

/// Distinct failure modes of the allowlist hook. Different modes map to
/// different custom codes so a caller can tell them apart.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AllowlistError {
    /// The destination is not allowed: its allow PDA does not exist.
    DestinationNotAllowed,
    /// The provided allow account is not the expected per-destination PDA.
    UnexpectedAllowAccount,
    /// The signer is not the mint authority, so it may not manage the allowlist.
    UnauthorizedAllowlistManager,
}

// Custom program error codes. Distinct values, source: this program.
const DESTINATION_NOT_ALLOWED_CODE: u32 = 1;
const UNEXPECTED_ALLOW_ACCOUNT_CODE: u32 = 2;
const UNAUTHORIZED_ALLOWLIST_MANAGER_CODE: u32 = 3;

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
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn errors_map_to_distinct_codes() {
        let not_allowed: ProgramError = AllowlistError::DestinationNotAllowed.into();
        let unexpected: ProgramError = AllowlistError::UnexpectedAllowAccount.into();
        assert_ne!(not_allowed, unexpected);
        assert_eq!(not_allowed, ProgramError::Custom(DESTINATION_NOT_ALLOWED_CODE));
        assert_eq!(unexpected, ProgramError::Custom(UNEXPECTED_ALLOW_ACCOUNT_CODE));
    }
}
