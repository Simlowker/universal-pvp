/**
 * Migration script to replace old mocked implementations with real MagicBlock SDK integration
 */

import { promises as fs } from 'fs';
import * as path from 'path';

export interface MigrationResult {
  filesProcessed: number;
  filesModified: number;
  errors: string[];
  replacements: Array<{
    file: string;
    oldImport: string;
    newImport: string;
    lineNumber: number;
  }>;
}

/**
 * Mapping of old mock implementations to new real implementations
 */
const MOCK_TO_REAL_MAPPINGS = {
  // Session management
  'from \'@magicblock-labs/gum-react-sdk\'': 'from \'../../magicblock/core/real-session-key-manager\'',
  'import { SessionKeyManager }': 'import { RealSessionKeyManager as SessionKeyManager }',
  'new SessionKeyManager(': 'new RealSessionKeyManager(',
  
  // Ephemeral Rollups
  'from \'@magicblock-labs/ephemeral-rollups-sdk\'': 'from \'../../magicblock/rollup/ephemeral-rollups-client\'',
  'import { EphemeralRollupManager }': 'import { EphemeralRollupsClient as EphemeralRollupManager }',
  'new EphemeralRollupManager(': 'new EphemeralRollupsClient(',
  
  // Gasless transactions
  'import { GaslessManager }': 'import { GaslessTransactionManager as GaslessManager }',
  'new GaslessManager(': 'new GaslessTransactionManager(',
  
  // State sync
  'import { StateSync }': 'import { StateSync } from \'../../magicblock/core/state-sync\'',
  'new StateSync(': 'new StateSync(',
  
  // VRF
  'import { VRFClient }': 'import { DevNetVRFPlugin as VRFClient }',
  'new VRFClient(': 'new DevNetVRFPlugin(',
  
  // Game engine
  'import { GameEngine }': 'import { RollupGameEngine as GameEngine }',
  'new GameEngine(': 'new RollupGameEngine(',
  
  // Configuration
  'import { SOLDUEL_CONFIG }': 'import { MAGICBLOCK_DEVNET_CONFIG as SOLDUEL_CONFIG }',
  'SOLDUEL_CONFIG': 'MAGICBLOCK_DEVNET_CONFIG',
  
  // MagicBlock service
  'MagicBlockService': 'MagicBlockSDKInstance',
  'new MagicBlockService(': 'await initializeMagicBlockSDK('
};

/**
 * Files to process for migration
 */
const TARGET_FILES = [
  'src/frontend/contexts/MagicBlockContext.tsx',
  'src/frontend/components/game/MagicBlockBattleArena.tsx',
  'src/contexts/MagicBlockProvider.tsx',
  'src/strategic-duel/services/MagicBlockService.ts',
  'src/strategic-duel/config/magicblock.config.ts',
  'magicblock-pvp/apps/web/contexts/MagicBlockContext.tsx',
  'magicblock-pvp/apps/web/components/game/MagicBlockBattleArena.tsx',
  'magicblock-pvp/apps/server/src/services/magicblock.ts',
  'magicblock-pvp/packages/sdk/src/clients/magicblock-client.ts'
];

/**
 * Replace mock implementations with real MagicBlock SDK
 */
export async function replaceMockImplementations(
  projectRoot: string = '/Users/simeonfluck/universal pvp'
): Promise<MigrationResult> {
  const result: MigrationResult = {
    filesProcessed: 0,
    filesModified: 0,
    errors: [],
    replacements: []
  };
  
  console.log('🔄 Starting MagicBlock mock replacement migration...');
  
  for (const targetFile of TARGET_FILES) {
    const filePath = path.join(projectRoot, targetFile);
    
    try {
      // Check if file exists
      const exists = await fs.access(filePath).then(() => true).catch(() => false);
      if (!exists) {
        console.log(`⚠️ File not found: ${targetFile}`);
        continue;
      }
      
      result.filesProcessed++;
      
      // Read file content
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n');
      
      let modified = false;
      let newContent = content;
      
      // Apply replacements
      for (const [oldPattern, newPattern] of Object.entries(MOCK_TO_REAL_MAPPINGS)) {
        if (content.includes(oldPattern)) {
          const regex = new RegExp(escapeRegExp(oldPattern), 'g');
          newContent = newContent.replace(regex, newPattern);
          
          // Find line number for logging
          const lineNumber = lines.findIndex(line => line.includes(oldPattern)) + 1;
          
          result.replacements.push({
            file: targetFile,
            oldImport: oldPattern,
            newImport: newPattern,
            lineNumber
          });
          
          modified = true;
        }
      }
      
      // Apply file-specific transformations
      newContent = await applyFileSpecificTransformations(targetFile, newContent);
      
      if (modified || newContent !== content) {
        // Write back modified content
        await fs.writeFile(filePath, newContent, 'utf8');
        result.filesModified++;
        
        console.log(`✅ Modified: ${targetFile}`);
      }
      
    } catch (error) {
      const errorMsg = `Failed to process ${targetFile}: ${error.message}`;
      result.errors.push(errorMsg);
      console.error(`❌ ${errorMsg}`);
    }
  }
  
  // Generate migration report
  await generateMigrationReport(result, projectRoot);
  
  console.log(`🎉 Migration completed:`);
  console.log(`  Files processed: ${result.filesProcessed}`);
  console.log(`  Files modified: ${result.filesModified}`);
  console.log(`  Total replacements: ${result.replacements.length}`);
  console.log(`  Errors: ${result.errors.length}`);
  
  return result;
}

/**
 * Apply file-specific transformations
 */
async function applyFileSpecificTransformations(
  filePath: string,
  content: string
): Promise<string> {
  let newContent = content;
  
  // MagicBlockContext.tsx specific changes
  if (filePath.includes('MagicBlockContext.tsx')) {
    newContent = transformMagicBlockContext(newContent);
  }
  
  // MagicBlockBattleArena.tsx specific changes
  if (filePath.includes('MagicBlockBattleArena.tsx')) {
    newContent = transformBattleArena(newContent);
  }
  
  // MagicBlockService.ts specific changes
  if (filePath.includes('MagicBlockService.ts')) {
    newContent = transformMagicBlockService(newContent);
  }
  
  // Configuration files
  if (filePath.includes('magicblock.config.ts')) {
    newContent = transformConfiguration(newContent);
  }
  
  return newContent;
}

/**
 * Transform MagicBlockContext files
 */
function transformMagicBlockContext(content: string): string {
  // Add new imports
  const newImports = `
import {
  initializeMagicBlockSDK,
  MagicBlockSDKInstance,
  MagicBlockStatus,
  MagicBlockMetrics
} from '../magicblock/index';
`;
  
  // Replace context provider implementation
  const oldProvider = /const MagicBlockProvider[^}]+}/s;
  const newProvider = `const MagicBlockProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sdk, setSdk] = useState<MagicBlockSDKInstance | null>(null);
  const [status, setStatus] = useState<MagicBlockStatus | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  
  const initializeSDK = useCallback(async () => {
    if (isInitializing || sdk) return;
    
    setIsInitializing(true);
    try {
      const newSDK = await initializeMagicBlockSDK({
        network: 'devnet',
        enableVRF: true,
        enableRollups: true,
        enableGasless: true,
        maxLatencyMs: 30,
        autoOptimize: true
      });
      
      setSdk(newSDK);
      
      // Update status periodically
      const updateStatus = async () => {
        const currentStatus = await newSDK.getStatus();
        setStatus(currentStatus);
      };
      
      updateStatus();
      const statusInterval = setInterval(updateStatus, 5000);
      
      return () => {
        clearInterval(statusInterval);
        newSDK.cleanup();
      };
      
    } catch (error) {
      console.error('Failed to initialize MagicBlock SDK:', error);
    } finally {
      setIsInitializing(false);
    }
  }, [isInitializing, sdk]);
  
  useEffect(() => {
    initializeSDK();
  }, [initializeSDK]);
  
  return (
    <MagicBlockContext.Provider value={{
      sdk,
      status,
      isInitializing,
      initializeSDK
    }}>
      {children}
    </MagicBlockContext.Provider>
  );
}`;
  
  return content
    .replace(/import.*from.*['"]@magicblock-labs.*['"];?\s*\n/g, newImports)
    .replace(oldProvider, newProvider);
}

/**
 * Transform BattleArena components
 */
function transformBattleArena(content: string): string {
  // Replace battle arena implementation with new SDK calls
  const oldBattleLogic = /const.*battle.*=.*{[^}]+}/s;
  const newBattleLogic = `const executeBattleAction = async (action: GameAction) => {
    if (!sdk || !gameState) return;
    
    try {
      const transition = await sdk.gameEngine.executeGameAction(
        gameState.gameId,
        action,
        sessionId
      );
      
      if (transition.valid) {
        setGameState(transition.to);
        onActionExecuted?.(transition);
      }
    } catch (error) {
      console.error('Battle action failed:', error);
      onError?.(error);
    }
  };`;
  
  return content.replace(oldBattleLogic, newBattleLogic);
}

/**
 * Transform MagicBlockService
 */
function transformMagicBlockService(content: string): string {
  // Replace entire service with SDK initialization
  const serviceReplacement = `
/**
 * MagicBlock Service - Updated to use real SDK
 */

import { 
  initializeMagicBlockSDK, 
  MagicBlockSDKInstance,
  MagicBlockStatus,
  MagicBlockMetrics 
} from '../magicblock/index';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';

export class MagicBlockService {
  private sdk: MagicBlockSDKInstance | null = null;
  private isInitialized = false;
  
  async initialize(authority: Keypair): Promise<void> {
    if (this.isInitialized) return;
    
    this.sdk = await initializeMagicBlockSDK({
      network: 'devnet',
      authority,
      enableVRF: true,
      enableRollups: true,
      enableGasless: true,
      maxLatencyMs: 30,
      autoOptimize: true
    });
    
    this.isInitialized = true;
  }
  
  getSDK(): MagicBlockSDKInstance {
    if (!this.sdk) {
      throw new Error('MagicBlock SDK not initialized');
    }
    return this.sdk;
  }
  
  async getStatus(): Promise<MagicBlockStatus> {
    return this.getSDK().getStatus();
  }
  
  getMetrics(): MagicBlockMetrics {
    return this.getSDK().getMetrics();
  }
  
  async cleanup(): Promise<void> {
    if (this.sdk) {
      await this.sdk.cleanup();
      this.sdk = null;
      this.isInitialized = false;
    }
  }
}

export default MagicBlockService;
`;
  
  return serviceReplacement;
}

/**
 * Transform configuration files
 */
function transformConfiguration(content: string): string {
  // Replace configuration imports and exports
  return content
    .replace(/export.*SOLDUEL_CONFIG/g, 'export { MAGICBLOCK_DEVNET_CONFIG as SOLDUEL_CONFIG }')
    .replace(/from.*magicblock\.config/g, 'from \'../magicblock/config/devnet-endpoints\'');
}

/**
 * Generate migration report
 */
async function generateMigrationReport(
  result: MigrationResult,
  projectRoot: string
): Promise<void> {
  const reportPath = path.join(projectRoot, 'migration-report.md');
  
  const report = `# MagicBlock Migration Report

Generated: ${new Date().toISOString()}

## Summary

- **Files Processed**: ${result.filesProcessed}
- **Files Modified**: ${result.filesModified}
- **Total Replacements**: ${result.replacements.length}
- **Errors**: ${result.errors.length}

## Replacements Made

${result.replacements.map(r => `
### ${r.file}:${r.lineNumber}
- **Old**: \`${r.oldImport}\`
- **New**: \`${r.newImport}\`
`).join('')}

## Errors

${result.errors.map(error => `- ${error}`).join('\n')}

## Next Steps

1. Update import statements in TypeScript configuration
2. Run \`npm run type-check\` to verify types
3. Run \`npm run test:integration\` to validate functionality
4. Update documentation to reflect new API

## Rollback

If rollback is needed, restore files from git:
\`\`\`bash
git checkout HEAD -- ${TARGET_FILES.join(' ')}
\`\`\`
`;
  
  await fs.writeFile(reportPath, report, 'utf8');
  console.log(`📋 Migration report generated: ${reportPath}`);
}

/**
 * Escape special regex characters
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Validate migration by checking imports
 */
export async function validateMigration(
  projectRoot: string = '/Users/simeonfluck/universal pvp'
): Promise<{
  valid: boolean;
  issues: string[];
  suggestions: string[];
}> {
  const issues: string[] = [];
  const suggestions: string[] = [];
  
  console.log('🔍 Validating migration...');
  
  for (const targetFile of TARGET_FILES) {
    const filePath = path.join(projectRoot, targetFile);
    
    try {
      const content = await fs.readFile(filePath, 'utf8');
      
      // Check for remaining mock references
      const mockPatterns = [
        /@magicblock-labs\/.*-sdk/,
        /SessionKeyManager.*from.*gum/,
        /EphemeralRollupManager.*from.*ephemeral/,
        /SOLDUEL_CONFIG.*from.*config/
      ];
      
      mockPatterns.forEach(pattern => {
        if (pattern.test(content)) {
          issues.push(`${targetFile}: Still contains mock reference: ${pattern}`);
        }
      });
      
      // Check for required new imports
      if (targetFile.includes('MagicBlock') && !content.includes('from \'../magicblock/')) {
        suggestions.push(`${targetFile}: Consider adding proper relative imports`);
      }
      
    } catch (error) {
      issues.push(`${targetFile}: Validation failed - ${error.message}`);
    }
  }
  
  const valid = issues.length === 0;
  
  console.log(valid ? '✅ Migration validation passed' : '❌ Migration validation failed');
  
  return { valid, issues, suggestions };
}

// CLI execution
if (require.main === module) {
  replaceMockImplementations().then(result => {
    if (result.errors.length > 0) {
      process.exit(1);
    }
    
    validateMigration().then(validation => {
      if (!validation.valid) {
        console.error('Validation failed:', validation.issues);
        process.exit(1);
      }
      
      console.log('🎉 Migration completed successfully!');
    });
  }).catch(error => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
}

export default {
  replaceMockImplementations,
  validateMigration
};