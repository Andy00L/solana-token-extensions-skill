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
    pod::PodAccount,
};
use spl_transfer_hook_interface::{
    collect_extra_account_metas_signer_seeds, error::TransferHookError,
    get_extra_account_metas_address_and_bump_seed,
    instruction::{ExecuteInstruction, TransferHookInstruction},
};

use crate::{error::AllowlistError, ALLOW_SEED_PREFIX};

// Account index of the destination token account in the Execute instruction.
// Source: spl-transfer-hook-interface Execute account ordering.
const DESTINATION_ACCOUNT_INDEX: u8 = 2;

pub fn process(program_id: &Pubkey, accounts: &[AccountInfo], input: &[u8]) -> ProgramResult {
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

/// Allow a transfer only when the token accounts are transferring and the
/// destination's allow PDA exists. Deny by default.
fn process_execute(program_id: &Pubkey, accounts: &[AccountInfo], _amount: u64) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let source_info = next_account_info(account_info_iter)?;
    let _mint_info = next_account_info(account_info_iter)?;
    let destination_info = next_account_info(account_info_iter)?;
    let _owner_info = next_account_info(account_info_iter)?;
    let _validation_info = next_account_info(account_info_iter)?;
    let allow_info = next_account_info(account_info_iter)?;

    // Gate on a real transfer so Execute cannot be invoked standalone.
    assert_is_transferring(source_info)?;
    assert_is_transferring(destination_info)?;

    // The allow account must be the expected per-destination PDA.
    let (expected_allow, _bump) = Pubkey::find_program_address(
        &[ALLOW_SEED_PREFIX, destination_info.key.as_ref()],
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

/// Reject unless the token account carries the TransferHookAccount extension with
/// the transferring flag set. Source: transfer-hook-security.md, checklist item 2.
fn assert_is_transferring(account_info: &AccountInfo) -> ProgramResult {
    let account_data = account_info.try_borrow_data()?;
    let account = PodStateWithExtensions::<PodAccount>::unpack(&account_data)?;
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
    fn allow_pda_is_deterministic_and_destination_specific() {
        let program = test_program_id();
        let destination = Pubkey::new_from_array([9u8; 32]);
        let (first, _) =
            Pubkey::find_program_address(&[ALLOW_SEED_PREFIX, destination.as_ref()], &program);
        let (again, _) =
            Pubkey::find_program_address(&[ALLOW_SEED_PREFIX, destination.as_ref()], &program);
        assert_eq!(first, again);
        let other = Pubkey::new_from_array([10u8; 32]);
        let (other_pda, _) =
            Pubkey::find_program_address(&[ALLOW_SEED_PREFIX, other.as_ref()], &program);
        assert_ne!(first, other_pda);
    }

    #[test]
    fn validation_list_builds_and_initializes() {
        let metas = [ExtraAccountMeta::new_with_seeds(
            &[
                Seed::Literal {
                    bytes: ALLOW_SEED_PREFIX.to_vec(),
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
        // Six accounts with empty token data: the transferring gate fails, so
        // Execute denies (fail closed). Source: transfer-hook-security.md item 2.
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
}
