import { promises as fs } from 'fs';
import * as semver from 'semver';
import { UpdateValidationError, PackageUpdate } from '../managers/types.js';
import { fetchLatestVersions } from './registry.js';

/**
 * Validation utilities for package updates
 */
export class UpdateValidator {
  /**
   * Validate a single package update
   */
  static async validateUpdate(packageName: string, version: string): Promise<UpdateValidationError[]> {
    const errors: UpdateValidationError[] = [];

    try {
      // Check if package name is valid
      if (!this.isValidPackageName(packageName)) {
        errors.push({
          package: packageName,
          version,
          reason: 'Invalid package name format',
          severity: 'error'
        });
        return errors;
      }

      // Check if version format is valid
      if (!semver.valid(version)) {
        errors.push({
          package: packageName,
          version,
          reason: 'Invalid semantic version format',
          severity: 'error'
        });
        return errors;
      }

      // Check if package exists in registry
      const latestVersions = await fetchLatestVersions([packageName]);
      const latestVersion = latestVersions.get(packageName);

      if (!latestVersion) {
        errors.push({
          package: packageName,
          version,
          reason: 'Package not found in npm registry',
          severity: 'error'
        });
        return errors;
      }

      // Check if requested version is not newer than latest
      if (semver.gt(version, latestVersion)) {
        errors.push({
          package: packageName,
          version,
          reason: `Version ${version} is newer than latest published version ${latestVersion}`,
          severity: 'error'
        });
      }

      // Check if version is available (not older than oldest published)
      // This is a simplified check - in practice, you'd want to check all available versions
      if (semver.lt(version, '0.0.1')) {
        errors.push({
          package: packageName,
          version,
          reason: 'Version is too old and likely not available',
          severity: 'warning'
        });
      }

    } catch (error) {
      errors.push({
        package: packageName,
        version,
        reason: `Validation failed: ${error}`,
        severity: 'error'
      });
    }

    return errors;
  }

  /**
   * Validate multiple package updates
   */
  static async validateUpdates(updates: PackageUpdate[], projectPath: string = process.cwd()): Promise<UpdateValidationError[]> {
    const allErrors: UpdateValidationError[] = [];

    // Validate each update individually
    for (const update of updates) {
      const errors = await this.validateUpdate(update.name, update.targetVersion);
      allErrors.push(...errors);
    }

    // Check for dependency conflicts
    const dependencyErrors = await this.validateDependencyConflicts(updates, projectPath);
    allErrors.push(...dependencyErrors);

    // Check for compatibility issues
    const compatibilityErrors = await this.validateCompatibility(updates);
    allErrors.push(...compatibilityErrors);

    return allErrors;
  }

  /**
   * Validate dependency conflicts between updates
   */
  private static async validateDependencyConflicts(updates: PackageUpdate[], projectPath: string = process.cwd()): Promise<UpdateValidationError[]> {
    const errors: UpdateValidationError[] = [];

    try {
      // Read package-lock.json to understand actual dependency graph
      const packageJsonPath = `${projectPath}/package.json`;
      const packageLockPath = `${projectPath}/package-lock.json`;

      const packageJsonExists = await this.fileExists(packageJsonPath);
      const packageLockExists = await this.fileExists(packageLockPath);

      if (!packageJsonExists || !packageLockExists) {
        errors.push({
          package: 'project',
          version: 'unknown',
          reason: 'package.json or package-lock.json not found for dependency validation',
          severity: 'warning'
        });
        return errors;
      }

      const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
      const packageLockContent = await fs.readFile(packageLockPath, 'utf-8');

      const packageJson = JSON.parse(packageJsonContent);
      const packageLock = JSON.parse(packageLockContent);

      // Build dependency graph from package-lock.json
      const dependencyGraph = this.buildDependencyGraph(packageLock);

      // Check if any update would break existing dependencies
      for (const update of updates) {
        const dependents = dependencyGraph.getDependents(update.name);

        for (const dependent of dependents) {
          const dependentInfo = packageLock.packages[`node_modules/${dependent}`] ||
            packageLock.packages[`node_modules/${dependent}/node_modules/${update.name}`];

          if (dependentInfo) {
            const requiredRange = dependentInfo.dependencies?.[update.name] ||
              dependentInfo.peerDependencies?.[update.name];

            if (requiredRange && !semver.satisfies(update.targetVersion, requiredRange)) {
              errors.push({
                package: update.name,
                version: update.targetVersion,
                reason: `Update would break dependency requirement: ${dependent} requires ${requiredRange}`,
                severity: 'error'
              });
            }
          }
        }
      }

    } catch (error) {
      // If we can't validate dependencies, add a warning
      errors.push({
        package: 'multiple',
        version: 'unknown',
        reason: `Could not validate dependency conflicts: ${error}`,
        severity: 'warning'
      });
    }

    return errors;
  }

  /**
   * Build dependency graph from package-lock.json
   */
  private static buildDependencyGraph(packageLock: any): { getDependents: (packageName: string) => string[] } {
    const dependentsMap = new Map<string, Set<string>>();

    // Build reverse dependency index
    for (const [packagePath, packageInfo] of Object.entries(packageLock.packages || {})) {
      if (packagePath === "") continue; // Skip root package

      const packageName = packagePath.includes('node_modules/') ?
        packagePath.split('node_modules/').pop() || packagePath : packagePath;

      // Find all dependencies of this package
      const allDeps = {
        ...(packageInfo as any).dependencies || {},
        ...(packageInfo as any).peerDependencies || {}
      };

      // For each dependency, add this package as a dependent
      for (const depName of Object.keys(allDeps)) {
        if (!dependentsMap.has(depName)) {
          dependentsMap.set(depName, new Set());
        }
        dependentsMap.get(depName)!.add(packageName);
      }
    }

    return {
      getDependents: (packageName: string) => {
        return Array.from(dependentsMap.get(packageName) || []);
      }
    };
  }

  /**
   * Validate compatibility between selected updates
   */
  private static async validateCompatibility(updates: PackageUpdate[]): Promise<UpdateValidationError[]> {
    const errors: UpdateValidationError[] = [];

    // Check for major version jumps that might be incompatible
    const majorUpdates = updates.filter(u => u.updateType === 'major');

    for (const update of majorUpdates) {
      // Add warning for major updates
      errors.push({
        package: update.name,
        version: update.targetVersion,
        reason: 'Major version update may contain breaking changes - review changelog',
        severity: 'warning'
      });
    }

    // Check for known incompatible package combinations
    const incompatibleCombos = this.getIncompatibleCombinations();
    for (const combo of incompatibleCombos) {
      const selectedUpdates = updates.filter(u => combo.packages.includes(u.name));

      if (selectedUpdates.length === combo.packages.length) {
        errors.push({
          package: combo.packages.join(', '),
          version: 'multiple',
          reason: combo.reason,
          severity: 'error'
        });
      }
    }

    return errors;
  }

  /**
   * Pre-update validation (check current state)
   */
  static async validatePreUpdateState(projectPath: string = process.cwd()): Promise<UpdateValidationError[]> {
    const errors: UpdateValidationError[] = [];

    try {
      // Check if package.json exists and is valid
      const packageJsonPath = `${projectPath}/package.json`;
      if (!(await this.fileExists(packageJsonPath))) {
        errors.push({
          package: 'package.json',
          version: 'unknown',
          reason: 'package.json not found',
          severity: 'error'
        });
        return errors;
      }

      // Validate package.json syntax
      try {
        const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
        JSON.parse(packageJsonContent);
      } catch (error) {
        errors.push({
          package: 'package.json',
          version: 'unknown',
          reason: `Invalid JSON in package.json: ${error}`,
          severity: 'error'
        });
        return errors;
      }

      // Check if package-lock.json exists
      const packageLockPath = `${projectPath}/package-lock.json`;
      if (!(await this.fileExists(packageLockPath))) {
        errors.push({
          package: 'package-lock.json',
          version: 'unknown',
          reason: 'package-lock.json not found - run "npm install" to generate it',
          severity: 'warning'
        });
      }

      // Check for uncommitted changes in git (if in a git repo)
      const gitPath = `${projectPath}/.git`;
      if (await this.fileExists(gitPath)) {
        try {
          const { exec } = await import('child_process');
          const { promisify } = await import('util');
          const execAsync = promisify(exec);

          const { stdout } = await execAsync('git status --porcelain package.json package-lock.json', { cwd: projectPath });
          if (stdout.trim()) {
            errors.push({
              package: 'git',
              version: 'unknown',
              reason: 'Uncommitted changes in package.json or package-lock.json - commit changes first',
              severity: 'warning'
            });
          }
        } catch (error) {
          // Git command failed, skip this check
        }
      }

    } catch (error) {
      errors.push({
        package: 'system',
        version: 'unknown',
        reason: `Pre-update validation failed: ${error}`,
        severity: 'error'
      });
    }

    return errors;
  }

  /**
   * Post-update validation
   */
  static async validatePostUpdateState(projectPath: string = process.cwd()): Promise<UpdateValidationError[]> {
    const errors: UpdateValidationError[] = [];

    try {
      // Check if package.json is still valid
      const packageJsonPath = `${projectPath}/package.json`;
      try {
        const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
        JSON.parse(packageJsonContent);
      } catch (error) {
        errors.push({
          package: 'package.json',
          version: 'unknown',
          reason: `package.json became invalid after update: ${error}`,
          severity: 'error'
        });
      }

      // Check if package-lock.json is still valid
      const packageLockPath = `${projectPath}/package-lock.json`;
      if (await this.fileExists(packageLockPath)) {
        try {
          const packageLockContent = await fs.readFile(packageLockPath, 'utf-8');
          JSON.parse(packageLockContent);
        } catch (error) {
          errors.push({
            package: 'package-lock.json',
            version: 'unknown',
            reason: `package-lock.json became invalid after update: ${error}`,
            severity: 'error'
          });
        }
      }

      // Check if node_modules can be installed (basic check)
      // This is a simplified check - in practice, you might want to run 'npm install' --dry-run
      try {
        const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
        const packageJson = JSON.parse(packageJsonContent);

        // Basic consistency check
        if (packageJson.dependencies && typeof packageJson.dependencies !== 'object') {
          errors.push({
            package: 'package.json',
            version: 'unknown',
            reason: 'Dependencies section became invalid after update',
            severity: 'error'
          });
        }
      } catch (error) {
        // Already caught above
      }

    } catch (error) {
      errors.push({
        package: 'system',
        version: 'unknown',
        reason: `Post-update validation failed: ${error}`,
        severity: 'error'
      });
    }

    return errors;
  }

  /**
   * Check if package name is valid
   */
  private static isValidPackageName(packageName: string): boolean {
    if (!packageName || packageName.trim() === '') {
      return false;
    }

    // Basic npm package name validation
    const npmPackageNameRegex = /^(@[a-z0-9-_.]+\/[a-z0-9-_.]+|[a-z0-9-_.]+)$/;
    return npmPackageNameRegex.test(packageName);
  }

  /**
   * Find packages that depend on a given package
   */
  private static findDependents(packageName: string, dependencies: Record<string, string>): string[] {
    const dependents: string[] = [];

    for (const [dep, range] of Object.entries(dependencies)) {
      // This is a simplified check - in practice, you'd need to analyze the actual dependency graph
      // For now, we'll just check if the dependency name appears in the range (not accurate)
      if (range.includes(packageName)) {
        dependents.push(dep);
      }
    }

    return dependents;
  }

  /**
   * Get known incompatible package combinations
   */
  private static getIncompatibleCombinations(): Array<{ packages: string[], reason: string }> {
    return [
      {
        packages: ['react', 'react-dom'],
        reason: 'React and React DOM must have compatible major versions'
      },
      {
        packages: ['webpack', 'webpack-cli'],
        reason: 'Webpack and Webpack CLI must have compatible versions'
      },
      {
        packages: ['babel-core', '@babel/core'],
        reason: 'Cannot use both babel-core and @babel/core simultaneously'
      }
    ];
  }

  /**
   * Check if a file exists
   */
  private static async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Test integration utilities
 */
export class TestRunner {
  /**
   * Run tests before updates
   */
  static async runPreUpdateTests(projectPath: string = process.cwd()): Promise<{ success: boolean, output: string }> {
    const originalCwd = process.cwd();

    try {
      // Check if npm test script exists in target project
      const packageJsonPath = `${projectPath}/package.json`;
      const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(packageJsonContent);

      if (!packageJson.scripts || !packageJson.scripts.test) {
        return {
          success: true,
          output: 'No test script found - skipping pre-update tests'
        };
      }

      // Change to target project directory
      process.chdir(projectPath);

      // Run tests using dynamic import for ES modules
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      const { stdout, stderr } = await execAsync('npm test', { timeout: 60000 });

      // Check if tests actually passed by looking for test failure indicators
      const output = stdout + (stderr ? '\n' + stderr : '');
      const hasFailures = output.includes('FAIL') ||
        output.includes('Failed Tests') ||
        output.includes('❌') ||
        output.includes('AssertionError') ||
        output.includes('Test failed') ||
        output.includes('× failed');

      if (hasFailures) {
        return {
          success: false,
          output: `Tests failed:\n${output}`
        };
      }

      return {
        success: true,
        output: output
      };

    } catch (error) {
      return {
        success: false,
        output: `Tests failed: ${error}`
      };
    } finally {
      // Always restore original working directory
      process.chdir(originalCwd);
    }
  }

  /**
   * Run tests after updates
   */
  static async runPostUpdateTests(projectPath: string = process.cwd()): Promise<{ success: boolean, output: string }> {
    const originalCwd = process.cwd();

    try {
      // Change to target project directory
      process.chdir(projectPath);

      // First, ensure dependencies are installed
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      await execAsync('npm install', { timeout: 120000 });

      // Then run tests
      return await this.runPreUpdateTests(projectPath);

    } catch (error) {
      return {
        success: false,
        output: `Post-update setup failed: ${error}`
      };
    } finally {
      // Always restore original working directory
      process.chdir(originalCwd);
    }
  }
}
