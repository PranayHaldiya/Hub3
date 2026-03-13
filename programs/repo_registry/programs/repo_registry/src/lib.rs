use anchor_lang::prelude::*;

declare_id!("8d7FrUUG4sKQRsKpUDTimKb4c2MQqWVfkPFhM79CY6Ge");

#[program]
pub mod repo_registry {
    use super::*;

    pub fn create_repo(
        ctx: Context<CreateRepo>,
        repo_id: String,
        source_repo_full_name: String,
        current_manifest_id: String,
        latest_commit_sha: String,
    ) -> Result<()> {
        let repo = &mut ctx.accounts.repo_record;
        repo.repo_id = repo_id;
        repo.owner = ctx.accounts.owner.key();
        repo.source_repo_full_name = source_repo_full_name;
        repo.current_manifest_id = current_manifest_id;
        repo.latest_commit_sha = latest_commit_sha;
        repo.status = RepoStatus::Published;
        repo.pricing_mode = PricingMode::Free;
        repo.payment_token_mint = Pubkey::default();
        repo.price_amount = 0;
        repo.bump = ctx.bumps.repo_record;
        Ok(())
    }

    pub fn update_manifest(
        ctx: Context<UpdateManifest>,
        current_manifest_id: String,
        latest_commit_sha: String,
        status: RepoStatus,
    ) -> Result<()> {
        let repo = &mut ctx.accounts.repo_record;
        require_keys_eq!(repo.owner, ctx.accounts.owner.key(), RepoRegistryError::Unauthorized);
        repo.current_manifest_id = current_manifest_id;
        repo.latest_commit_sha = latest_commit_sha;
        repo.status = status;
        Ok(())
    }

    pub fn set_pricing(
        ctx: Context<SetPricing>,
        pricing_mode: PricingMode,
        payment_token_mint: Pubkey,
        price_amount: u64,
    ) -> Result<()> {
        let repo = &mut ctx.accounts.repo_record;
        require_keys_eq!(repo.owner, ctx.accounts.owner.key(), RepoRegistryError::Unauthorized);
        repo.pricing_mode = pricing_mode;
        repo.payment_token_mint = payment_token_mint;
        repo.price_amount = price_amount;
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(repo_id: String)]
pub struct CreateRepo<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        init,
        payer = owner,
        space = 8 + RepoRecord::INIT_SPACE,
        seeds = [b"repo", repo_id.as_bytes()],
        bump
    )]
    pub repo_record: Account<'info, RepoRecord>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateManifest<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut)]
    pub repo_record: Account<'info, RepoRecord>,
}

#[derive(Accounts)]
pub struct SetPricing<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut)]
    pub repo_record: Account<'info, RepoRecord>,
}

#[account]
#[derive(InitSpace)]
pub struct RepoRecord {
    #[max_len(64)]
    pub repo_id: String,
    pub owner: Pubkey,
    #[max_len(128)]
    pub source_repo_full_name: String,
    #[max_len(96)]
    pub current_manifest_id: String,
    #[max_len(64)]
    pub latest_commit_sha: String,
    pub status: RepoStatus,
    pub pricing_mode: PricingMode,
    pub payment_token_mint: Pubkey,
    pub price_amount: u64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace, PartialEq, Eq)]
pub enum RepoStatus {
    Draft,
    Published,
    Failed,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace, PartialEq, Eq)]
pub enum PricingMode {
    Free,
    Fixed,
}

#[error_code]
pub enum RepoRegistryError {
    #[msg("Only the owner may update this repository record")]
    Unauthorized,
}
