/**
 * BOLT Combat System Integration Tests
 * Tests BOLT ECS combat components and systems with real-time constraints
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { performance } from 'perf_hooks';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { anchor, Session } from '@magicblock-labs/bolt-sdk';

// Import BOLT combat components and systems
import { 
  CombatStats, 
  ActiveEffects, 
  AbilityCooldowns, 
  CombatResult,
  StatusEffect,
  EffectType,
  AbilityType 
} from '../../src/bolt/components';
import { 
  CombatSystem,
  EffectSystem,
  TurnSystem 
} from '../../src/bolt/systems';

// Mock Solana connection for testing
const mockConnection = new Connection('http://localhost:8899', 'confirmed');

describe('BOLT Combat System Integration Tests', () => {
  let world: World;
  let combatSystem: CombatSystem;
  let effectSystem: EffectSystem;
  let turnSystem: TurnSystem;
  let attacker: Entity;
  let defender: Entity;
  let playerKeypair: Keypair;

  beforeEach(async () => {
    // Initialize BOLT world and systems
    world = new World(mockConnection);
    combatSystem = new CombatSystem(world);
    effectSystem = new EffectSystem(world);
    turnSystem = new TurnSystem(world);
    
    playerKeypair = Keypair.generate();

    // Create test entities
    attacker = world.createEntity();
    defender = world.createEntity();

    // Add basic combat components
    await world.addComponent(attacker, CombatStats, {
      damage_dealt: 0,
      damage_taken: 0,
      actions_taken: 0,
      critical_hits: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
      match_mvp_count: 0,
    });

    await world.addComponent(defender, CombatStats, {
      damage_dealt: 0,
      damage_taken: 0,
      actions_taken: 0,
      critical_hits: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
      match_mvp_count: 0,
    });

    await world.addComponent(attacker, AbilityCooldowns, {
      basic_attack: 0,
      special_ability: 0,
      ultimate: 0,
      defensive_stance: 0,
      heal: 0,
      movement: 0,
    });

    await world.addComponent(attacker, ActiveEffects, {
      effects: new Array(8).fill({
        effect_type: EffectType.None,
        strength: 0,
        duration: 0,
        expires_at: 0,
        caster: PublicKey.default,
      }),
      effect_count: 0,
    });

    await world.addComponent(defender, ActiveEffects, {
      effects: new Array(8).fill({
        effect_type: EffectType.None,
        strength: 0,
        duration: 0,
        expires_at: 0,
        caster: PublicKey.default,
      }),
      effect_count: 0,
    });
  });

  afterEach(async () => {
    await world.destroy();
  });

  describe('Combat Component Management', () => {
    test('should create and manage CombatStats component efficiently', async () => {
      const startTime = performance.now();

      const stats = await world.getComponent(attacker, CombatStats);
      expect(stats).toBeDefined();
      expect(stats.damage_dealt).toBe(0);
      expect(stats.actions_taken).toBe(0);

      // Update stats
      stats.damage_dealt = 150;
      stats.actions_taken = 5;
      stats.critical_hits = 1;
      await world.updateComponent(attacker, CombatStats, stats);

      const updatedStats = await world.getComponent(attacker, CombatStats);
      expect(updatedStats.damage_dealt).toBe(150);
      expect(updatedStats.actions_taken).toBe(5);
      expect(updatedStats.critical_hits).toBe(1);

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Should complete within 5ms for real-time responsiveness
      expect(duration).toBeLessThan(5);
    });

    test('should manage ActiveEffects component with proper expiration', async () => {
      const currentTime = Math.floor(Date.now() / 1000);
      const activeEffects = await world.getComponent(attacker, ActiveEffects);

      // Add a poison effect
      const poisonEffect: StatusEffect = {
        effect_type: EffectType.Poison,
        strength: 10.0,
        duration: 15,
        expires_at: currentTime + 15,
        caster: defender,
      };

      const startTime = performance.now();

      // Simulate adding effect
      activeEffects.effects[0] = poisonEffect;
      activeEffects.effect_count = 1;
      await world.updateComponent(attacker, ActiveEffects, activeEffects);

      // Test effect queries
      const hasPoison = activeEffects.effect_count > 0 && 
        activeEffects.effects[0].effect_type === EffectType.Poison;
      expect(hasPoison).toBe(true);

      const poisonStrength = activeEffects.effects[0].strength;
      expect(poisonStrength).toBe(10.0);

      // Test effect expiration
      const expiredEffects = {
        ...activeEffects,
        effects: activeEffects.effects.filter(effect => 
          effect.expires_at > currentTime + 20 // Simulate time passage
        ),
        effect_count: 0,
      };

      await world.updateComponent(attacker, ActiveEffects, expiredEffects);

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(3); // Effect management under 3ms
    });

    test('should handle AbilityCooldowns with precise timing', async () => {
      const currentTime = Math.floor(Date.now() / 1000);
      const cooldowns = await world.getComponent(attacker, AbilityCooldowns);

      const startTime = performance.now();

      // Test ability usage
      const canUseBasicAttack = currentTime >= cooldowns.basic_attack + 2; // 2s cooldown
      expect(canUseBasicAttack).toBe(true);

      // Use basic attack
      cooldowns.basic_attack = currentTime;
      await world.updateComponent(attacker, AbilityCooldowns, cooldowns);

      // Check cooldown immediately after use
      const updatedCooldowns = await world.getComponent(attacker, AbilityCooldowns);
      const nowCanUseBasicAttack = currentTime >= updatedCooldowns.basic_attack + 2;
      expect(nowCanUseBasicAttack).toBe(false);

      // Calculate remaining cooldown
      const remainingCooldown = Math.max(0, (updatedCooldowns.basic_attack + 2) - currentTime);
      expect(remainingCooldown).toBeGreaterThan(0);
      expect(remainingCooldown).toBeLessThanOrEqual(2);

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(2); // Cooldown checks under 2ms
    });
  });

  describe('Combat System Operations', () => {
    test('should execute basic attack with proper damage calculation', async () => {
      const startTime = performance.now();

      // Setup attacker stats
      const attackerStats = {
        attack: 50,
        defense: 20,
        speed: 30,
        health: 100,
        mana: 50,
      };

      const defenderStats = {
        attack: 30,
        defense: 25,
        speed: 25,
        health: 100,
        mana: 50,
      };

      // Execute basic attack
      const combatResult = await combatSystem.executeBasicAttack({
        attacker,
        defender,
        attackerStats,
        defenderStats,
        power: 20,
        timestamp: Math.floor(Date.now() / 1000),
      });

      expect(combatResult).toBeDefined();
      expect(combatResult.damage_dealt).toBeGreaterThan(0);
      expect(combatResult.attacker).toEqual(attacker);
      expect(combatResult.target).toEqual(defender);
      expect(combatResult.action_type).toBe(0); // Basic attack

      // Damage should account for defense
      const expectedBaseDamage = attackerStats.attack + 20 - defenderStats.defense;
      const minDamage = Math.max(1, expectedBaseDamage);
      expect(combatResult.damage_dealt).toBeGreaterThanOrEqual(minDamage);

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(10); // Combat calculation under 10ms
    });

    test('should process special abilities with class-specific effects', async () => {
      const startTime = performance.now();

      const attackerProfile = {
        player_class: 1, // Mage
        level: 5,
      };

      const attackerStats = {
        attack: 40,
        defense: 15,
        speed: 35,
        health: 80,
        mana: 100,
      };

      const defenderStats = {
        attack: 35,
        defense: 30,
        speed: 20,
        health: 100,
        mana: 50,
      };

      // Execute special ability (Fireball for Mage)
      const combatResult = await combatSystem.executeSpecialAbility({
        attacker,
        defender,
        attackerProfile,
        attackerStats,
        defenderStats,
        power: 25,
        timestamp: Math.floor(Date.now() / 1000),
      });

      expect(combatResult).toBeDefined();
      expect(combatResult.damage_dealt).toBeGreaterThan(0);
      expect(combatResult.action_type).toBe(1); // Special ability
      expect(combatResult.effect_count).toBeGreaterThan(0); // Should apply burn effect

      // Mage fireball should apply burn effect
      expect(combatResult.effects_applied[0]).toBe(EffectType.Burn);

      // Should have mana cost deducted
      const updatedHealth = await combatSystem.getPlayerHealth(attacker);
      expect(updatedHealth.current_mana).toBeLessThan(attackerStats.mana);

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(15); // Special ability under 15ms
    });

    test('should handle ultimate abilities with massive damage', async () => {
      const startTime = performance.now();

      const attackerProfile = {
        player_class: 0, // Warrior
        level: 10,
      };

      const attackerStats = {
        attack: 80,
        defense: 40,
        speed: 25,
        health: 150,
        mana: 100,
      };

      const defenderStats = {
        attack: 50,
        defense: 35,
        speed: 30,
        health: 120,
        mana: 60,
      };

      // Execute ultimate ability (Devastating Blow for Warrior)
      const combatResult = await combatSystem.executeUltimateAbility({
        attacker,
        defender,
        attackerProfile,
        attackerStats,
        defenderStats,
        power: 30,
        timestamp: Math.floor(Date.now() / 1000),
      });

      expect(combatResult).toBeDefined();
      expect(combatResult.damage_dealt).toBeGreaterThan(attackerStats.attack); // Should be massive
      expect(combatResult.action_type).toBe(4); // Ultimate ability
      expect(combatResult.critical_hit).toBe(true); // Ultimates are always "critical"
      expect(combatResult.experience_gained).toBeGreaterThan(20); // Significant exp

      // Should consume significant mana (50)
      const updatedHealth = await combatSystem.getPlayerHealth(attacker);
      expect(updatedHealth.current_mana).toBe(attackerStats.mana - 50);

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(20); // Ultimate ability under 20ms
    });
  });

  describe('Effect System Processing', () => {
    test('should process damage over time effects efficiently', async () => {
      const currentTime = Math.floor(Date.now() / 1000);
      
      // Setup player with poison effect
      const activeEffects = await world.getComponent(attacker, ActiveEffects);
      activeEffects.effects[0] = {
        effect_type: EffectType.Poison,
        strength: 15.0,
        duration: 20,
        expires_at: currentTime + 20,
        caster: defender,
      };
      activeEffects.effect_count = 1;
      await world.updateComponent(attacker, ActiveEffects, activeEffects);

      const startTime = performance.now();

      // Process effects
      const result = await effectSystem.processEffects(attacker, currentTime);

      expect(result).toBeDefined();
      expect(result.totalDotDamage).toBe(15); // Poison damage
      expect(result.totalHotHealing).toBe(0); // No healing effects
      expect(result.effectsProcessed).toBe(1);

      // Verify effect expiration handling
      const expiredTime = currentTime + 25; // After effect expires
      const expiredResult = await effectSystem.processEffects(attacker, expiredTime);
      expect(expiredResult.effectsProcessed).toBe(0); // Effect should be expired

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(5); // Effect processing under 5ms
    });

    test('should handle multiple concurrent effects', async () => {
      const currentTime = Math.floor(Date.now() / 1000);
      
      // Setup player with multiple effects
      const activeEffects = await world.getComponent(attacker, ActiveEffects);
      
      // Poison effect
      activeEffects.effects[0] = {
        effect_type: EffectType.Poison,
        strength: 10.0,
        duration: 15,
        expires_at: currentTime + 15,
        caster: defender,
      };

      // Burn effect
      activeEffects.effects[1] = {
        effect_type: EffectType.Burn,
        strength: 12.0,
        duration: 18,
        expires_at: currentTime + 18,
        caster: defender,
      };

      // Regeneration effect
      activeEffects.effects[2] = {
        effect_type: EffectType.Regeneration,
        strength: 8.0,
        duration: 25,
        expires_at: currentTime + 25,
        caster: attacker,
      };

      activeEffects.effect_count = 3;
      await world.updateComponent(attacker, ActiveEffects, activeEffects);

      const startTime = performance.now();

      // Process all effects
      const result = await effectSystem.processEffects(attacker, currentTime);

      expect(result.totalDotDamage).toBe(22); // 10 + 12 (poison + burn)
      expect(result.totalHotHealing).toBe(8); // Regeneration
      expect(result.effectsProcessed).toBe(3);

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(8); // Multiple effects under 8ms
    });
  });

  describe('Turn System Integration', () => {
    test('should manage turn order with speed-based initiative', async () => {
      // Create multiple entities with different speeds
      const players = [];
      const speeds = [25, 40, 15, 35, 30];

      for (let i = 0; i < 5; i++) {
        const player = world.createEntity();
        await world.addComponent(player, 'PlayerStats', {
          attack: 30 + i * 5,
          defense: 20 + i * 3,
          speed: speeds[i],
          health: 100,
          mana: 50,
        });
        players.push({ entity: player, speed: speeds[i] });
      }

      const startTime = performance.now();

      // Initialize turn order
      const turnOrder = await turnSystem.calculateTurnOrder(players.map(p => p.entity));

      // Verify turn order is based on speed (highest first)
      const expectedOrder = [...speeds].sort((a, b) => b - a);
      const actualSpeeds = [];
      
      for (const entity of turnOrder) {
        const stats = await world.getComponent(entity, 'PlayerStats');
        actualSpeeds.push(stats.speed);
      }

      expect(actualSpeeds).toEqual(expectedOrder);

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(10); // Turn order calculation under 10ms
    });

    test('should process complete combat turn efficiently', async () => {
      const startTime = performance.now();

      // Setup turn with attacker and defender
      const turnState = {
        currentPlayer: attacker,
        turnNumber: 1,
        turnStartTime: Math.floor(Date.now() / 1000),
        actionsRemaining: 2,
      };

      // Execute complete turn: move + attack
      const moveResult = await turnSystem.processPlayerAction({
        player: attacker,
        actionType: 'move',
        data: { fromX: 0, fromY: 0, toX: 50, toY: 75 },
        turnState,
      });

      expect(moveResult.success).toBe(true);
      expect(moveResult.actionsRemaining).toBe(1);

      const attackResult = await turnSystem.processPlayerAction({
        player: attacker,
        actionType: 'attack',
        target: defender,
        data: { damage: 25, attackType: 'melee' },
        turnState: { ...turnState, actionsRemaining: 1 },
      });

      expect(attackResult.success).toBe(true);
      expect(attackResult.actionsRemaining).toBe(0);
      expect(attackResult.turnComplete).toBe(true);

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(25); // Complete turn under 25ms
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle rapid combat actions at 60 FPS', async () => {
      const frameTime = 16.67; // 60 FPS = 16.67ms per frame
      const frameTimes = [];

      // Simulate 30 frames of combat (0.5 seconds at 60 FPS)
      for (let frame = 0; frame < 30; frame++) {
        const frameStart = performance.now();

        // Simulate frame processing
        await combatSystem.processFrameUpdate({
          frameNumber: frame,
          deltaTime: frameTime / 1000,
          activeCombats: [
            { attacker, defender, actionQueue: ['attack', 'move'] }
          ],
          currentTime: Math.floor(Date.now() / 1000),
        });

        const frameEnd = performance.now();
        const actualFrameTime = frameEnd - frameStart;
        frameTimes.push(actualFrameTime);

        // Each frame must complete within 16.67ms for 60 FPS
        expect(actualFrameTime).toBeLessThan(frameTime);
      }

      const avgFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
      const maxFrameTime = Math.max(...frameTimes);

      expect(avgFrameTime).toBeLessThan(frameTime * 0.8); // Average well under limit
      expect(maxFrameTime).toBeLessThan(frameTime); // No frame exceeds limit
    });

    test('should scale with multiple concurrent combats', async () => {
      const combatCount = 10;
      const combats = [];

      // Create multiple concurrent combats
      for (let i = 0; i < combatCount; i++) {
        const combatAttacker = world.createEntity();
        const combatDefender = world.createEntity();
        
        await world.addComponent(combatAttacker, CombatStats, {
          damage_dealt: 0, damage_taken: 0, actions_taken: 0,
          critical_hits: 0, kills: 0, deaths: 0, assists: 0, match_mvp_count: 0
        });
        
        await world.addComponent(combatDefender, CombatStats, {
          damage_dealt: 0, damage_taken: 0, actions_taken: 0,
          critical_hits: 0, kills: 0, deaths: 0, assists: 0, match_mvp_count: 0
        });

        combats.push({ attacker: combatAttacker, defender: combatDefender });
      }

      const startTime = performance.now();

      // Process all combats concurrently
      const results = await Promise.all(
        combats.map(combat => 
          combatSystem.executeBasicAttack({
            attacker: combat.attacker,
            defender: combat.defender,
            attackerStats: { attack: 40, defense: 20, speed: 30, health: 100, mana: 50 },
            defenderStats: { attack: 35, defense: 25, speed: 25, health: 100, mana: 50 },
            power: 20,
            timestamp: Math.floor(Date.now() / 1000),
          })
        )
      );

      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const avgTimePerCombat = totalTime / combatCount;

      expect(results.length).toBe(combatCount);
      expect(results.every(r => r.damage_dealt > 0)).toBe(true);
      expect(totalTime).toBeLessThan(50); // 10 concurrent combats under 50ms
      expect(avgTimePerCombat).toBeLessThan(8); // Each combat under 8ms average
    });

    test('should maintain performance with complex effect combinations', async () => {
      const currentTime = Math.floor(Date.now() / 1000);
      const entities = [];

      // Create 20 entities with complex effect combinations
      for (let i = 0; i < 20; i++) {
        const entity = world.createEntity();
        const activeEffects = {
          effects: new Array(8).fill(null).map((_, idx) => ({
            effect_type: [
              EffectType.Poison, EffectType.Burn, EffectType.Regeneration,
              EffectType.AttackBoost, EffectType.DefenseBoost, EffectType.SpeedBoost,
              EffectType.Shield, EffectType.ManaRegeneration
            ][idx],
            strength: 5.0 + idx * 2,
            duration: 10 + idx * 3,
            expires_at: currentTime + 10 + idx * 3,
            caster: attacker,
          })),
          effect_count: 8,
        };

        await world.addComponent(entity, ActiveEffects, activeEffects);
        entities.push(entity);
      }

      const startTime = performance.now();

      // Process effects for all entities
      const results = await Promise.all(
        entities.map(entity => effectSystem.processEffects(entity, currentTime))
      );

      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const avgTimePerEntity = totalTime / entities.length;

      expect(results.length).toBe(20);
      expect(results.every(r => r.effectsProcessed === 8)).toBe(true);
      expect(totalTime).toBeLessThan(100); // 20 entities with 8 effects each under 100ms
      expect(avgTimePerEntity).toBeLessThan(8); // Each entity under 8ms
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle invalid combat targets gracefully', async () => {
      const invalidEntity = new PublicKey('11111111111111111111111111111111');

      await expect(
        combatSystem.executeBasicAttack({
          attacker,
          defender: invalidEntity as any,
          attackerStats: { attack: 40, defense: 20, speed: 30, health: 100, mana: 50 },
          defenderStats: { attack: 35, defense: 25, speed: 25, health: 100, mana: 50 },
          power: 20,
          timestamp: Math.floor(Date.now() / 1000),
        })
      ).rejects.toThrow('Invalid combat target');
    });

    test('should handle insufficient mana for abilities', async () => {
      const lowManaStats = {
        attack: 40, defense: 20, speed: 30, health: 100, mana: 10 // Too low for special ability
      };

      await expect(
        combatSystem.executeSpecialAbility({
          attacker,
          defender,
          attackerProfile: { player_class: 1, level: 5 },
          attackerStats: lowManaStats,
          defenderStats: { attack: 35, defense: 25, speed: 25, health: 100, mana: 50 },
          power: 25,
          timestamp: Math.floor(Date.now() / 1000),
        })
      ).rejects.toThrow('Insufficient mana');
    });

    test('should handle ability cooldown violations', async () => {
      const currentTime = Math.floor(Date.now() / 1000);
      
      // Set recent cooldown usage
      const cooldowns = await world.getComponent(attacker, AbilityCooldowns);
      cooldowns.basic_attack = currentTime; // Just used
      await world.updateComponent(attacker, AbilityCooldowns, cooldowns);

      await expect(
        combatSystem.executeBasicAttack({
          attacker,
          defender,
          attackerStats: { attack: 40, defense: 20, speed: 30, health: 100, mana: 50 },
          defenderStats: { attack: 35, defense: 25, speed: 25, health: 100, mana: 50 },
          power: 20,
          timestamp: currentTime, // Same timestamp, should be on cooldown
        })
      ).rejects.toThrow('Ability on cooldown');
    });

    test('should handle effect overflow gracefully', async () => {
      const activeEffects = await world.getComponent(attacker, ActiveEffects);
      
      // Fill all effect slots
      for (let i = 0; i < 8; i++) {
        activeEffects.effects[i] = {
          effect_type: EffectType.Poison,
          strength: 10.0,
          duration: 15,
          expires_at: Math.floor(Date.now() / 1000) + 15,
          caster: defender,
        };
      }
      activeEffects.effect_count = 8;
      await world.updateComponent(attacker, ActiveEffects, activeEffects);

      // Try to add one more effect (should fail gracefully)
      const result = await effectSystem.addEffect(attacker, {
        effect_type: EffectType.Burn,
        strength: 15.0,
        duration: 20,
        expires_at: Math.floor(Date.now() / 1000) + 20,
        caster: defender,
      });

      expect(result.success).toBe(false);
      expect(result.reason).toBe('Effect slots full');
    });
  });
});