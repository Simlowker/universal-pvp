#!/usr/bin/env tsx

/**
 * Database migration utility script
 * This script provides utilities for managing database migrations
 */

import { PrismaClient } from '@prisma/client';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile, writeFile, mkdir, readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const prisma = new PrismaClient();

// Colors for console output
const colors = {
  reset: '\\033[0m',
  red: '\\033[31m',
  green: '\\033[32m',
  yellow: '\\033[33m',
  blue: '\\033[34m',
  magenta: '\\033[35m',
  cyan: '\\033[36m',
};

const log = {
  info: (msg: string) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg: string) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warn: (msg: string) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  step: (msg: string) => console.log(`${colors.cyan}→${colors.reset} ${msg}`),
};

interface MigrationInfo {
  id: string;
  checksum: string;
  finished_at: Date | null;
  migration_name: string;
  logs: string | null;
  rolled_back_at: Date | null;
  started_at: Date;
  applied_steps_count: number;
}

class MigrationManager {
  private migrationsDir: string;

  constructor() {
    this.migrationsDir = join(process.cwd(), 'prisma', 'migrations');
  }

  /**
   * Get all applied migrations from the database
   */
  async getAppliedMigrations(): Promise<MigrationInfo[]> {
    try {
      const migrations = await prisma.$queryRaw<MigrationInfo[]>`
        SELECT * FROM _prisma_migrations 
        ORDER BY started_at ASC
      `;
      return migrations;
    } catch (error) {
      if (error instanceof Error && error.message.includes('_prisma_migrations')) {
        log.warn('Migrations table does not exist. Database may not be initialized.');
        return [];
      }
      throw error;
    }
  }

  /**
   * Get all migration files from the filesystem
   */
  async getMigrationFiles(): Promise<string[]> {
    try {
      const entries = await readdir(this.migrationsDir, { withFileTypes: true });
      return entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .sort();
    } catch (error) {
      log.warn('Migrations directory does not exist');
      return [];
    }
  }

  /**
   * Show migration status
   */
  async status(): Promise<void> {
    log.info('Checking migration status...');

    const [appliedMigrations, migrationFiles] = await Promise.all([
      this.getAppliedMigrations(),
      this.getMigrationFiles(),
    ]);

    console.log('\\n📊 Migration Status:');
    console.log(`Applied migrations: ${appliedMigrations.length}`);
    console.log(`Migration files: ${migrationFiles.length}`);

    if (appliedMigrations.length === 0 && migrationFiles.length === 0) {
      log.warn('No migrations found');
      return;
    }

    // Show detailed status
    console.log('\\n📋 Detailed Status:');
    
    const appliedIds = new Set(appliedMigrations.map(m => m.migration_name));
    
    for (const file of migrationFiles) {
      const isApplied = appliedIds.has(file);
      const status = isApplied ? '✅ Applied' : '⏳ Pending';
      console.log(`  ${status} ${file}`);
    }

    // Show any migrations in DB but not in files
    for (const migration of appliedMigrations) {
      if (!migrationFiles.includes(migration.migration_name)) {
        console.log(`  🚨 Missing ${migration.migration_name} (in DB but file not found)`);
      }
    }

    // Show last applied migration
    if (appliedMigrations.length > 0) {
      const lastMigration = appliedMigrations[appliedMigrations.length - 1];
      console.log(`\\n🕐 Last applied: ${lastMigration.migration_name}`);
      console.log(`   Applied at: ${lastMigration.finished_at}`);
    }
  }

  /**
   * Create a new migration
   */
  async create(name: string): Promise<void> {
    if (!name) {
      log.error('Migration name is required');
      process.exit(1);
    }

    log.step(`Creating migration: ${name}`);

    try {
      const { stdout, stderr } = await execAsync(`npx prisma migrate dev --name ${name}`);
      
      if (stderr && !stderr.includes('warnings')) {
        log.warn(stderr);
      }
      
      log.success(`Migration created: ${name}`);
      if (stdout) {
        console.log(stdout);
      }
    } catch (error) {
      log.error(`Failed to create migration: ${error}`);
      process.exit(1);
    }
  }

  /**
   * Apply pending migrations
   */
  async deploy(): Promise<void> {
    log.step('Deploying migrations...');

    try {
      const { stdout, stderr } = await execAsync('npx prisma migrate deploy');
      
      if (stderr && !stderr.includes('warnings')) {
        log.warn(stderr);
      }
      
      log.success('Migrations deployed successfully');
      if (stdout) {
        console.log(stdout);
      }
    } catch (error) {
      log.error(`Failed to deploy migrations: ${error}`);
      process.exit(1);
    }
  }

  /**
   * Reset the database (dangerous!)
   */
  async reset(): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      log.error('Cannot reset production database!');
      process.exit(1);
    }

    log.warn('This will completely reset your database!');
    
    // In a real CLI, you'd prompt for confirmation here
    // For this script, we'll assume it's being run intentionally
    
    log.step('Resetting database...');

    try {
      const { stdout, stderr } = await execAsync('npx prisma migrate reset --force');
      
      if (stderr && !stderr.includes('warnings')) {
        log.warn(stderr);
      }
      
      log.success('Database reset successfully');
      if (stdout) {
        console.log(stdout);
      }
    } catch (error) {
      log.error(`Failed to reset database: ${error}`);
      process.exit(1);
    }
  }

  /**
   * Generate Prisma client
   */
  async generate(): Promise<void> {
    log.step('Generating Prisma client...');

    try {
      const { stdout, stderr } = await execAsync('npx prisma generate');
      
      if (stderr && !stderr.includes('warnings')) {
        log.warn(stderr);
      }
      
      log.success('Prisma client generated successfully');
      if (stdout) {
        console.log(stdout);
      }
    } catch (error) {
      log.error(`Failed to generate Prisma client: ${error}`);
      process.exit(1);
    }
  }

  /**
   * Create a data migration (for data transformations)
   */
  async createDataMigration(name: string): Promise<void> {
    if (!name) {
      log.error('Data migration name is required');
      process.exit(1);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const migrationName = `${timestamp}_${name}`;
    const migrationDir = join(this.migrationsDir, 'data', migrationName);
    
    try {
      await mkdir(migrationDir, { recursive: true });
      
      const migrationTemplate = `import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Data migration: ${name}
 * 
 * This script performs data transformations that cannot be expressed
 * as DDL (Data Definition Language) changes in regular Prisma migrations.
 * 
 * Execute with: tsx prisma/migrations/data/${migrationName}/migration.ts
 */

export async function up(): Promise<void> {
  console.log('Running data migration: ${name}');
  
  try {
    // Add your migration logic here
    
    console.log('✅ Data migration completed successfully');
  } catch (error) {
    console.error('❌ Data migration failed:', error);
    throw error;
  }
}

export async function down(): Promise<void> {
  console.log('Rolling back data migration: ${name}');
  
  try {
    // Add your rollback logic here
    
    console.log('✅ Data migration rollback completed successfully');
  } catch (error) {
    console.error('❌ Data migration rollback failed:', error);
    throw error;
  }
}

// Run migration if called directly
if (require.main === module) {
  up()
    .catch(error => {
      console.error(error);
      process.exit(1);
    })
    .finally(() => {
      prisma.$disconnect();
    });
}
`;

      const migrationFile = join(migrationDir, 'migration.ts');
      await writeFile(migrationFile, migrationTemplate);
      
      log.success(`Data migration created: ${migrationFile}`);
      log.info(`Run with: tsx ${migrationFile}`);
    } catch (error) {
      log.error(`Failed to create data migration: ${error}`);
      process.exit(1);
    }
  }

  /**
   * Validate migration consistency
   */
  async validate(): Promise<void> {
    log.step('Validating migrations...');

    try {
      // Check if database schema matches Prisma schema
      const { stdout, stderr } = await execAsync('npx prisma db diff');
      
      if (stdout.trim() === '') {
        log.success('Database schema is in sync with Prisma schema');
      } else {
        log.warn('Database schema differs from Prisma schema:');
        console.log(stdout);
      }
      
      if (stderr) {
        log.warn(stderr);
      }
    } catch (error) {
      log.error(`Validation failed: ${error}`);
      process.exit(1);
    }
  }

  /**
   * Show migration history
   */
  async history(): Promise<void> {
    log.info('Loading migration history...');

    const migrations = await this.getAppliedMigrations();
    
    if (migrations.length === 0) {
      log.warn('No migrations have been applied');
      return;
    }

    console.log('\\n📜 Migration History:');
    
    for (const migration of migrations) {
      const status = migration.rolled_back_at ? '🔄 Rolled back' : '✅ Applied';
      const duration = migration.finished_at && migration.started_at 
        ? `(${Math.round((migration.finished_at.getTime() - migration.started_at.getTime()) / 1000)}s)`
        : '';
      
      console.log(`  ${status} ${migration.migration_name} ${duration}`);
      console.log(`    Started: ${migration.started_at.toISOString()}`);
      
      if (migration.finished_at) {
        console.log(`    Finished: ${migration.finished_at.toISOString()}`);
      }
      
      if (migration.rolled_back_at) {
        console.log(`    Rolled back: ${migration.rolled_back_at.toISOString()}`);
      }
      
      console.log(`    Steps: ${migration.applied_steps_count}`);
      
      if (migration.logs) {
        console.log(`    Logs: ${migration.logs.substring(0, 100)}...`);
      }
      
      console.log('');
    }
  }

  /**
   * Check for pending migrations
   */
  async checkPending(): Promise<boolean> {
    const [appliedMigrations, migrationFiles] = await Promise.all([
      this.getAppliedMigrations(),
      this.getMigrationFiles(),
    ]);

    const appliedIds = new Set(appliedMigrations.map(m => m.migration_name));
    const pendingMigrations = migrationFiles.filter(file => !appliedIds.has(file));

    if (pendingMigrations.length > 0) {
      log.warn(`${pendingMigrations.length} pending migrations found:`);
      pendingMigrations.forEach(migration => {
        console.log(`  ⏳ ${migration}`);
      });
      return true;
    } else {
      log.success('All migrations are up to date');
      return false;
    }
  }
}

// CLI interface
async function main() {
  const migrationManager = new MigrationManager();
  const command = process.argv[2];
  const arg = process.argv[3];

  try {
    switch (command) {
      case 'status':
        await migrationManager.status();
        break;
      
      case 'create':
        if (!arg) {
          log.error('Usage: migration.ts create <migration-name>');
          process.exit(1);
        }
        await migrationManager.create(arg);
        break;
      
      case 'deploy':
        await migrationManager.deploy();
        break;
      
      case 'reset':
        await migrationManager.reset();
        break;
      
      case 'generate':
        await migrationManager.generate();
        break;
      
      case 'data':
        if (!arg) {
          log.error('Usage: migration.ts data <migration-name>');
          process.exit(1);
        }
        await migrationManager.createDataMigration(arg);
        break;
      
      case 'validate':
        await migrationManager.validate();
        break;
      
      case 'history':
        await migrationManager.history();
        break;
      
      case 'check':
        const hasPending = await migrationManager.checkPending();
        process.exit(hasPending ? 1 : 0);
      
      default:
        console.log(`
${colors.cyan}MagicBlock PvP Database Migration Manager${colors.reset}

Usage: tsx scripts/db/migration.ts <command> [args]

Commands:
  status              Show current migration status
  create <name>       Create a new migration
  deploy              Apply pending migrations  
  reset               Reset database (dev only)
  generate            Generate Prisma client
  data <name>         Create a data migration
  validate            Validate schema consistency
  history             Show migration history
  check               Check for pending migrations

Examples:
  tsx scripts/db/migration.ts status
  tsx scripts/db/migration.ts create add_user_preferences
  tsx scripts/db/migration.ts deploy
  tsx scripts/db/migration.ts data migrate_old_game_format
        `);
        break;
    }
  } catch (error) {
    log.error(`Command failed: ${error}`);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}