use bolt_lang::*;
use crate::components::*;

pub mod delegate_session_key {
    use super::*;

    pub fn handler(
        ctx: Context<DelegateSessionKey>,
        session_key: Pubkey,
        permissions: u32,
        expiry: i64,
    ) -> Result<()> {
        let clock = Clock::get()?;
        
        // Validate expiry is in the future
        if expiry <= clock.unix_timestamp {
            return Err(crate::GameError::InvalidSessionKey.into());
        }

        // Validate permissions don't exceed maximum allowed
        if permissions > SESSION_PERMISSION_ALL {
            return Err(crate::GameError::UnauthorizedAction.into());
        }

        // Create session delegation
        let session_delegation = SessionDelegation::new(
            ctx.accounts.authority.key(),
            session_key,
            permissions,
            clock.unix_timestamp,
            expiry - clock.unix_timestamp,
            None, // No usage limit by default
        );

        ctx.accounts.session_delegation.set_inner(session_delegation);

        msg!(
            "Session key {} delegated by {} with permissions 0x{:08x}, expires at {}",
            session_key,
            ctx.accounts.authority.key(),
            permissions,
            expiry
        );

        Ok(())
    }
}

pub mod revoke_session_key {
    use super::*;

    pub fn handler(ctx: Context<RevokeSessionKey>) -> Result<()> {
        let session_delegation = &mut ctx.accounts.session_delegation;

        // Only the original authority can revoke
        if session_delegation.authority != ctx.accounts.authority.key() {
            return Err(crate::GameError::UnauthorizedAction.into());
        }

        session_delegation.revoke();

        msg!(
            "Session key {} revoked by {}",
            session_delegation.session_key,
            ctx.accounts.authority.key()
        );

        Ok(())
    }
}

pub mod use_session_key {
    use super::*;

    pub fn handler(
        ctx: Context<UseSessionKey>,
        action: SessionAction,
    ) -> Result<()> {
        let session_delegation = &mut ctx.accounts.session_delegation;
        let clock = Clock::get()?;

        // Validate session key can execute this action
        if !session_delegation.can_execute_action(action, clock.unix_timestamp) {
            return Err(crate::GameError::InvalidSessionKey.into());
        }

        // Use the session (decrement usage count if limited)
        if !session_delegation.use_session(clock.unix_timestamp) {
            return Err(crate::GameError::InvalidSessionKey.into());
        }

        // Record gasless transaction
        let gasless_tx = GaslessTransaction {
            sponsor: session_delegation.authority, // Original wallet sponsors
            user: ctx.accounts.session_signer.key(), // Session key user
            transaction_hash: [0; 32], // Would be filled by runtime
            gas_used: 0, // Would be calculated by ER
            timestamp: clock.unix_timestamp,
            action_type: action as u8,
            success: true,
            error_code: None,
        };

        ctx.accounts.gasless_transaction.set_inner(gasless_tx);

        msg!(
            "Session key action executed: {:?} by {} on behalf of {}",
            action,
            ctx.accounts.session_signer.key(),
            session_delegation.authority
        );

        Ok(())
    }
}

pub mod create_ephemeral_session {
    use super::*;

    pub fn handler(
        ctx: Context<CreateEphemeralSession>,
        rollup_id: Pubkey,
    ) -> Result<()> {
        let clock = Clock::get()?;
        
        // Initialize ephemeral state for this session
        let ephemeral_state = EphemeralState::new(
            rollup_id,
            ctx.accounts.authority.key(),
        );

        ctx.accounts.ephemeral_state.set_inner(ephemeral_state);

        // Initialize router configuration
        let router_config = RouterConfig {
            routing_strategy: RoutingStrategy::LatencyOptimized,
            latency_threshold: 30, // 30ms target
            cost_threshold: 5000,  // 0.005 SOL
            auto_route: true,
            preferred_network: NetworkPreference::EphemeralRollup,
            fallback_enabled: true,
            ..Default::default()
        };

        ctx.accounts.router_config.set_inner(router_config);

        msg!(
            "Ephemeral session created for {} on rollup {}",
            ctx.accounts.authority.key(),
            rollup_id
        );

        Ok(())
    }
}

pub mod commit_to_mainnet {
    use super::*;

    pub fn handler(ctx: Context<CommitToMainnet>) -> Result<()> {
        let ephemeral_state = &mut ctx.accounts.ephemeral_state;
        let clock = Clock::get()?;

        // Only commit authority can force commit
        if ephemeral_state.commit_authority != ctx.accounts.authority.key() {
            return Err(crate::GameError::UnauthorizedAction.into());
        }

        // Record the commit
        ephemeral_state.commit(clock.unix_timestamp);

        msg!(
            "Ephemeral state committed to mainnet: {} actions committed",
            ephemeral_state.sequence_number
        );

        Ok(())
    }
}

pub mod route_transaction {
    use super::*;

    pub fn handler(
        ctx: Context<RouteTransaction>,
        estimated_gas: u64,
        priority_level: u8,
    ) -> Result<NetworkPreference> {
        let router_config = &ctx.accounts.router_config;
        let ephemeral_state = &ctx.accounts.ephemeral_state;

        // Determine optimal routing based on strategy
        let recommended_network = match router_config.routing_strategy {
            RoutingStrategy::LatencyOptimized => {
                let er_latency = ephemeral_state.get_latency_estimate();
                let mainnet_latency = estimate_mainnet_latency(priority_level);
                
                if er_latency < mainnet_latency && er_latency <= router_config.latency_threshold {
                    NetworkPreference::EphemeralRollup
                } else {
                    NetworkPreference::Mainnet
                }
            },
            RoutingStrategy::CostOptimized => {
                // ER is always cheaper (gasless)
                if router_config.fallback_enabled {
                    NetworkPreference::EphemeralRollup
                } else {
                    router_config.preferred_network
                }
            },
            RoutingStrategy::Balanced => {
                let er_latency = ephemeral_state.get_latency_estimate();
                let estimated_cost = estimated_gas * 5000; // Rough mainnet cost estimate
                
                if er_latency <= router_config.latency_threshold && 
                   estimated_cost > router_config.cost_threshold {
                    NetworkPreference::EphemeralRollup
                } else {
                    NetworkPreference::Mainnet
                }
            },
            RoutingStrategy::ForceMainnet => NetworkPreference::Mainnet,
            RoutingStrategy::ForceER => NetworkPreference::EphemeralRollup,
        };

        msg!(
            "Transaction routing recommendation: {:?} (estimated gas: {}, ER latency: {}ms)",
            recommended_network,
            estimated_gas,
            ephemeral_state.get_latency_estimate()
        );

        Ok(recommended_network)
    }

    fn estimate_mainnet_latency(priority_level: u8) -> u64 {
        // Estimate mainnet latency based on priority level
        match priority_level {
            0 => 2000,  // Low priority: ~2 seconds
            1 => 800,   // Medium priority: ~800ms
            2 => 400,   // High priority: ~400ms
            _ => 200,   // Max priority: ~200ms
        }
    }
}

pub mod update_session_permissions {
    use super::*;

    pub fn handler(
        ctx: Context<UpdateSessionPermissions>,
        new_permissions: u32,
    ) -> Result<()> {
        let session_delegation = &mut ctx.accounts.session_delegation;

        // Only authority can update permissions
        if session_delegation.authority != ctx.accounts.authority.key() {
            return Err(crate::GameError::UnauthorizedAction.into());
        }

        // Validate new permissions
        if new_permissions > SESSION_PERMISSION_ALL {
            return Err(crate::GameError::UnauthorizedAction.into());
        }

        let old_permissions = session_delegation.permissions;
        session_delegation.permissions = new_permissions;

        msg!(
            "Session key {} permissions updated: 0x{:08x} -> 0x{:08x}",
            session_delegation.session_key,
            old_permissions,
            new_permissions
        );

        Ok(())
    }
}

// Context definitions
#[derive(Accounts)]
pub struct DelegateSessionKey<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        init,
        payer = authority,
        space = 8 + std::mem::size_of::<SessionDelegation>(),
    )]
    pub session_delegation: Account<'info, SessionDelegation>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevokeSessionKey<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(mut)]
    pub session_delegation: Account<'info, SessionDelegation>,
}

#[derive(Accounts)]
pub struct UseSessionKey<'info> {
    #[account(mut)]
    pub session_signer: Signer<'info>,
    
    #[account(mut)]
    pub session_delegation: Account<'info, SessionDelegation>,
    
    #[account(
        init,
        payer = session_signer,
        space = 8 + std::mem::size_of::<GaslessTransaction>(),
    )]
    pub gasless_transaction: Account<'info, GaslessTransaction>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateEphemeralSession<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        init,
        payer = authority,
        space = 8 + std::mem::size_of::<EphemeralState>(),
    )]
    pub ephemeral_state: Account<'info, EphemeralState>,
    
    #[account(
        init,
        payer = authority,
        space = 8 + std::mem::size_of::<RouterConfig>(),
    )]
    pub router_config: Account<'info, RouterConfig>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CommitToMainnet<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(mut)]
    pub ephemeral_state: Account<'info, EphemeralState>,
}

#[derive(Accounts)]
pub struct RouteTransaction<'info> {
    pub user: Signer<'info>,
    
    #[account(mut)]
    pub router_config: Account<'info, RouterConfig>,
    
    #[account(mut)]
    pub ephemeral_state: Account<'info, EphemeralState>,
}

#[derive(Accounts)]
pub struct UpdateSessionPermissions<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(mut)]
    pub session_delegation: Account<'info, SessionDelegation>,
}