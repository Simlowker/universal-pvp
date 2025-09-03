/**
 * BOLT ECS Components Unit Tests for MagicBlock Integration
 * Tests all BOLT ECS components with 30ms latency targets
 */

const { expect } = require('@jest/globals');
const { performance } = require('perf_hooks');

// Mock MagicBlock BOLT ECS components
const BoltECS = require('../../../src/magicblock/bolt_ecs');
const { Position, Velocity, Health, Player } = require('../../../src/magicblock/components');
const { MovementSystem, BattleSystem, SyncSystem } = require('../../../src/magicblock/systems');

describe('BOLT ECS Components - MagicBlock Integration', () => {
  let world;
  let entity;
  
  beforeEach(() => {
    // Initialize new world for each test
    world = new BoltECS.World();
    entity = world.createEntity();
  });

  afterEach(() => {
    world.destroy();
  });

  describe('Component Management', () => {
    test('should create and attach Position component within 1ms', () => {
      const startTime = performance.now();
      
      const position = new Position(100, 200);
      world.addComponent(entity, position);
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(1); // Sub-millisecond operation
      expect(world.hasComponent(entity, Position)).toBe(true);
      expect(world.getComponent(entity, Position)).toEqual({ x: 100, y: 200 });
    });

    test('should create and manage Player component with session data', () => {
      const startTime = performance.now();
      
      const player = new Player({
        id: 'player_123',
        sessionKey: 'session_abc123',
        publicKey: '5J1F7GHAvpWXrF5VK2VZ8k4yJ3X8X8X8X8X8X8X8X8X8',
        health: 100,
        energy: 50
      });
      
      world.addComponent(entity, player);
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(1);
      expect(world.getComponent(entity, Player).id).toBe('player_123');
      expect(world.getComponent(entity, Player).sessionKey).toBe('session_abc123');
    });

    test('should handle rapid component updates for real-time gaming', async () => {
      const position = new Position(0, 0);
      const velocity = new Velocity(10, 5);
      
      world.addComponent(entity, position);
      world.addComponent(entity, velocity);
      
      const updates = [];
      const targetUpdates = 100; // Simulate 100 rapid updates
      
      const startTime = performance.now();
      
      for (let i = 0; i < targetUpdates; i++) {
        const updateStart = performance.now();
        
        // Update position based on velocity
        const pos = world.getComponent(entity, Position);
        const vel = world.getComponent(entity, Velocity);
        
        pos.x += vel.x * 0.016; // 60 FPS delta
        pos.y += vel.y * 0.016;
        
        const updateEnd = performance.now();
        updates.push(updateEnd - updateStart);
      }
      
      const totalTime = performance.now() - startTime;
      const avgUpdateTime = updates.reduce((a, b) => a + b, 0) / updates.length;
      
      // Each update should be sub-millisecond for 60+ FPS
      expect(avgUpdateTime).toBeLessThan(0.5);
      expect(totalTime).toBeLessThan(30); // Total under 30ms for batch
      expect(Math.max(...updates)).toBeLessThan(2); // No single update over 2ms
    });
  });

  describe('System Performance', () => {
    test('should process MovementSystem within latency targets', () => {
      const movementSystem = new MovementSystem(world);
      
      // Create multiple entities with movement
      const entities = [];
      for (let i = 0; i < 50; i++) {
        const ent = world.createEntity();
        world.addComponent(ent, new Position(i * 10, i * 10));
        world.addComponent(ent, new Velocity(Math.random() * 20 - 10, Math.random() * 20 - 10));
        entities.push(ent);
      }
      
      const startTime = performance.now();
      movementSystem.update(0.016); // 60 FPS delta
      const endTime = performance.now();
      
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(5); // 5ms for 50 entities
      
      // Verify positions updated
      entities.forEach(ent => {
        const pos = world.getComponent(ent, Position);
        expect(pos).toBeDefined();
        expect(typeof pos.x).toBe('number');
        expect(typeof pos.y).toBe('number');
      });
    });

    test('should handle BattleSystem calculations efficiently', () => {
      const battleSystem = new BattleSystem(world);
      
      // Create battling entities
      const attacker = world.createEntity();
      const defender = world.createEntity();
      
      world.addComponent(attacker, new Player({ id: 'attacker', health: 100 }));
      world.addComponent(defender, new Player({ id: 'defender', health: 100 }));
      world.addComponent(attacker, new Position(0, 0));
      world.addComponent(defender, new Position(5, 5));
      
      const startTime = performance.now();
      
      // Simulate battle calculation
      const result = battleSystem.calculateDamage(attacker, defender, {
        damage: 25,
        type: 'melee',
        critical: false
      });
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(1); // Sub-millisecond damage calculation
      expect(result).toBeDefined();
      expect(result.damage).toBeGreaterThan(0);
      expect(result.final_damage).toBeLessThanOrEqual(25);
    });

    test('should sync state to Ephemeral Rollup within 30ms', async () => {
      const syncSystem = new SyncSystem(world);
      
      // Create state to sync
      const entities = [];
      for (let i = 0; i < 20; i++) {
        const ent = world.createEntity();
        world.addComponent(ent, new Position(i * 5, i * 5));
        world.addComponent(ent, new Player({ id: `player_${i}`, health: 100 - i }));
        entities.push(ent);
      }
      
      const startTime = performance.now();
      
      // Mock ER sync operation
      const syncPromise = syncSystem.syncToEphemeralRollup(entities);
      const syncResult = await syncPromise;
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(30); // 30ms target
      expect(syncResult.success).toBe(true);
      expect(syncResult.entitiesSynced).toBe(entities.length);
      expect(syncResult.transactionHash).toBeDefined();
    });
  });

  describe('Memory Management', () => {
    test('should efficiently manage component memory allocation', () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Create and destroy many entities
      const entities = [];
      for (let i = 0; i < 1000; i++) {
        const ent = world.createEntity();
        world.addComponent(ent, new Position(i, i));
        world.addComponent(ent, new Velocity(i % 10, i % 5));
        world.addComponent(ent, new Player({ id: `player_${i}` }));
        entities.push(ent);
      }
      
      const midMemory = process.memoryUsage().heapUsed;
      
      // Clean up entities
      entities.forEach(ent => world.destroyEntity(ent));
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      
      const memoryGrowth = midMemory - initialMemory;
      const memoryReclaimed = midMemory - finalMemory;
      
      // Memory should be reasonable for 1000 entities
      expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024); // Less than 50MB
      // Should reclaim at least 50% of allocated memory
      expect(memoryReclaimed).toBeGreaterThan(memoryGrowth * 0.5);
    });

    test('should handle component archetype changes efficiently', () => {
      // Test archetype changes when components added/removed
      const entity = world.createEntity();
      
      const times = [];
      
      // Add components one by one
      times.push(measureTime(() => world.addComponent(entity, new Position(0, 0))));
      times.push(measureTime(() => world.addComponent(entity, new Velocity(1, 1))));
      times.push(measureTime(() => world.addComponent(entity, new Health(100))));
      times.push(measureTime(() => world.addComponent(entity, new Player({ id: 'test' }))));
      
      // Remove components one by one
      times.push(measureTime(() => world.removeComponent(entity, Health)));
      times.push(measureTime(() => world.removeComponent(entity, Velocity)));
      times.push(measureTime(() => world.removeComponent(entity, Position)));
      times.push(measureTime(() => world.removeComponent(entity, Player)));
      
      // All archetype changes should be fast
      times.forEach(time => {
        expect(time).toBeLessThan(1); // Sub-millisecond
      });
      
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      expect(avgTime).toBeLessThan(0.5);
    });
  });

  describe('Concurrency and Thread Safety', () => {
    test('should handle concurrent component access safely', async () => {
      const entity = world.createEntity();
      world.addComponent(entity, new Position(0, 0));
      
      const promises = [];
      const results = [];
      
      // Simulate concurrent reads and writes
      for (let i = 0; i < 100; i++) {
        promises.push(
          new Promise((resolve) => {
            const startTime = performance.now();
            
            // Read position
            const pos = world.getComponent(entity, Position);
            
            // Modify position
            pos.x += 1;
            pos.y += 1;
            
            const endTime = performance.now();
            results.push(endTime - startTime);
            resolve();
          })
        );
      }
      
      const startTime = performance.now();
      await Promise.all(promises);
      const totalTime = performance.now() - startTime;
      
      expect(totalTime).toBeLessThan(50); // All concurrent ops under 50ms
      
      const avgOpTime = results.reduce((a, b) => a + b, 0) / results.length;
      expect(avgOpTime).toBeLessThan(2); // Each op under 2ms
      
      // Verify final state consistency
      const finalPos = world.getComponent(entity, Position);
      expect(finalPos.x).toBe(100);
      expect(finalPos.y).toBe(100);
    });
  });

  describe('Error Handling and Recovery', () => {
    test('should gracefully handle component type errors', () => {
      const entity = world.createEntity();
      
      expect(() => {
        world.addComponent(entity, null);
      }).toThrow('Invalid component');
      
      expect(() => {
        world.addComponent(entity, undefined);
      }).toThrow('Invalid component');
      
      expect(() => {
        world.getComponent(entity, 'InvalidComponentType');
      }).toThrow('Component type not found');
    });

    test('should handle world cleanup properly', () => {
      const entities = [];
      for (let i = 0; i < 100; i++) {
        const ent = world.createEntity();
        world.addComponent(ent, new Position(i, i));
        entities.push(ent);
      }
      
      expect(world.entityCount).toBe(100);
      
      world.destroy();
      
      expect(world.entityCount).toBe(0);
      
      // Should throw error when accessing destroyed world
      expect(() => {
        world.createEntity();
      }).toThrow('World has been destroyed');
    });
  });
});

// Helper function to measure execution time
function measureTime(fn) {
  const start = performance.now();
  fn();
  return performance.now() - start;
}