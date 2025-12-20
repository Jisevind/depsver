import * as readline from 'readline';
import { UpdatePlan, PackageUpdate } from '../managers/types.js';

/**
 * Interactive menu system for package selection
 */
export class InteractiveMenu {
  private rl: readline.Interface;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  /**
   * Display interactive package selection menu
   */
  async selectPackages(plan: UpdatePlan): Promise<string[]> {
    console.log('\n🎯 Interactive Package Selection');
    console.log('===============================\n');

    const selectedPackages = new Set<string>();

    // Display packages by category
    await this.displayCategory('✅ Safe Updates', plan.categories.safe, selectedPackages, plan);
    await this.displayCategory('⚠️  Major Updates', plan.categories.major, selectedPackages, plan);
    await this.displayCategory('🚫 Blocked Updates', plan.categories.blocked, selectedPackages, plan);

    // Quick actions
    console.log('\n🚀 Quick Actions:');
    console.log('  [A] Select all safe updates');
    console.log('  [S] Select all packages');
    console.log('  [N] Select none');
    console.log('  [D] View package details');
    console.log('  [C] Continue with selection');
    console.log('  [Q] Quit\n');

    // Main interaction loop
    while (true) {
      const answer = await this.question('Enter your choice (package number or action): ');
      
      switch (answer.toUpperCase()) {
        case 'A':
          this.selectAllInCategory(plan.categories.safe, selectedPackages);
          await this.refreshSelection(plan, selectedPackages);
          break;
        case 'S':
          this.selectAll(plan.packages, selectedPackages);
          await this.refreshSelection(plan, selectedPackages);
          break;
        case 'N':
          selectedPackages.clear();
          await this.refreshSelection(plan, selectedPackages);
          break;
        case 'D':
          await this.viewPackageDetails(plan);
          break;
        case 'C':
          if (selectedPackages.size === 0) {
            console.log('⚠️  No packages selected. Please select at least one package or press [Q] to quit.');
            continue;
          }
          this.rl.close();
          return Array.from(selectedPackages);
        case 'Q':
          this.rl.close();
          return [];
        default:
          // Try to parse as package number
          const packageIndex = parseInt(answer) - 1;
          if (packageIndex >= 0 && packageIndex < plan.packages.length) {
            const pkg = plan.packages[packageIndex];
            if (pkg) {
              if (selectedPackages.has(pkg.name)) {
                selectedPackages.delete(pkg.name);
                console.log(`❌ Deselected: ${pkg.name}`);
              } else {
                selectedPackages.add(pkg.name);
                console.log(`✅ Selected: ${pkg.name}`);
              }
              await this.refreshSelection(plan, selectedPackages);
            }
          } else {
            console.log('❌ Invalid choice. Please try again.');
          }
          break;
      }
    }
  }

  /**
   * Display packages in a category with selection status
   */
  private async displayCategory(title: string, packages: PackageUpdate[], selected: Set<string>, plan: UpdatePlan): Promise<void> {
    if (packages.length === 0) return;

    console.log(`${title} (${packages.length}):`);
    packages.forEach((pkg) => {
      const status = selected.has(pkg.name) ? '✅' : '⭕';
      const blocker = pkg.blocker ? ` (blocked by ${pkg.blocker})` : '';
      // Use consistent global numbering for package selection
      const packageNumber = plan.packages.findIndex(p => p.name === pkg.name) + 1;
      console.log(`  ${status} [${packageNumber}] ${pkg.name}: ${pkg.currentVersion} → ${pkg.targetVersion} (${pkg.updateType})${blocker}`);
    });
    console.log('');
  }

  /**
   * Refresh the selection display
   */
  private async refreshSelection(plan: UpdatePlan, selected: Set<string>): Promise<void> {
    console.clear();
    console.log('🎯 Interactive Package Selection');
    console.log('===============================\n');
    console.log(`📦 Selected: ${selected.size} packages\n`);

    await this.displayCategory('✅ Safe Updates', plan.categories.safe, selected, plan);
    await this.displayCategory('⚠️  Major Updates', plan.categories.major, selected, plan);
    await this.displayCategory('🚫 Blocked Updates', plan.categories.blocked, selected, plan);

    console.log('🚀 Quick Actions:');
    console.log('  [A] Select all safe updates');
    console.log('  [S] Select all packages');
    console.log('  [N] Select none');
    console.log('  [D] View package details');
    console.log('  [C] Continue with selection');
    console.log('  [Q] Quit\n');
  }

  /**
   * Select all packages in a specific category
   */
  private selectAllInCategory(packages: PackageUpdate[], selected: Set<string>): void {
    packages.forEach(pkg => selected.add(pkg.name));
  }

  /**
   * Select all packages
   */
  private selectAll(packages: PackageUpdate[], selected: Set<string>): void {
    packages.forEach(pkg => selected.add(pkg.name));
  }

  /**
   * View detailed information about a specific package
   */
  private async viewPackageDetails(plan: UpdatePlan): Promise<void> {
    while (true) { // Loop to allow browsing multiple packages
      console.log('\n📦 Available Packages:');
      console.log('======================\n');
      
      // Display all packages with their numbers for easy reference
      plan.packages.forEach((pkg, index) => {
        const status = pkg.category === 'safe' ? '✅' : 
                      pkg.category === 'major' ? '⚠️' : '🚫';
        const blocker = pkg.blocker ? ` (blocked by ${pkg.blocker})` : '';
        console.log(`  [${index + 1}] ${status} ${pkg.name}: ${pkg.currentVersion} → ${pkg.targetVersion} (${pkg.updateType})${blocker}`);
      });
      
      console.log('\nOptions:');
      console.log('  • Enter package number (1, 2, 3, etc.)');
      console.log('  • Enter package name');
      console.log('  • Press Enter to go back to main menu\n');
      
      const input = await this.question('Enter package number or name: ');
      
      if (!input.trim()) {
        return; // Go back to main menu
      }
      
      let pkg: PackageUpdate | undefined;
      
      // Try to parse as number first
      const packageIndex = parseInt(input) - 1;
      if (packageIndex >= 0 && packageIndex < plan.packages.length) {
        pkg = plan.packages[packageIndex];
      } else {
        // Try to find by name
        pkg = plan.packages.find(p => p.name.toLowerCase() === input.toLowerCase());
      }
      
      if (!pkg) {
        console.log(`❌ Package "${input}" not found.`);
        await this.question('Press Enter to continue...');
        continue; // Continue the loop to show package list again
      }

      await this.displayPackageDetails(pkg, plan);
      // After displayPackageDetails returns, we'll continue this loop to show the package list again
    }
  }

  /**
   * Display detailed information about a package with action options
   */
  private async displayPackageDetails(pkg: PackageUpdate, plan: UpdatePlan): Promise<void> {
    while (true) { // Loop to handle navigation properly
      console.clear();
      console.log(`📦 Package Details: ${pkg.name}`);
      console.log('=====================================\n');
      console.log(`Current Version: ${pkg.currentVersion}`);
      console.log(`Target Version:  ${pkg.targetVersion}`);
      console.log(`Update Type:     ${pkg.updateType}`);
      console.log(`Category:         ${pkg.category}`);
      
      if (pkg.blocker) {
        console.log(`Blocked By:       ${pkg.blocker}`);
      }
      
      if (pkg.changelog) {
        console.log(`\n📝 Changelog:\n${pkg.changelog}`);
      }
      
      if (pkg.securityNotes && pkg.securityNotes.length > 0) {
        console.log(`\n🔒 Security Notes:`);
        pkg.securityNotes.forEach(note => console.log(`  • ${note}`));
      }

      console.log('\n⚠️  Risks:');
      if (pkg.updateType === 'major') {
        console.log('  • Major version update may contain breaking changes');
        console.log('  • Review changelog and test thoroughly');
      }
      if (pkg.category === 'blocked') {
        console.log('  • This update is blocked by dependency constraints');
        console.log('  • Update blocking packages first');
      }

      // Find package number for reference
      const packageNumber = plan.packages.findIndex(p => p.name === pkg.name) + 1;

      console.log('\n🎯 Actions:');
      console.log(`  [${packageNumber}] Toggle selection for this package`);
      console.log('  [B] Browse other packages');
      console.log('  [M] Return to main menu\n');

      const action = await this.question('Enter action: ');
      
      switch (action.toUpperCase()) {
        case packageNumber.toString():
          // Store the package number for the main loop to handle
          console.log(`\n📝 Package ${pkg.name} (${packageNumber}) will be toggled when you return to the main menu.`);
          console.log('💡 Tip: You can also enter the number directly in the main menu to toggle selection.');
          await this.question('Press Enter to return to main menu...');
          return; // Exit this function and return to main menu
        case 'B':
          // Browse other packages - exit this loop and go back to package selection
          return;
        case 'M':
          return; // Return to main menu
        default:
          console.log('Invalid action. Please try again.');
          await this.question('Press Enter to continue...');
          continue; // Continue the loop to show the same package details again
      }
    }
  }

  /**
   * Helper method to ask a question and get user input
   */
  private question(query: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(query, (answer) => {
        resolve(answer.trim());
      });
    });
  }

  /**
   * Clean up readline interface
   */
  close(): void {
    this.rl.close();
  }
}

/**
 * Smart filtering utilities for package selection
 */
export class PackageFilter {
  /**
   * Filter packages by category
   */
  static byCategory(packages: PackageUpdate[], category: 'safe' | 'major' | 'blocked'): PackageUpdate[] {
    return packages.filter(pkg => pkg.category === category);
  }

  /**
   * Filter packages by update type
   */
  static byUpdateType(packages: PackageUpdate[], updateType: 'patch' | 'minor' | 'major'): PackageUpdate[] {
    return packages.filter(pkg => pkg.updateType === updateType);
  }

  /**
   * Filter packages that are not blocked
   */
  static unblocked(packages: PackageUpdate[]): PackageUpdate[] {
    return packages.filter(pkg => pkg.category !== 'blocked');
  }

  /**
   * Filter packages that have security implications
   */
  static securityRelated(packages: PackageUpdate[]): PackageUpdate[] {
    return packages.filter(pkg => 
      pkg.securityNotes && pkg.securityNotes.length > 0
    );
  }

  /**
   * Sort packages by priority (safe > major > blocked)
   */
  static byPriority(packages: PackageUpdate[]): PackageUpdate[] {
    const priorityOrder = { 'safe': 0, 'major': 1, 'blocked': 2 };
    return packages.sort((a, b) => {
      const priorityDiff = priorityOrder[a.category] - priorityOrder[b.category];
      if (priorityDiff !== 0) return priorityDiff;
      
      // Within same category, sort by update type (patch < minor < major)
      const updateTypeOrder = { 'patch': 0, 'minor': 1, 'major': 2 };
      return updateTypeOrder[a.updateType] - updateTypeOrder[b.updateType];
    });
  }

  /**
   * Get recommended packages for update (safe updates only)
   */
  static getRecommended(packages: PackageUpdate[]): PackageUpdate[] {
    return this.byCategory(packages, 'safe');
  }

  /**
   * Get packages requiring careful review (major and blocked)
   */
  static getRequireReview(packages: PackageUpdate[]): PackageUpdate[] {
    return [
      ...this.byCategory(packages, 'major'),
      ...this.byCategory(packages, 'blocked')
    ];
  }
}
