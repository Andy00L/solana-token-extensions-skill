//! Instruction processing for the allowlist transfer hook.
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    program::invoke_signed,
    program_error::ProgramError,
    pubkey::Pubkey,
    rent::Rent,
    sysvar::Sysvar,
};
use solana_system_interface::instruction::create_account;
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta, seeds::Seed, state::ExtraAccountMetaList,
};
use spl_token_2022::{
    extension::{
        transfer_hook::TransferHookAccount, BaseStateWithExtensions, PodStateWithExtensions,
    },
    pod::{PodAccount, PodMint},
};
use spl_transfer_hook_interface::{
    collect_extra_account_metas_signer_seeds, error::TransferHookError,
    get_extra_account_metas_address_and_bump_seed,
    instruction::{ExecuteInstruction, TransferHookInstruction},
};

use crate::{error::AllowlistError, ADD_TO_ALLOWLIST_DISCRIMINATOR, ALLOW_SEED_PREFIX};

// Account indices in the Execute instruction: source=0, mint=1, destination=2,
// owner=3, validation=4. Source: spl-transfer-hook-interface Execute account ordering.
const MINT_ACCOUNT_INDEX: u8 = 1;
const DESTINATION_ACCOUNT_INDEX: u8 = 2;

pub fn process(program_id: &Pubkey, accounts: &[AccountInfo], input: &[u8]) -> ProgramResult {
    if input.starts_with(&ADD_TO_ALLOWLIST_DISCRIMINATOR) {
        return process_add_to_allowlist(program_id, accounts);
    }
    let instruction = TransferHookInstruction::unpack(input)?;
    match instruction {
        TransferHookInstruction::Execute { amount } => {
            process_execute(program_id, accounts, amount)
        }
        TransferHookInstruction::InitializeExtraAccountMetaList { .. } => {
            process_initialize(program_id, accounts)
        }
        TransferHookInstruction::UpdateExtraAccountMetaList { .. } => {
            Err(ProgramError::InvalidInstructionData)
        }
    }
}

/// Write this program's fixed validation list: one allow account, the PDA
/// `[ALLOW_SEED_PREFIX, destination]` under this program. We ignore any
/// client-provided list so the rule is fixed by the program, not the caller.
fn process_initialize(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let extra_metas_info = next_account_info(account_info_iter)?;
    let mint_info = next_account_info(account_info_iter)?;
    let authority_info = next_account_info(account_info_iter)?;
    let system_program_info = next_account_info(account_info_iter)?;

    if !authority_info.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let (expected_pda, bump) =
        get_extra_account_metas_address_and_bump_seed(mint_info.key, program_id);
    if expected_pda != *extra_metas_info.key {
        return Err(ProgramError::InvalidSeeds);
    }

    let extra_metas = [ExtraAccountMeta::new_with_seeds(
        &[
            Seed::Literal {
                bytes: ALLOW_SEED_PREFIX.to_vec(),
            },
            // Scope the allow PDA to the mint as well as the destination, so a hook
            // program shared by two mints never shares one allowlist (checklist item 4).
            Seed::AccountKey {
                index: MINT_ACCOUNT_INDEX,
            },
            Seed::AccountKey {
                index: DESTINATION_ACCOUNT_INDEX,
            },
        ],
        false, // not a signer
        false, // not writable: the hook only reads it
    )?];

    let account_size = ExtraAccountMetaList::size_of(extra_metas.len())?;
    let account_size_u64 =
        u64::try_from(account_size).map_err(|_| ProgramError::InvalidAccountData)?;
    let rent = Rent::get()?;
    let lamports = rent.minimum_balance(account_size);

    let bump_seed = [bump];
    let signer_seeds = collect_extra_account_metas_signer_seeds(mint_info.key, &bump_seed);
    invoke_signed(
        &create_account(
            authority_info.key,
            extra_metas_info.key,
            lamports,
            account_size_u64,
            program_id,
        ),
        &[
            authority_info.clone(),
            extra_metas_info.clone(),
            system_program_info.clone(),
        ],
        &[&signer_seeds],
    )?;

    let mut data = extra_metas_info.try_borrow_mut_data()?;
    ExtraAccountMetaList::init::<ExecuteInstruction>(&mut data, &extra_metas)?;
    Ok(())
}

/// Add a destination token account to the allowlist by creating its allow PDA.
/// Only the mint authority may call this; the created PDA's presence is what the
/// Execute handler later checks. Source: ../../skill/transfer-hook-security.md.
fn process_add_to_allowlist(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let authority_info = next_account_info(account_info_iter)?;
    let mint_info = next_account_info(account_info_iter)?;
    let allow_info = next_account_info(account_info_iter)?;
    let destination_info = next_account_info(account_info_iter)?;
    let system_program_info = next_account_info(account_info_iter)?;

    if !authority_info.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    // Validate the mint before trusting any field on it. An account whose owner is
    // not the Token-2022 program can be crafted to carry a forged mint authority,
    // which would make the authority gate below meaningless (checklist item 4;
    // rules/rust.md "check account ownership"). Compare by bytes so the program
    // id's Address type and the account's Pubkey type line up.
    if mint_info.owner.to_bytes() != spl_token_2022::id().to_bytes() {
        return Err(AllowlistError::UnexpectedMintOwner.into());
    }

    // Only the mint authority may manage the allowlist. Compare by bytes so the
    // mint's Address type and the account's Pubkey type line up.
    {
        let mint_data = mint_info.try_borrow_data()?;
        let mint = PodStateWithExtensions::<PodMint>::unpack(&mint_data)?;
        let mint_authority = mint
            .base
            .mint_authority
            .ok_or(AllowlistError::UnauthorizedAllowlistManager)?;
        if mint_authority.to_bytes() != authority_info.key.to_bytes() {
            return Err(AllowlistError::UnauthorizedAllowlistManager.into());
        }
    }

    // The allow PDA is scoped to (mint, destination), so the allowlist belongs to
    // this mint alone (checklist item 4).
    let (expected_allow, bump) = Pubkey::find_program_address(
        &[
            ALLOW_SEED_PREFIX,
            mint_info.key.as_ref(),
            destination_info.key.as_ref(),
        ],
        program_id,
    );
    if expected_allow != *allow_info.key {
        return Err(AllowlistError::UnexpectedAllowAccount.into());
    }
    if !allow_info.data_is_empty() {
        return Ok(()); // already allowlisted; adding again is a no-op
    }

    let bump_seed = [bump];
    let signer_seeds = [
        ALLOW_SEED_PREFIX,
        mint_info.key.as_ref(),
        destination_info.key.as_ref(),
        &bump_seed,
    ];
    let space: usize = 1; // a single marker byte; its presence means allowed
    let space_u64 = u64::try_from(space).map_err(|_| ProgramError::InvalidAccountData)?;
    let rent = Rent::get()?;
    let lamports = rent.minimum_balance(space);
    invoke_signed(
        &create_account(authority_info.key, allow_info.key, lamports, space_u64, program_id),
        &[
            authority_info.clone(),
            allow_info.clone(),
            system_program_info.clone(),
        ],
        &[&signer_seeds],
    )?;
    Ok(())
}

/// Allow a transfer only when the token accounts are transferring and the
/// destination's allow PDA exists. Deny by default.
fn process_execute(program_id: &Pubkey, accounts: &[AccountInfo], _amount: u64) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let source_info = next_account_info(account_info_iter)?;
    let mint_info = next_account_info(account_info_iter)?;
    let destination_info = next_account_info(account_info_iter)?;
    let _owner_info = next_account_info(account_info_iter)?;
    let _validation_info = next_account_info(account_info_iter)?;
    let allow_info = next_account_info(account_info_iter)?;

    // Gate on a real transfer (so Execute cannot be invoked standalone) and confirm
    // each token account belongs to this mint, so account order alone is never
    // trusted (checklist items 2 and 5).
    assert_transferring_account_of_mint(source_info, mint_info.key)?;
    assert_transferring_account_of_mint(destination_info, mint_info.key)?;

    // The allow account must be the expected per-(mint, destination) PDA.
    let (expected_allow, _bump) = Pubkey::find_program_address(
        &[
            ALLOW_SEED_PREFIX,
            mint_info.key.as_ref(),
            destination_info.key.as_ref(),
        ],
        program_id,
    );
    if expected_allow != *allow_info.key {
        return Err(AllowlistError::UnexpectedAllowAccount.into());
    }

    // Fail closed: allow only when the PDA exists, owned by this program with data.
    if allow_info.owner != program_id || allow_info.data_is_empty() {
        return Err(AllowlistError::DestinationNotAllowed.into());
    }
    Ok(())
}

/// Reject unless the token account belongs to `expected_mint` (checklist item 5)
/// and carries the TransferHookAccount extension with the transferring flag set
/// (checklist item 2). Source: transfer-hook-security.md, checklist items 2 and 5.
fn assert_transferring_account_of_mint(
    account_info: &AccountInfo,
    expected_mint: &Pubkey,
) -> ProgramResult {
    let account_data = account_info.try_borrow_data()?;
    let account = PodStateWithExtensions::<PodAccount>::unpack(&account_data)?;
    // Compare by bytes so the account's Address type and the Pubkey type line up.
    if account.base.mint.to_bytes() != expected_mint.to_bytes() {
        return Err(AllowlistError::AccountMintMismatch.into());
    }
    let extension = account.get_extension::<TransferHookAccount>()?;
    if bool::from(extension.transferring) {
        Ok(())
    } else {
        Err(TransferHookError::ProgramCalledOutsideOfTransfer.into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_program_id() -> Pubkey {
        Pubkey::new_from_array([7u8; 32])
    }

    #[test]
    fn allow_pda_is_deterministic_and_scoped_to_mint_and_destination() {
        let program = test_program_id();
        let mint = Pubkey::new_from_array([8u8; 32]);
        let destination = Pubkey::new_from_array([9u8; 32]);
        let derive = |seed_mint: &Pubkey, seed_destination: &Pubkey| {
            Pubkey::find_program_address(
                &[ALLOW_SEED_PREFIX, seed_mint.as_ref(), seed_destination.as_ref()],
                &program,
            )
            .0
        };
        // Deterministic for the same (mint, destination).
        assert_eq!(derive(&mint, &destination), derive(&mint, &destination));
        // A different destination yields a different PDA.
        let other_destination = Pubkey::new_from_array([10u8; 32]);
        assert_ne!(derive(&mint, &destination), derive(&mint, &other_destination));
        // The same destination under a different mint yields a different PDA, so two
        // mints sharing this hook never share an allowlist (checklist item 4).
        let other_mint = Pubkey::new_from_array([11u8; 32]);
        assert_ne!(derive(&mint, &destination), derive(&other_mint, &destination));
    }

    #[test]
    fn validation_list_builds_and_initializes() {
        // Mirror the program's allow-PDA seeds: literal, mint (index 1), destination (index 2).
        let metas = [ExtraAccountMeta::new_with_seeds(
            &[
                Seed::Literal {
                    bytes: ALLOW_SEED_PREFIX.to_vec(),
                },
                Seed::AccountKey {
                    index: MINT_ACCOUNT_INDEX,
                },
                Seed::AccountKey {
                    index: DESTINATION_ACCOUNT_INDEX,
                },
            ],
            false,
            false,
        )
        .unwrap()];
        let size = ExtraAccountMetaList::size_of(metas.len()).unwrap();
        assert!(size > 0);
        let mut buffer = vec![0u8; size];
        ExtraAccountMetaList::init::<ExecuteInstruction>(&mut buffer, &metas).unwrap();
    }

    #[test]
    fn process_rejects_empty_input() {
        let program = test_program_id();
        assert!(process(&program, &[], &[]).is_err());
    }

    #[test]
    fn execute_denies_when_not_transferring() {
        // Six accounts with empty token data: the account reads fail closed (empty
        // data does not unpack as a token account of the mint, and carries no
        // transferring flag), so Execute denies. Source: transfer-hook-security.md items 2, 5.
        let program = test_program_id();
        let owner = Pubkey::new_from_array([0u8; 32]); // the system program id
        let source_key = Pubkey::new_from_array([21u8; 32]);
        let mint_key = Pubkey::new_from_array([22u8; 32]);
        let destination_key = Pubkey::new_from_array([23u8; 32]);
        let authority_key = Pubkey::new_from_array([24u8; 32]);
        let validation_key = Pubkey::new_from_array([25u8; 32]);
        let allow_key = Pubkey::new_from_array([26u8; 32]);

        let mut source_lamports = 0u64;
        let mut mint_lamports = 0u64;
        let mut destination_lamports = 0u64;
        let mut authority_lamports = 0u64;
        let mut validation_lamports = 0u64;
        let mut allow_lamports = 0u64;

        let mut source_data: Vec<u8> = Vec::new();
        let mut mint_data: Vec<u8> = Vec::new();
        let mut destination_data: Vec<u8> = Vec::new();
        let mut authority_data: Vec<u8> = Vec::new();
        let mut validation_data: Vec<u8> = Vec::new();
        let mut allow_data: Vec<u8> = Vec::new();

        let accounts = [
            AccountInfo::new(&source_key, false, false, &mut source_lamports, &mut source_data, &owner, false),
            AccountInfo::new(&mint_key, false, false, &mut mint_lamports, &mut mint_data, &owner, false),
            AccountInfo::new(&destination_key, false, false, &mut destination_lamports, &mut destination_data, &owner, false),
            AccountInfo::new(&authority_key, false, false, &mut authority_lamports, &mut authority_data, &owner, false),
            AccountInfo::new(&validation_key, false, false, &mut validation_lamports, &mut validation_data, &owner, false),
            AccountInfo::new(&allow_key, false, false, &mut allow_lamports, &mut allow_data, &owner, false),
        ];
        let data = TransferHookInstruction::Execute { amount: 1 }.pack();
        assert!(process(&program, &accounts, &data).is_err());
    }

    #[test]
    fn execute_rejects_too_few_accounts() {
        // Execute needs six accounts; provide two so account reads fail closed.
        let program = test_program_id();
        let owner = Pubkey::new_from_array([0u8; 32]);
        let first_key = Pubkey::new_from_array([30u8; 32]);
        let second_key = Pubkey::new_from_array([31u8; 32]);
        let mut first_lamports = 0u64;
        let mut second_lamports = 0u64;
        let mut first_data: Vec<u8> = Vec::new();
        let mut second_data: Vec<u8> = Vec::new();
        let accounts = [
            AccountInfo::new(&first_key, false, false, &mut first_lamports, &mut first_data, &owner, false),
            AccountInfo::new(&second_key, false, false, &mut second_lamports, &mut second_data, &owner, false),
        ];
        let data = TransferHookInstruction::Execute { amount: 1 }.pack();
        assert!(process(&program, &accounts, &data).is_err());
    }

    #[test]
    fn initialize_requires_authority_signer() {
        // The mint authority must sign InitializeExtraAccountMetaList.
        let program = test_program_id();
        let owner = Pubkey::new_from_array([0u8; 32]);
        let extra_key = Pubkey::new_from_array([40u8; 32]);
        let mint_key = Pubkey::new_from_array([41u8; 32]);
        let authority_key = Pubkey::new_from_array([42u8; 32]);
        let system_key = Pubkey::new_from_array([0u8; 32]);
        let mut extra_lamports = 0u64;
        let mut mint_lamports = 0u64;
        let mut authority_lamports = 0u64;
        let mut system_lamports = 0u64;
        let mut extra_data: Vec<u8> = Vec::new();
        let mut mint_data: Vec<u8> = Vec::new();
        let mut authority_data: Vec<u8> = Vec::new();
        let mut system_data: Vec<u8> = Vec::new();
        let accounts = [
            AccountInfo::new(&extra_key, false, true, &mut extra_lamports, &mut extra_data, &owner, false),
            AccountInfo::new(&mint_key, false, false, &mut mint_lamports, &mut mint_data, &owner, false),
            // authority is NOT a signer
            AccountInfo::new(&authority_key, false, false, &mut authority_lamports, &mut authority_data, &owner, false),
            AccountInfo::new(&system_key, false, false, &mut system_lamports, &mut system_data, &owner, false),
        ];
        let metas = vec![ExtraAccountMeta::new_with_seeds(
            &[Seed::Literal { bytes: b"x".to_vec() }],
            false,
            false,
        )
        .unwrap()];
        let data = TransferHookInstruction::InitializeExtraAccountMetaList {
            extra_account_metas: metas,
        }
        .pack();
        assert_eq!(
            process(&program, &accounts, &data),
            Err(ProgramError::MissingRequiredSignature)
        );
    }

    #[test]
    fn add_to_allowlist_requires_signer() {
        // AddToAllowlist must be signed by the mint authority.
        let program = test_program_id();
        let owner = Pubkey::new_from_array([0u8; 32]);
        let authority_key = Pubkey::new_from_array([60u8; 32]);
        let mint_key = Pubkey::new_from_array([61u8; 32]);
        let allow_key = Pubkey::new_from_array([62u8; 32]);
        let destination_key = Pubkey::new_from_array([63u8; 32]);
        let system_key = Pubkey::new_from_array([0u8; 32]);
        let mut authority_lamports = 0u64;
        let mut mint_lamports = 0u64;
        let mut allow_lamports = 0u64;
        let mut destination_lamports = 0u64;
        let mut system_lamports = 0u64;
        let mut authority_data: Vec<u8> = Vec::new();
        let mut mint_data: Vec<u8> = Vec::new();
        let mut allow_data: Vec<u8> = Vec::new();
        let mut destination_data: Vec<u8> = Vec::new();
        let mut system_data: Vec<u8> = Vec::new();
        let accounts = [
            // authority is NOT a signer
            AccountInfo::new(&authority_key, false, true, &mut authority_lamports, &mut authority_data, &owner, false),
            AccountInfo::new(&mint_key, false, false, &mut mint_lamports, &mut mint_data, &owner, false),
            AccountInfo::new(&allow_key, false, true, &mut allow_lamports, &mut allow_data, &owner, false),
            AccountInfo::new(&destination_key, false, false, &mut destination_lamports, &mut destination_data, &owner, false),
            AccountInfo::new(&system_key, false, false, &mut system_lamports, &mut system_data, &owner, false),
        ];
        let data = ADD_TO_ALLOWLIST_DISCRIMINATOR.to_vec();
        assert_eq!(
            process(&program, &accounts, &data),
            Err(ProgramError::MissingRequiredSignature)
        );
    }

    #[test]
    fn add_to_allowlist_rejects_a_mint_not_owned_by_token_2022() {
        // Adversarial: a crafted, mint-sized account owned by the system program is
        // passed as the mint. The authority signs, so we pass the signer check and
        // reach the owner check, which must reject before the forged authority field
        // is ever trusted. Source: transfer-hook-security.md item 4, rules/rust.md.
        let program = test_program_id();
        let non_token_owner = Pubkey::new_from_array([0u8; 32]); // the system program id
        let authority_key = Pubkey::new_from_array([70u8; 32]);
        let mint_key = Pubkey::new_from_array([71u8; 32]);
        let allow_key = Pubkey::new_from_array([72u8; 32]);
        let destination_key = Pubkey::new_from_array([73u8; 32]);
        let system_key = Pubkey::new_from_array([0u8; 32]);
        let mut authority_lamports = 0u64;
        let mut mint_lamports = 0u64;
        let mut allow_lamports = 0u64;
        let mut destination_lamports = 0u64;
        let mut system_lamports = 0u64;
        let mut authority_data: Vec<u8> = Vec::new();
        let mut mint_data: Vec<u8> = vec![0u8; 82]; // mint-sized bytes, but the wrong owner
        let mut allow_data: Vec<u8> = Vec::new();
        let mut destination_data: Vec<u8> = Vec::new();
        let mut system_data: Vec<u8> = Vec::new();
        let accounts = [
            // authority IS a signer here, so the owner check (not the signer check) fires
            AccountInfo::new(&authority_key, true, true, &mut authority_lamports, &mut authority_data, &non_token_owner, false),
            AccountInfo::new(&mint_key, false, false, &mut mint_lamports, &mut mint_data, &non_token_owner, false),
            AccountInfo::new(&allow_key, false, true, &mut allow_lamports, &mut allow_data, &non_token_owner, false),
            AccountInfo::new(&destination_key, false, false, &mut destination_lamports, &mut destination_data, &non_token_owner, false),
            AccountInfo::new(&system_key, false, false, &mut system_lamports, &mut system_data, &non_token_owner, false),
        ];
        let data = ADD_TO_ALLOWLIST_DISCRIMINATOR.to_vec();
        assert_eq!(
            process(&program, &accounts, &data),
            Err(AllowlistError::UnexpectedMintOwner.into())
        );
    }

    /// Build a valid Token-2022 base mint buffer (82 bytes, no extensions) with the
    /// given mint authority, so AddToAllowlist's authority gate can be exercised in
    /// a unit test without a runtime. Source: spl_token_2022::state::Mint (Pack).
    fn packed_mint(mint_authority: Option<Pubkey>) -> Vec<u8> {
        use solana_program::program_option::COption;
        use solana_program::program_pack::Pack;
        use spl_token_2022::state::Mint;

        let state = Mint {
            mint_authority: match mint_authority {
                Some(key) => COption::Some(key),
                None => COption::None,
            },
            supply: 0,
            decimals: 0,
            is_initialized: true,
            freeze_authority: COption::None,
        };
        let mut buffer = vec![0u8; Mint::LEN];
        Mint::pack(state, &mut buffer).unwrap();
        buffer
    }

    /// The Token-2022 program id as a solana_program Pubkey, for use as an account
    /// owner in tests (the owner check compares raw bytes).
    fn token_2022_owner() -> Pubkey {
        Pubkey::new_from_array(spl_token_2022::id().to_bytes())
    }

    #[test]
    fn update_extra_account_meta_list_is_rejected() {
        // This program freezes its validation list, so the interface Update is a
        // no-op error, never an account mutation. Routed before any account read.
        let program = test_program_id();
        let data = TransferHookInstruction::UpdateExtraAccountMetaList {
            extra_account_metas: vec![],
        }
        .pack();
        assert_eq!(
            process(&program, &[], &data),
            Err(ProgramError::InvalidInstructionData)
        );
    }

    #[test]
    fn add_to_allowlist_discriminator_does_not_collide_with_interface_instructions() {
        // process() routes on the 8-byte prefix first, so a real transfer-hook
        // instruction must never begin with our discriminator or it would misroute.
        let execute = TransferHookInstruction::Execute { amount: 0 }.pack();
        let initialize = TransferHookInstruction::InitializeExtraAccountMetaList {
            extra_account_metas: vec![],
        }
        .pack();
        let update = TransferHookInstruction::UpdateExtraAccountMetaList {
            extra_account_metas: vec![],
        }
        .pack();
        for encoded in [execute, initialize, update] {
            assert!(!encoded.starts_with(&ADD_TO_ALLOWLIST_DISCRIMINATOR));
        }
    }

    #[test]
    fn initialize_rejects_a_wrong_extra_account_metas_pda() {
        // The extra-metas account must equal the program-derived address for the
        // mint. A signed authority reaches the PDA check, which must reject a
        // mismatched account before creating anything.
        let program = test_program_id();
        let owner = Pubkey::new_from_array([0u8; 32]);
        let extra_key = Pubkey::new_from_array([80u8; 32]); // not the derived PDA
        let mint_key = Pubkey::new_from_array([81u8; 32]);
        let authority_key = Pubkey::new_from_array([82u8; 32]);
        let system_key = Pubkey::new_from_array([0u8; 32]);
        let mut extra_lamports = 0u64;
        let mut mint_lamports = 0u64;
        let mut authority_lamports = 0u64;
        let mut system_lamports = 0u64;
        let mut extra_data: Vec<u8> = Vec::new();
        let mut mint_data: Vec<u8> = Vec::new();
        let mut authority_data: Vec<u8> = Vec::new();
        let mut system_data: Vec<u8> = Vec::new();
        let accounts = [
            AccountInfo::new(&extra_key, false, true, &mut extra_lamports, &mut extra_data, &owner, false),
            AccountInfo::new(&mint_key, false, false, &mut mint_lamports, &mut mint_data, &owner, false),
            // authority IS a signer, so the PDA check (not the signer check) fires
            AccountInfo::new(&authority_key, true, false, &mut authority_lamports, &mut authority_data, &owner, false),
            AccountInfo::new(&system_key, false, false, &mut system_lamports, &mut system_data, &owner, false),
        ];
        let metas = vec![ExtraAccountMeta::new_with_seeds(
            &[Seed::Literal { bytes: b"x".to_vec() }],
            false,
            false,
        )
        .unwrap()];
        let data = TransferHookInstruction::InitializeExtraAccountMetaList {
            extra_account_metas: metas,
        }
        .pack();
        assert_eq!(process(&program, &accounts, &data), Err(ProgramError::InvalidSeeds));
    }

    #[test]
    fn initialize_requires_four_accounts() {
        // Initialize reads four accounts; provide one so a read fails closed.
        let program = test_program_id();
        let owner = Pubkey::new_from_array([0u8; 32]);
        let only_key = Pubkey::new_from_array([83u8; 32]);
        let mut only_lamports = 0u64;
        let mut only_data: Vec<u8> = Vec::new();
        let accounts = [AccountInfo::new(&only_key, false, true, &mut only_lamports, &mut only_data, &owner, false)];
        let data = TransferHookInstruction::InitializeExtraAccountMetaList {
            extra_account_metas: vec![],
        }
        .pack();
        assert!(process(&program, &accounts, &data).is_err());
    }

    #[test]
    fn execute_with_five_accounts_is_rejected() {
        // Execute needs six accounts (source, mint, destination, owner, validation,
        // allow); provide five so the sixth read fails closed.
        let program = test_program_id();
        let owner = Pubkey::new_from_array([0u8; 32]);
        let source_key = Pubkey::new_from_array([50u8; 32]);
        let mint_key = Pubkey::new_from_array([51u8; 32]);
        let destination_key = Pubkey::new_from_array([52u8; 32]);
        let owner_key = Pubkey::new_from_array([53u8; 32]);
        let validation_key = Pubkey::new_from_array([54u8; 32]);
        let mut source_lamports = 0u64;
        let mut mint_lamports = 0u64;
        let mut destination_lamports = 0u64;
        let mut owner_lamports = 0u64;
        let mut validation_lamports = 0u64;
        let mut source_data: Vec<u8> = Vec::new();
        let mut mint_data: Vec<u8> = Vec::new();
        let mut destination_data: Vec<u8> = Vec::new();
        let mut owner_data: Vec<u8> = Vec::new();
        let mut validation_data: Vec<u8> = Vec::new();
        let accounts = [
            AccountInfo::new(&source_key, false, false, &mut source_lamports, &mut source_data, &owner, false),
            AccountInfo::new(&mint_key, false, false, &mut mint_lamports, &mut mint_data, &owner, false),
            AccountInfo::new(&destination_key, false, false, &mut destination_lamports, &mut destination_data, &owner, false),
            AccountInfo::new(&owner_key, false, false, &mut owner_lamports, &mut owner_data, &owner, false),
            AccountInfo::new(&validation_key, false, false, &mut validation_lamports, &mut validation_data, &owner, false),
        ];
        let data = TransferHookInstruction::Execute { amount: 1 }.pack();
        assert!(process(&program, &accounts, &data).is_err());
    }

    #[test]
    fn execute_rejects_a_mint_sized_source_account() {
        // Adversarial: a mint-sized (82-byte) account is passed where a token
        // account is expected. It must not unpack as an account of the mint, so
        // Execute denies (checklist item 5, account-mint linkage).
        let program = test_program_id();
        let token_owner = token_2022_owner();
        let source_key = Pubkey::new_from_array([55u8; 32]);
        let mint_key = Pubkey::new_from_array([56u8; 32]);
        let destination_key = Pubkey::new_from_array([57u8; 32]);
        let owner_key = Pubkey::new_from_array([58u8; 32]);
        let validation_key = Pubkey::new_from_array([59u8; 32]);
        let allow_key = Pubkey::new_from_array([60u8; 32]);
        let mut source_lamports = 0u64;
        let mut mint_lamports = 0u64;
        let mut destination_lamports = 0u64;
        let mut owner_lamports = 0u64;
        let mut validation_lamports = 0u64;
        let mut allow_lamports = 0u64;
        let mut source_data = vec![0u8; 82]; // mint-sized, not a token account
        let mut mint_data: Vec<u8> = Vec::new();
        let mut destination_data: Vec<u8> = Vec::new();
        let mut owner_data: Vec<u8> = Vec::new();
        let mut validation_data: Vec<u8> = Vec::new();
        let mut allow_data: Vec<u8> = Vec::new();
        let accounts = [
            AccountInfo::new(&source_key, false, false, &mut source_lamports, &mut source_data, &token_owner, false),
            AccountInfo::new(&mint_key, false, false, &mut mint_lamports, &mut mint_data, &token_owner, false),
            AccountInfo::new(&destination_key, false, false, &mut destination_lamports, &mut destination_data, &token_owner, false),
            AccountInfo::new(&owner_key, false, false, &mut owner_lamports, &mut owner_data, &token_owner, false),
            AccountInfo::new(&validation_key, false, false, &mut validation_lamports, &mut validation_data, &token_owner, false),
            AccountInfo::new(&allow_key, false, false, &mut allow_lamports, &mut allow_data, &token_owner, false),
        ];
        let data = TransferHookInstruction::Execute { amount: 1 }.pack();
        assert!(process(&program, &accounts, &data).is_err());
    }

    #[test]
    fn add_to_allowlist_requires_five_accounts() {
        // AddToAllowlist reads five accounts; provide one so a read fails closed.
        let program = test_program_id();
        let owner = Pubkey::new_from_array([0u8; 32]);
        let only_key = Pubkey::new_from_array([64u8; 32]);
        let mut only_lamports = 0u64;
        let mut only_data: Vec<u8> = Vec::new();
        let accounts = [AccountInfo::new(&only_key, true, true, &mut only_lamports, &mut only_data, &owner, false)];
        let data = ADD_TO_ALLOWLIST_DISCRIMINATOR.to_vec();
        assert!(process(&program, &accounts, &data).is_err());
    }

    #[test]
    fn add_to_allowlist_rejects_a_non_authority_signer() {
        // A signed caller who is not the mint authority must be rejected, even
        // though the mint account is genuine and Token-2022-owned.
        let program = test_program_id();
        let token_owner = token_2022_owner();
        let system_owner = Pubkey::new_from_array([0u8; 32]);
        let real_authority = Pubkey::new_from_array([90u8; 32]);
        let wrong_signer = Pubkey::new_from_array([91u8; 32]);
        let mint_key = Pubkey::new_from_array([92u8; 32]);
        let allow_key = Pubkey::new_from_array([93u8; 32]);
        let destination_key = Pubkey::new_from_array([94u8; 32]);
        let system_key = Pubkey::new_from_array([0u8; 32]);
        let mut signer_lamports = 0u64;
        let mut mint_lamports = 0u64;
        let mut allow_lamports = 0u64;
        let mut destination_lamports = 0u64;
        let mut system_lamports = 0u64;
        let mut signer_data: Vec<u8> = Vec::new();
        let mut mint_data = packed_mint(Some(real_authority));
        let mut allow_data: Vec<u8> = Vec::new();
        let mut destination_data: Vec<u8> = Vec::new();
        let mut system_data: Vec<u8> = Vec::new();
        let accounts = [
            AccountInfo::new(&wrong_signer, true, true, &mut signer_lamports, &mut signer_data, &system_owner, false),
            AccountInfo::new(&mint_key, false, false, &mut mint_lamports, &mut mint_data, &token_owner, false),
            AccountInfo::new(&allow_key, false, true, &mut allow_lamports, &mut allow_data, &system_owner, false),
            AccountInfo::new(&destination_key, false, false, &mut destination_lamports, &mut destination_data, &system_owner, false),
            AccountInfo::new(&system_key, false, false, &mut system_lamports, &mut system_data, &system_owner, false),
        ];
        let data = ADD_TO_ALLOWLIST_DISCRIMINATOR.to_vec();
        assert_eq!(
            process(&program, &accounts, &data),
            Err(AllowlistError::UnauthorizedAllowlistManager.into())
        );
    }

    #[test]
    fn add_to_allowlist_rejects_a_mint_with_no_authority() {
        // A mint whose authority is renounced has no one who may manage its
        // allowlist, so even a signer is rejected.
        let program = test_program_id();
        let token_owner = token_2022_owner();
        let system_owner = Pubkey::new_from_array([0u8; 32]);
        let signer_key = Pubkey::new_from_array([95u8; 32]);
        let mint_key = Pubkey::new_from_array([96u8; 32]);
        let allow_key = Pubkey::new_from_array([97u8; 32]);
        let destination_key = Pubkey::new_from_array([98u8; 32]);
        let system_key = Pubkey::new_from_array([0u8; 32]);
        let mut signer_lamports = 0u64;
        let mut mint_lamports = 0u64;
        let mut allow_lamports = 0u64;
        let mut destination_lamports = 0u64;
        let mut system_lamports = 0u64;
        let mut signer_data: Vec<u8> = Vec::new();
        let mut mint_data = packed_mint(None);
        let mut allow_data: Vec<u8> = Vec::new();
        let mut destination_data: Vec<u8> = Vec::new();
        let mut system_data: Vec<u8> = Vec::new();
        let accounts = [
            AccountInfo::new(&signer_key, true, true, &mut signer_lamports, &mut signer_data, &system_owner, false),
            AccountInfo::new(&mint_key, false, false, &mut mint_lamports, &mut mint_data, &token_owner, false),
            AccountInfo::new(&allow_key, false, true, &mut allow_lamports, &mut allow_data, &system_owner, false),
            AccountInfo::new(&destination_key, false, false, &mut destination_lamports, &mut destination_data, &system_owner, false),
            AccountInfo::new(&system_key, false, false, &mut system_lamports, &mut system_data, &system_owner, false),
        ];
        let data = ADD_TO_ALLOWLIST_DISCRIMINATOR.to_vec();
        assert_eq!(
            process(&program, &accounts, &data),
            Err(AllowlistError::UnauthorizedAllowlistManager.into())
        );
    }

    #[test]
    fn add_to_allowlist_rejects_an_unexpected_allow_pda() {
        // The mint authority signs and the mint is genuine, but the allow account
        // is not the program-derived (mint, destination) PDA, so it is rejected
        // before anything is created.
        let program = test_program_id();
        let token_owner = token_2022_owner();
        let system_owner = Pubkey::new_from_array([0u8; 32]);
        let authority_key = Pubkey::new_from_array([100u8; 32]);
        let mint_key = Pubkey::new_from_array([101u8; 32]);
        let wrong_allow_key = Pubkey::new_from_array([102u8; 32]); // not the derived PDA
        let destination_key = Pubkey::new_from_array([103u8; 32]);
        let system_key = Pubkey::new_from_array([0u8; 32]);
        let mut authority_lamports = 0u64;
        let mut mint_lamports = 0u64;
        let mut allow_lamports = 0u64;
        let mut destination_lamports = 0u64;
        let mut system_lamports = 0u64;
        let mut authority_data: Vec<u8> = Vec::new();
        let mut mint_data = packed_mint(Some(authority_key));
        let mut allow_data: Vec<u8> = Vec::new();
        let mut destination_data: Vec<u8> = Vec::new();
        let mut system_data: Vec<u8> = Vec::new();
        let accounts = [
            AccountInfo::new(&authority_key, true, true, &mut authority_lamports, &mut authority_data, &system_owner, false),
            AccountInfo::new(&mint_key, false, false, &mut mint_lamports, &mut mint_data, &token_owner, false),
            AccountInfo::new(&wrong_allow_key, false, true, &mut allow_lamports, &mut allow_data, &system_owner, false),
            AccountInfo::new(&destination_key, false, false, &mut destination_lamports, &mut destination_data, &system_owner, false),
            AccountInfo::new(&system_key, false, false, &mut system_lamports, &mut system_data, &system_owner, false),
        ];
        let data = ADD_TO_ALLOWLIST_DISCRIMINATOR.to_vec();
        assert_eq!(
            process(&program, &accounts, &data),
            Err(AllowlistError::UnexpectedAllowAccount.into())
        );
    }

    #[test]
    fn add_to_allowlist_is_idempotent_when_allow_account_exists() {
        // A second AddToAllowlist for an already-allowlisted destination is a no-op:
        // the correct PDA already has data, so the handler returns Ok without
        // recreating it.
        let program = test_program_id();
        let token_owner = token_2022_owner();
        let system_owner = Pubkey::new_from_array([0u8; 32]);
        let authority_key = Pubkey::new_from_array([110u8; 32]);
        let mint_key = Pubkey::new_from_array([111u8; 32]);
        let destination_key = Pubkey::new_from_array([112u8; 32]);
        let system_key = Pubkey::new_from_array([0u8; 32]);
        let (expected_allow, _bump) = Pubkey::find_program_address(
            &[ALLOW_SEED_PREFIX, mint_key.as_ref(), destination_key.as_ref()],
            &program,
        );
        let mut authority_lamports = 0u64;
        let mut mint_lamports = 0u64;
        let mut allow_lamports = 0u64;
        let mut destination_lamports = 0u64;
        let mut system_lamports = 0u64;
        let mut authority_data: Vec<u8> = Vec::new();
        let mut mint_data = packed_mint(Some(authority_key));
        let mut allow_data: Vec<u8> = vec![1u8]; // already allowlisted (non-empty)
        let mut destination_data: Vec<u8> = Vec::new();
        let mut system_data: Vec<u8> = Vec::new();
        let accounts = [
            AccountInfo::new(&authority_key, true, true, &mut authority_lamports, &mut authority_data, &system_owner, false),
            AccountInfo::new(&mint_key, false, false, &mut mint_lamports, &mut mint_data, &token_owner, false),
            AccountInfo::new(&expected_allow, false, true, &mut allow_lamports, &mut allow_data, &program, false),
            AccountInfo::new(&destination_key, false, false, &mut destination_lamports, &mut destination_data, &system_owner, false),
            AccountInfo::new(&system_key, false, false, &mut system_lamports, &mut system_data, &system_owner, false),
        ];
        let data = ADD_TO_ALLOWLIST_DISCRIMINATOR.to_vec();
        assert_eq!(process(&program, &accounts, &data), Ok(()));
    }
}
