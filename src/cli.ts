#!/usr/bin/env node

import { Command } from 'commander';
import { promises as fs } from 'fs';
import path from 'path';
import clipboardy from 'clipboardy';
import cliProgress from 'cli-progress';
import { NpmManager } from './managers/NpmManager.js';
import { formatReport, formatActionableInsights, formatActionableInsightsConsole } from './utils/formatter.js';
import { UpdateOptions } from './managers/types.js';
import { InteractiveMenu } from './utils/interactive.js';
import {
  InvalidProjectError,
  ClipboardError,
  FileSystemError,
  formatError,
  wrapError
} from './utils/errors.js';

const program = new Command();

program
  .name('depsver')
  .description('Analyzes project dependencies and generates an AI-ready report')
  .version('1.0.0')
  .argument('[path]', 'directory to analyze', '.')
  .option('-o, --output <file>', 'output file for results')
  .option('--clip', 'copy results to clipboard')
  .action(async (pathArg, options) => {
    let progressBar: cliProgress.SingleBar | null = null;
    
    try {
      // Get absolute path
      const resolvedPath = path.resolve(pathArg);
      
      // Instantiate manager
      const manager = new NpmManager();
      
      // Check if this is a valid npm project
      try {
        const isValid = await manager.detect(resolvedPath);
        if (!isValid) {
          throw new InvalidProjectError(resolvedPath);
        }
      } catch (error) {
        if (error instanceof InvalidProjectError) {
          console.error(formatError(error));
          process.exit(1);
        }
        throw error;
      }
      
      // Create progress bar with stderr stream to avoid corrupting output
      progressBar = new cliProgress.SingleBar({
        stream: process.stderr,
        format: 'Fetching latest versions... {bar} {value}/{total} packages'
      });
      
      // Create progress callbacks
      const onProgress = {
        start: (total: number, payload: string) => {
          progressBar!.start(total, 0);
        },
        increment: (payload: string) => {
          progressBar!.increment();
        },
        stop: () => {
          progressBar!.stop();
        }
      };
      
      // Run analysis with progress tracking
      const report = await manager.analyze(resolvedPath, onProgress);
      
      // Format report
      const markdownReport = formatReport(report);
      
      // Handle output
      if (options.clip) {
        try {
          await clipboardy.write(markdownReport);
          console.log('Report copied to clipboard!');
        } catch (error) {
          const clipboardError = wrapError(error, 'Failed to copy to clipboard') as ClipboardError;
          console.error(formatError(clipboardError));
          process.exit(1);
        }
      } else if (options.output) {
        try {
          // Display Actionable Insights to console (plain text format)
          const actionableInsightsConsole = formatActionableInsightsConsole(report);
          console.log(actionableInsightsConsole);
          
          // Write full report to file
          await fs.writeFile(options.output, markdownReport);
          console.log(`Report written to file: ${options.output}`);
        } catch (error) {
          const fsError = wrapError(error, `Failed to write report to ${options.output}`) as FileSystemError;
          console.error(formatError(fsError));
          process.exit(1);
        }
      } else {
        console.log(markdownReport);
      }
      
    } catch (error) {
      // Handle known DepsverErrors with proper formatting
      if (error instanceof InvalidProjectError ||
          error instanceof ClipboardError ||
          error instanceof FileSystemError) {
        console.error(formatError(error));
        process.exit(1);
      }
      
      // Handle any other errors
      console.error(formatError(wrapError(error, 'Analysis failed')));
      process.exit(1);
    } finally {
      // Always stop the progress bar
      if (progressBar) {
        progressBar.stop();
      }
    }
  });

// Update command
program
  .command('update')
  .argument('[path]', 'directory to analyze', '.')
  .description('Interactively update dependencies')
  .option('-i, --interactive', 'Interactive package selection')
  .option('-s, --safe-only', 'Only show safe updates')
  .option('-p, --preview', 'Preview changes without applying')
  .option('--include-dev', 'Include dev dependencies')
  .option('--dry-run', 'Show what would be updated')
  .option('--no-tests', 'Skip running tests before/after updates')
  .action(async (pathArg, options) => {
    let progressBar: cliProgress.SingleBar | null = null;
    
    try {
      // Get absolute path
      const resolvedPath = path.resolve(pathArg);
      
      // Instantiate manager
      const manager = new NpmManager();
      
      // Check if this is a valid npm project
      try {
        const isValid = await manager.detect(resolvedPath);
        if (!isValid) {
          throw new InvalidProjectError(resolvedPath);
        }
      } catch (error) {
        if (error instanceof InvalidProjectError) {
          console.error(formatError(error));
          process.exit(1);
        }
        throw error;
      }
      
      // Create progress bar with stderr stream to avoid corrupting output
      progressBar = new cliProgress.SingleBar({
        stream: process.stderr,
        format: 'Fetching latest versions... {bar} {value}/{total} packages'
      });
      
      // Create progress callbacks
      const onProgress = {
        start: (total: number, payload: string) => {
          progressBar!.start(total, 0);
        },
        increment: (payload: string) => {
          progressBar!.increment();
        },
        stop: () => {
          progressBar!.stop();
        }
      };
      
      // Create update options
      const updateOptions: UpdateOptions = {
        interactive: options.interactive,
        safeOnly: options.safeOnly,
        preview: options.preview,
        includeDev: options.includeDev,
        dryRun: options.dryRun,
        backup: true, // Default to backup for safety
        runTests: options.tests !== false // Default to running tests
      };
      
      // Preview updates - FIXED: Pass the target directory
      console.log('Analyzing available updates...');
      const plan = await manager.previewUpdate(updateOptions, onProgress, resolvedPath);
      
      // Stop progress bar
      if (progressBar) {
        progressBar.stop();
        progressBar = null;
      }
      
      // Display update plan
      displayUpdatePlan(plan);
      
      if (options.preview || options.dryRun) {
        console.log('\n🔍 Preview mode - no changes will be applied');
        return;
      }
      
      // Interactive selection
      let selectedPackages: string[] = [];
      if (options.interactive) {
        selectedPackages = await selectPackagesInteractively(plan);
      } else {
        // Select all safe updates by default
        selectedPackages = plan.categories.safe.map(p => p.name);
      }
      
      if (selectedPackages.length === 0) {
        console.log('No packages selected for update.');
        return;
      }
      
      // Confirm updates
      console.log(`\n📦 Updating ${selectedPackages.length} packages: ${selectedPackages.join(', ')}`);
      
      // Perform updates
      const result = await manager.update(selectedPackages, updateOptions, resolvedPath);
      
      // Display results
      displayUpdateResults(result);
      
    } catch (error) {
      console.error(formatError(wrapError(error, 'Update failed')));
      process.exit(1);
    } finally {
      // Always stop the progress bar
      if (progressBar) {
        progressBar.stop();
      }
    }
  });

// Rollback command
program
  .command('rollback')
  .description('Rollback to a previous backup')
  .argument('<backup-path>', 'path to backup directory')
  .action(async (backupPath) => {
    try {
      const manager = new NpmManager();
      
      console.log(`🔄 Restoring from backup: ${backupPath}`);
      await manager.restoreBackup(backupPath);
      
      console.log('✅ Rollback completed successfully');
      console.log('💡 Run "npm install" to ensure all dependencies are properly installed');
      
    } catch (error) {
      console.error(formatError(wrapError(error, 'Rollback failed')));
      process.exit(1);
    }
  });

program.parse();

// Helper functions
function displayUpdatePlan(plan: any): void {
  console.log('\n📋 Update Plan');
  console.log('================');
  
  console.log(`\n✅ Safe updates: ${plan.categories.safe.length}`);
  plan.categories.safe.forEach((pkg: any) => {
    console.log(`  ${pkg.name}: ${pkg.currentVersion} → ${pkg.targetVersion} (${pkg.updateType})`);
  });
  
  console.log(`\n⚠️  Major updates: ${plan.categories.major.length}`);
  plan.categories.major.forEach((pkg: any) => {
    console.log(`  ${pkg.name}: ${pkg.currentVersion} → ${pkg.targetVersion} (major)`);
  });
  
  console.log(`\n🚫 Blocked updates: ${plan.categories.blocked.length}`);
  plan.categories.blocked.forEach((pkg: any) => {
    console.log(`  ${pkg.name}: ${pkg.currentVersion} → ${pkg.targetVersion} (blocked by ${pkg.blocker})`);
  });
  
  if (plan.risks.length > 0) {
    console.log('\n⚠️  Risks:');
    plan.risks.forEach((risk: string) => {
      console.log(`  • ${risk}`);
    });
  }
  
  console.log(`\n⏱️  Estimated time: ${Math.round(plan.estimatedTime / 60)} minutes`);
}

async function selectPackagesInteractively(plan: any): Promise<string[]> {
  const menu = new InteractiveMenu();
  try {
    return await menu.selectPackages(plan);
  } finally {
    menu.close();
  }
}

function displayUpdateResults(result: any): void {
  console.log('\n📊 Update Results');
  console.log('==================');
  
  if (result.success) {
    console.log(`✅ Successfully updated ${result.updated.length} packages:`);
    result.updated.forEach((pkg: any) => {
      console.log(`  ${pkg.name}: ${pkg.currentVersion} → ${pkg.targetVersion}`);
    });
  } else {
    console.log('❌ Update completed with errors');
  }
  
  if (result.failed.length > 0) {
    console.log(`\n❌ Failed to update ${result.failed.length} packages:`);
    result.failed.forEach((pkg: any) => {
      console.log(`  ${pkg.name}`);
    });
  }
  
  if (result.backupPath) {
    console.log(`\n💾 Backup created at: ${result.backupPath}`);
    console.log('   Use "depsver rollback <path>" to restore if needed');
  }
  
  if (result.errors && result.errors.length > 0) {
    console.log('\n🚨 Errors:');
    result.errors.forEach((error: string) => {
      console.log(`  ${error}`);
    });
  }
}
