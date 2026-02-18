import { PackageUpdate, UpdateResult } from '../managers/types.js';
import { PerformanceOptimizer, ProgressTracker, MemoryMonitor } from './performance.js';

/**
 * User experience enhancement utilities
 */
export class UXEnhancer {
  private static spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private static currentSpinner: NodeJS.Timeout | null = null;

  /**
   * Enhanced progress display with real-time metrics
   */
  static createEnhancedProgress(total: number, description: string): EnhancedProgressDisplay {
    const tracker = PerformanceOptimizer.createProgressTracker(total);
    const memoryMonitor = PerformanceOptimizer.createMemoryMonitor();
    let spinnerIndex = 0;

    const display = {
      start: () => {
        this.startSpinner(description);
        memoryMonitor.sample();
      },

      update: (increment = 1, current?: string) => {
        const metrics = tracker.update(increment);
        const memory = memoryMonitor.sample();

        this.updateProgressDisplay({
          ...metrics,
          current: current || '',
          memoryMB: Math.round(memory.heapUsed / 1024 / 1024),
          memoryTrend: memoryMonitor.getTrend(),
          description
        });
      },

      finish: (message?: string) => {
        this.stopSpinner();
        const finalMetrics = tracker.getMetrics();
        const peakMemory = memoryMonitor.getPeak();

        this.displayCompletionSummary(finalMetrics, peakMemory, message);
      },

      getMetrics: () => tracker.getMetrics()
    };

    return display;
  }

  /**
   * Interactive package selection with enhanced UI
   */
  static async interactivePackageSelection(
    packages: PackageUpdate[],
    options: SelectionOptions = {}
  ): Promise<SelectionResult> {
    console.log('\n📦 Interactive Package Selection');
    console.log('================================\n');

    // Group packages by category
    const grouped = this.groupPackagesByCategory(packages);

    // Display summary
    this.displaySelectionSummary(grouped);

    const selected: string[] = [];
    const deselected: string[] = [];

    // Smart selection suggestions
    if (options.showSuggestions) {
      this.displaySelectionSuggestions(grouped);
    }

    // Interactive selection loop
    for (const [category, categoryPackages] of Object.entries(grouped)) {
      if (categoryPackages.length === 0) continue;

      console.log(`\n${this.getCategoryIcon(category)} ${category.toUpperCase()} PACKAGES`);
      console.log('-'.repeat(50));

      const categorySelection = await this.selectPackagesInCategory(
        categoryPackages,
        category,
        options
      );

      selected.push(...categorySelection.selected);
      deselected.push(...categorySelection.deselected);
    }

    // Display selection summary
    this.displayFinalSelection(selected, deselected, packages);

    return {
      selected,
      deselected,
      total: packages.length,
      selectedCount: selected.length,
      deselectedCount: deselected.length
    };
  }

  /**
   * Enhanced result display with actionable insights
   */
  static displayEnhancedResults(result: UpdateResult, options: ResultDisplayOptions = {}): void {
    console.log('\n📊 Update Results Summary');
    console.log('========================\n');

    // Overall status
    const statusIcon = result.success ? '✅' : '❌';
    const statusText = result.success ? 'Success' : 'Completed with Issues';
    console.log(`${statusIcon} Status: ${statusText}`);

    // Statistics
    console.log(`📦 Updated: ${result.updated.length}`);
    console.log(`❌ Failed: ${result.failed.length}`);
    console.log(`🚫 Blocked: ${result.blocked.length}`);

    if (result.backupPath) {
      console.log(`💾 Backup: ${result.backupPath}`);
    }

    // Detailed results
    if (result.updated.length > 0) {
      this.displayUpdatedPackages(result.updated, options.showDetails || false);
    }

    if (result.failed.length > 0) {
      this.displayFailedPackages(result.failed, result.errors || []);
    }

    if (result.blocked.length > 0) {
      this.displayBlockedPackages(result.blocked);
    }

    // Actionable next steps
    this.displayNextSteps(result);
  }

  /**
   * Smart error display with solutions
   */
  static displayErrorWithSolutions(error: Error, context?: string): void {
    console.log('\n❌ Error occurred');
    console.log('================\n');

    // Error details
    console.log(`🔍 Error: ${error.message}`);
    if (context) {
      console.log(`📍 Context: ${context}`);
    }

    // Smart suggestions based on error type
    const suggestions = this.generateErrorSuggestions(error);
    if (suggestions.length > 0) {
      console.log('\n💡 Suggested solutions:');
      suggestions.forEach((suggestion, index) => {
        console.log(`${index + 1}. ${suggestion}`);
      });
    }

    // Recovery options
    console.log('\n🔄 Recovery options:');
    console.log('1. Retry the operation');
    console.log('2. Run with --dry-run to preview changes');
    console.log('3. Check backup and rollback if needed');
    console.log('4. Run with --verbose for more details');
  }

  /**
   * Confirmation prompts with smart defaults
   */
  static async confirmAction(
    message: string,
    options: ConfirmationOptions = {}
  ): Promise<boolean> {
    const { defaultValue = false, timeout, showDetails } = options;

    let prompt = `${message} (${defaultValue ? 'Y/n' : 'y/N'})`;

    if (showDetails) {
      prompt += '\n📋 Additional details will be shown after confirmation';
    }

    if (timeout) {
      prompt += ` (auto-${defaultValue ? 'accept' : 'decline'} in ${timeout}s)`;
    }

    console.log(`\n❓ ${prompt}`);

    // Add timeout handling if specified
    if (timeout) {
      return this.handleTimedConfirmation(defaultValue, timeout);
    }

    // Standard confirmation
    while (true) {
      const input = await this.getUserInput('> ');
      const normalized = input.toLowerCase().trim();

      if (normalized === '' || normalized === 'yes' || normalized === 'y') {
        return true;
      }
      if (normalized === 'no' || normalized === 'n') {
        return false;
      }

      console.log('Please enter "yes" or "no" (or "y"/"n")');
    }
  }

  /**
   * Display help context based on current operation
   */
  static displayContextualHelp(operation: string): void {
    const helpText = this.getHelpText(operation);

    console.log('\n📚 Contextual Help');
    console.log('==================\n');
    console.log(helpText);

    console.log('\n💡 Pro tips:');
    this.displayProTips(operation);
  }

  // Private helper methods

  private static startSpinner(description: string): void {
    let index = 0;
    this.currentSpinner = setInterval(() => {
      process.stdout.write(`\r${this.spinnerFrames[index]} ${description}`);
      index = (index + 1) % this.spinnerFrames.length;
    }, 100);
  }

  private static stopSpinner(): void {
    if (this.currentSpinner) {
      clearInterval(this.currentSpinner);
      this.currentSpinner = null;
      process.stdout.write('\r'); // Clear spinner line
    }
  }

  private static updateProgressDisplay(metrics: any): void {
    const {
      percentage,
      completed,
      total,
      estimatedTimeRemaining,
      itemsPerSecond,
      current,
      memoryMB,
      memoryTrend,
      description
    } = metrics;

    const memoryIcon = memoryTrend === 'increasing' ? '📈' :
      memoryTrend === 'decreasing' ? '📉' : '➡️';

    const line = [
      `${this.spinnerFrames[0]} ${description}`,
      `${percentage}% (${completed}/${total})`,
      `${Math.round(itemsPerSecond)}/s`,
      `${this.formatTime(estimatedTimeRemaining)} remaining`,
      `${memoryIcon} ${memoryMB}MB`,
      current ? `| ${current}` : ''
    ].filter(Boolean).join(' ');

    process.stdout.write(`\r${line.padEnd(process.stdout.columns || 80)}`);
  }

  private static displayCompletionSummary(metrics: any, peakMemory: any, message?: string): void {
    console.log('\n✅ Operation completed successfully!\n');

    if (message) {
      console.log(`📝 ${message}\n`);
    }

    console.log('📊 Performance Summary:');
    console.log(`   • Total processed: ${metrics.total}`);
    console.log(`   • Time taken: ${this.formatTime(metrics.totalTime || 0)}`);
    console.log(`   • Average speed: ${Math.round(metrics.itemsPerSecond || 0)} items/second`);
    console.log(`   • Peak memory: ${Math.round((peakMemory?.heapUsed || 0) / 1024 / 1024)}MB`);
  }

  private static groupPackagesByCategory(packages: PackageUpdate[]): Record<string, PackageUpdate[]> {
    return packages.reduce((groups, pkg) => {
      const category = pkg.category || 'unknown';
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(pkg);
      return groups;
    }, {} as Record<string, PackageUpdate[]>);
  }

  private static displaySelectionSummary(grouped: Record<string, PackageUpdate[]>): void {
    console.log('📋 Selection Summary:');

    Object.entries(grouped).forEach(([category, packages]) => {
      const icon = this.getCategoryIcon(category);
      console.log(`   ${icon} ${category}: ${packages.length} packages`);
    });

    const total = Object.values(grouped).reduce((sum, pkgs) => sum + pkgs.length, 0);
    console.log(`   📦 Total: ${total} packages\n`);
  }

  private static displaySelectionSuggestions(grouped: Record<string, PackageUpdate[]>): void {
    console.log('\n💡 Smart Suggestions:');

    if (grouped.safe && grouped.safe.length > 0) {
      console.log(`   ✅ Safe updates: Consider selecting all ${grouped.safe.length} safe updates`);
    }

    if (grouped.major && grouped.major.length > 0) {
      console.log(`   ⚠️  Major updates: Review ${grouped.major.length} major updates carefully`);
    }

    if (grouped.blocked && grouped.blocked.length > 0) {
      console.log(`   🚫 Blocked updates: ${grouped.blocked.length} packages need dependency resolution`);
    }
  }

  private static async selectPackagesInCategory(
    packages: PackageUpdate[],
    category: string,
    options: SelectionOptions
  ): Promise<{ selected: string[]; deselected: string[] }> {
    const selected: string[] = [];
    const deselected: string[] = [];

    // Display packages with numbers
    packages.forEach((pkg, index) => {
      const icon = this.getUpdateTypeIcon(pkg.updateType);
      const risk = pkg.updateType === 'major' ? '🔴' : pkg.updateType === 'minor' ? '🟡' : '🟢';
      console.log(`   ${index + 1}. ${icon} ${pkg.name}: ${pkg.currentVersion} → ${pkg.targetVersion} ${risk}`);
    });

    // Quick selection options
    console.log('\n   Quick select:');
    console.log(`   a - Select all ${category} packages`);
    console.log(`   n - Select none`);
    console.log(`   s - Select safe only`);
    console.log(`   1-${packages.length} - Select specific packages`);
    console.log(`   1-3,5,7 - Select multiple packages`);

    const input = await this.getUserInput('\n   Your choice (a/n/s/numbers): ');
    const choice = input.toLowerCase().trim();

    switch (choice) {
      case 'a':
        selected.push(...packages.map(p => p.name));
        break;
      case 'n':
        deselected.push(...packages.map(p => p.name));
        break;
      case 's':
        packages.forEach(pkg => {
          if (pkg.updateType === 'patch') {
            selected.push(pkg.name);
          } else {
            deselected.push(pkg.name);
          }
        });
        break;
      default:
        // Parse number selection
        const indices = this.parseNumberSelection(choice, packages.length);
        packages.forEach((pkg, index) => {
          if (indices.includes(index + 1)) {
            selected.push(pkg.name);
          } else {
            deselected.push(pkg.name);
          }
        });
    }

    return { selected, deselected };
  }

  private static parseNumberSelection(input: string, max: number): number[] {
    const indices: number[] = [];
    const parts = input.split(',');

    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.includes('-')) {
        // Range selection (e.g., "1-3")
        const parts = trimmed.split('-');
        if (parts.length === 2) {
          const startStr = parts[0];
          const endStr = parts[1];
          if (startStr && endStr) {
            const start = parseInt(startStr.trim());
            const end = parseInt(endStr.trim());
            if (!isNaN(start) && !isNaN(end) && start !== undefined && end !== undefined) {
              for (let i = start; i <= Math.min(end, max); i++) {
                indices.push(i);
              }
            }
          }
        }
      } else {
        // Single number
        const num = parseInt(trimmed);
        if (!isNaN(num) && num >= 1 && num <= max) {
          indices.push(num);
        }
      }
    }

    return [...new Set(indices)].sort((a, b) => a - b);
  }

  private static displayFinalSelection(
    selected: string[],
    deselected: string[],
    total: PackageUpdate[]
  ): void {
    console.log('\n📊 Final Selection Summary:');
    console.log(`   ✅ Selected: ${selected.length} packages`);
    console.log(`   ❌ Deselected: ${deselected.length} packages`);
    console.log(`   📦 Total: ${total.length} packages`);

    if (selected.length > 0) {
      console.log('\n   Selected packages:');
      selected.forEach(name => console.log(`     • ${name}`));
    }
  }

  private static displayUpdatedPackages(packages: PackageUpdate[], showDetails: boolean): void {
    console.log('\n✅ Successfully Updated:');
    packages.forEach(pkg => {
      const icon = this.getUpdateTypeIcon(pkg.updateType);
      console.log(`   ${icon} ${pkg.name}: ${pkg.currentVersion} → ${pkg.targetVersion}`);

      if (showDetails && pkg.changelog) {
        console.log(`      📝 ${pkg.changelog}`);
      }
    });
  }

  private static displayFailedPackages(packages: PackageUpdate[], errors: string[]): void {
    console.log('\n❌ Failed Updates:');
    packages.forEach(pkg => {
      console.log(`   ❌ ${pkg.name}: ${pkg.currentVersion} → ${pkg.targetVersion}`);
    });

    if (errors.length > 0) {
      console.log('\n🚨 Error Details:');
      errors.forEach(error => console.log(`   • ${error}`));
    }
  }

  private static displayBlockedPackages(packages: PackageUpdate[]): void {
    console.log('\n🚫 Blocked Updates:');
    packages.forEach(pkg => {
      console.log(`   🚫 ${pkg.name}: ${pkg.currentVersion} → ${pkg.targetVersion}`);
      if (pkg.blocker) {
        console.log(`      ⛔ Blocked by: ${pkg.blocker}`);
      }
    });
  }

  private static displayNextSteps(result: UpdateResult): void {
    console.log('\n🎯 Recommended Next Steps:');

    if (result.failed.length > 0) {
      console.log('   1. Review and fix failed updates');
      console.log('   2. Consider running with --verbose for detailed error information');
    }

    if (result.blocked.length > 0) {
      console.log('   3. Resolve dependency blockers for blocked packages');
      console.log('   4. Use "depsver update --interactive" for guided resolution');
    }

    if (result.success && result.updated.length > 0) {
      console.log('   5. Run your test suite to verify updates');
      console.log('   6. Monitor application performance');
    }

    if (result.backupPath) {
      console.log(`   7. Backup available at: ${result.backupPath}`);
    }
  }

  private static generateErrorSuggestions(error: Error): string[] {
    const suggestions: string[] = [];
    const message = error.message.toLowerCase();

    if (message.includes('network') || message.includes('timeout')) {
      suggestions.push('Check your internet connection');
      suggestions.push('Try again with --timeout 60000');
      suggestions.push('Use a different network or VPN');
    }

    if (message.includes('permission') || message.includes('access')) {
      suggestions.push('Run with elevated privileges (sudo/administrator)');
      suggestions.push('Check file permissions in project directory');
      suggestions.push('Ensure npm is properly configured');
    }

    if (message.includes('space') || message.includes('disk')) {
      suggestions.push('Free up disk space');
      suggestions.push('Clear npm cache: npm cache clean --force');
      suggestions.push('Remove node_modules and reinstall');
    }

    if (message.includes('conflict') || message.includes('blocker')) {
      suggestions.push('Use --interactive mode for guided resolution');
      suggestions.push('Update blocking packages first');
      suggestions.push('Consider alternative package versions');
    }

    // Default suggestions
    if (suggestions.length === 0) {
      suggestions.push('Run with --verbose for detailed error information');
      suggestions.push('Check the logs for specific error details');
      suggestions.push('Try running with --dry-run to preview changes');
    }

    return suggestions;
  }

  private static async handleTimedConfirmation(defaultValue: boolean, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        console.log(`\n⏰ Timeout - auto-${defaultValue ? 'accepting' : 'declining'}`);
        resolve(defaultValue);
      }, timeoutMs);

      this.getUserInput('> ').then(input => {
        clearTimeout(timer);
        const normalized = input.toLowerCase().trim();

        if (normalized === '' || normalized === 'yes' || normalized === 'y') {
          resolve(true);
        } else if (normalized === 'no' || normalized === 'n') {
          resolve(false);
        } else {
          resolve(defaultValue);
        }
      });
    });
  }

  private static async getUserInput(prompt: string): Promise<string> {
    process.stdout.write(prompt);
    return new Promise((resolve) => {
      const stdin = process.stdin;
      stdin.setRawMode(true);
      stdin.resume();
      stdin.setEncoding('utf8');

      let input = '';
      stdin.on('data', (key: string | Buffer) => {
        const keyStr = Buffer.isBuffer(key) ? key.toString('utf8') : key;

        if (keyStr === '\r' || keyStr === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          console.log();
          resolve(input);
        } else if (keyStr === '\u0003') {
          // Ctrl+C
          console.log('\nOperation cancelled.');
          process.exit(1);
        } else if (keyStr === '\u007f') {
          // Backspace
          if (input.length > 0) {
            input = input.slice(0, -1);
            process.stdout.write('\b \b');
          }
        } else {
          input += keyStr;
          process.stdout.write(keyStr);
        }
      });
    });
  }

  public static getHelpText(operation: string): string {
    const helpTexts: Record<string, string> = {
      update: `
The update command allows you to safely update project dependencies.

Key features:
• Interactive package selection with smart categorization
• Automatic backup creation before updates
• Pre/post-update test execution
• Dependency conflict detection and resolution

Common workflows:
• depsver update --interactive - Guided update process
• depsver update --safe-only - Only safe patch/minor updates
• depsver update --dry-run - Preview without applying changes
• depsver rollback <path> - Restore from backup
`,
      analyze: `
The analyze command provides comprehensive dependency analysis.

Key features:
• Identifies outdated packages and upgrade blockers
• Categorizes updates by risk level (safe/major/blocked)
• Generates AI-ready reports for code review
• Performance optimized for large projects

Output formats:
• Console - Interactive terminal display
• File - Markdown report for documentation
• Clipboard - Quick sharing with team
`,
      rollback: `
The rollback command restores project state from a backup.

Key features:
• Validates backup integrity before restoration
• Preserves current state in new backup
• Automatic dependency installation after rollback
• Safe rollback with verification steps

Usage:
• depsver rollback <backup-path> - Restore from specific backup
• depsver rollback --list - Show available backups
`
    };

    return helpTexts[operation] || 'Help not available for this operation.';
  }

  private static displayProTips(operation: string): void {
    const tips: Record<string, string[]> = {
      update: [
        'Always run with --dry-run first to preview changes',
        'Use --interactive mode for complex dependency scenarios',
        'Enable test execution with --tests (default) for safety',
        'Consider --safe-only for production environments',
        'Review blockers before attempting major updates'
      ],
      analyze: [
        'Use --output to save reports for team review',
        'Combine with --clip for quick sharing in chat tools',
        'Run regularly to stay informed about dependency health',
        'Use reports for dependency management planning',
        'Share AI-ready reports with code review tools'
      ],
      rollback: [
        'Verify backup integrity before rollback',
        'Test thoroughly after rollback operations',
        'Create new backup before rollback if needed',
        'Review what caused the need for rollback',
        'Consider dependency resolution after rollback'
      ]
    };

    const operationTips = tips[operation] || [];
    operationTips.forEach((tip, index) => {
      console.log(`${index + 1}. ${tip}`);
    });
  }

  // Utility methods
  private static formatTime(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    return `${Math.round(ms / 60000)}m`;
  }

  private static getCategoryIcon(category: string): string {
    const icons: Record<string, string> = {
      safe: '✅',
      major: '⚠️',
      blocked: '🚫',
      unknown: '❓'
    };
    return icons[category] || '📦';
  }

  private static getUpdateTypeIcon(type: string): string {
    const icons: Record<string, string> = {
      patch: '🔹',
      minor: '🔸',
      major: '🔶'
    };
    return icons[type] || '🔹';
  }
}

// Type definitions
export interface EnhancedProgressDisplay {
  start: () => void;
  update: (increment?: number, current?: string) => void;
  finish: (message?: string) => void;
  getMetrics: () => any;
}

export interface SelectionOptions {
  showSuggestions?: boolean;
  allowMultiSelect?: boolean;
  showRiskIndicators?: boolean;
}

export interface SelectionResult {
  selected: string[];
  deselected: string[];
  total: number;
  selectedCount: number;
  deselectedCount: number;
}

export interface ResultDisplayOptions {
  showDetails?: boolean;
  showPerformance?: boolean;
  showNextSteps?: boolean;
}

export interface ConfirmationOptions {
  defaultValue?: boolean;
  timeout?: number;
  showDetails?: boolean;
}
