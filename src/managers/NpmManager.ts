import { promises as fs } from 'fs';
import * as semver from 'semver';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as crypto from 'crypto';
import { DependencyManager, AnalysisReport, DependencyInfo, ProgressCallbacks, PackageLock, PackageLockPackage, UpdateOptions, UpdateResult, UpdatePlan, PackageUpdate } from './types.js';
import { fetchLatestVersions } from '../utils/registry.js';
import { BackupManager } from '../utils/backup.js';
import { UpdateValidator, TestRunner } from '../utils/validation.js';
import {
  MalformedPackageJsonError,
  MalformedPackageLockError,
  FileSystemError,
  NetworkError,
  UpdateFailedError,
  RestoreFailedError,
  ValidationError,
  wrapError
} from '../utils/errors.js';

const execAsync = promisify(exec);

/**
 * Extracts the package name from a package-lock.json path.
 * e.g., "node_modules/react" -> "react"
 * e.g., "node_modules/clipboardy/node_modules/execa" -> "execa"
 * e.g., "node_modules/@types/node" -> "@types/node"
 */
export function extractPackageName(packagePath: string): string {
  // Handle empty or invalid paths
  if (!packagePath || packagePath.trim() === '') {
    return '';
  }

  // Handle paths that end with just "node_modules" or "node_modules/"
  if (packagePath === 'node_modules' || packagePath === 'node_modules/') {
    return '';
  }

  // Split by 'node_modules/' and get the last part
  const parts = packagePath.split('node_modules/');
  if (parts.length < 2) {
    return '';
  }

  const lastPart = parts[parts.length - 1];

  // If the last part contains multiple path segments, extract only the final segment
  if (!lastPart) return '';
  const segments = lastPart.split('/');

  // For scoped packages like @types/node, we need to preserve the @scope/package format
  // But only if it's first segment after node_modules
  if (segments[0] && segments[0].startsWith('@')) {
    // If this is a scoped package at first level with exactly 2 segments, return the full scoped name
    if (segments.length === 1) {
      return segments[0];
    }
    // For @types/node, segments would be ['@types', 'node'], so we need to recombine
    if (segments.length >= 2 && segments[0] && segments[0].startsWith('@')) {
      // Check if this looks like a scoped package (second segment doesn't contain a slash)
      if (segments.length === 2 && segments[1] && !segments[1].includes('/')) {
        return `${segments[0]}/${segments[1]}`;
      }
      // If there are more segments, this is likely a nested structure, return the last segment
      return segments[segments.length - 1] || '';
    }
    // Default to last segment for nested structures
    return segments[segments.length - 1] || '';
  }

  return segments[segments.length - 1] || '';
}

/**
 * Validates if a package name is valid for npm registry requests
 * @param packageName - The package name to validate
 * @returns boolean - True if the package name is valid
 */
export function isValidPackageName(packageName: string): boolean {
  // Package name should not be empty or just whitespace
  if (!packageName || packageName.trim() === '') {
    return false;
  }

  // Trim whitespace
  const trimmedName = packageName.trim();

  // Basic npm package name validation
  // Package names can contain lowercase letters, numbers, hyphens, and dots
  // Underscores and capital letters are NOT allowed
  // Scoped packages start with @ and contain a slash
  const npmPackageNameRegex = /^(@[a-z0-9-.]+\/[a-z0-9-.]+|[a-z0-9-.]+)$/;

  return npmPackageNameRegex.test(trimmedName);
}

/**
 * NpmManager implements the DependencyManager interface for npm-based projects.
 * It detects and analyzes npm dependencies by examining package.json and package-lock.json files.
 */
export class NpmManager implements DependencyManager {
  private fsModule: typeof fs;

  constructor(fsModule: typeof fs = fs) {
    this.fsModule = fsModule;
  }
  /**
   * Detects if this manager can handle the given directory by checking for npm-specific files.
   * @param directory - The directory to check for npm project files
   * @returns Promise<boolean> - True if both package.json and package-lock.json exist
   */
  async detect(directory: string): Promise<boolean> {
    try {
      const packageJsonPath = `${directory}/package.json`;
      const packageLockPath = `${directory}/package-lock.json`;

      // Check if both files exist
      await this.fsModule.access(packageJsonPath);
      await this.fsModule.access(packageLockPath);

      return true;
    } catch (error) {
      // If either file doesn't exist or can't be accessed, return false
      return false;
    }
  }

  /**
   * Analyzes npm dependencies in the given directory and returns a comprehensive report.
   * @param directory - The directory containing the npm project
   * @returns Promise<AnalysisReport> - Complete analysis report with dependency information
   */
  async analyze(directory: string, onProgress?: ProgressCallbacks): Promise<AnalysisReport> {
    // Step 1: Find and read files
    const packageJsonPath = `${directory}/package.json`;
    const packageLockPath = `${directory}/package-lock.json`;

    let packageJsonContent: string;
    let packageLockContent: string;

    try {
      packageJsonContent = await this.fsModule.readFile(packageJsonPath, 'utf-8');
    } catch (error) {
      throw wrapError(error, `Failed to read project files`) as FileSystemError;
    }

    let packageJson: any;

    try {
      packageJson = JSON.parse(packageJsonContent);
    } catch (error) {
      throw new MalformedPackageJsonError(error instanceof Error ? error.message : String(error));
    }

    // Try to read package-lock.json only after successfully parsing package.json
    try {
      packageLockContent = await this.fsModule.readFile(packageLockPath, 'utf-8');
    } catch (error) {
      throw wrapError(error, `Failed to read project files`) as FileSystemError;
    }

    let packageLock: PackageLock;
    try {
      packageLock = JSON.parse(packageLockContent) as PackageLock;
    } catch (error) {
      throw new MalformedPackageLockError(error instanceof Error ? error.message : String(error));
    }

    // Step 2: Extract requested dependencies
    const requestedDependencies = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies
    };

    // Step 3: Stage 1 - Fetch top-level dependencies only
    const topLevelPackageNames = Object.keys(requestedDependencies)
      .filter(packageName => isValidPackageName(packageName)); // Filter out invalid package names

    // Initialize progress tracking for Stage 1
    onProgress?.start(topLevelPackageNames.length, 'Fetching latest versions for top-level dependencies');

    // Step 4: Stage 1 - Fetch latest versions for top-level dependencies only
    let topLevelLatestVersions: Map<string, string>;
    try {
      topLevelLatestVersions = await fetchLatestVersions(topLevelPackageNames, onProgress?.increment);
    } catch (error) {
      throw wrapError(error, 'Failed to fetch latest package versions') as NetworkError;
    }

    // Stop progress tracking for Stage 1
    onProgress?.stop();

    // Step 5: Create initial dependency info for top-level dependencies only
    const initialPackagesMap = new Map<string, DependencyInfo>();

    for (const [packagePath, packageInfo] of Object.entries(packageLock.packages)) {
      if (packagePath === "") continue; // Skip root package

      // Extract package name from path
      const packageName = extractPackageName(packagePath);

      // Skip invalid package names and non-top-level dependencies for now
      if (!isValidPackageName(packageName) || !requestedDependencies[packageName]) {
        continue;
      }

      // Type assertion for packageInfo with proper interface
      const pkgInfo = packageInfo as PackageLockPackage;

      // Create dependency info for top-level packages only
      const dependencyInfo: DependencyInfo = {
        name: packageName,
        requested: requestedDependencies[packageName] || undefined,
        resolved: pkgInfo.version,
        latest: topLevelLatestVersions.get(packageName) || "unknown",
        dependencies: pkgInfo.dependencies || {},
        peerDependencies: pkgInfo.peerDependencies || {}
      };

      initialPackagesMap.set(packageName, dependencyInfo);
    }

    // Step 6: Initial analysis to identify packages that need blocker checking
    const potentiallyBlockedPackages: string[] = [];

    for (const depName of Object.keys(requestedDependencies)) {
      const dep = initialPackagesMap.get(depName);
      if (!dep || dep.latest === 'unknown') continue;

      // Check if this package might need an upgrade
      if (dep.requested && !semver.satisfies(dep.latest, dep.requested)) {
        potentiallyBlockedPackages.push(depName);
      }
    }

    // Step 7: Stage 2 - Selective fetching of transitive dependencies
    let selectiveLatestVersions = new Map(topLevelLatestVersions);

    if (potentiallyBlockedPackages.length > 0) {
      // Find all transitive packages that could block the identified packages
      const transitivePackagesToFetch = new Set<string>();

      for (const [packagePath, packageInfo] of Object.entries(packageLock.packages)) {
        if (packagePath === "") continue; // Skip root package

        const packageName = extractPackageName(packagePath);
        if (!isValidPackageName(packageName) || requestedDependencies[packageName]) continue;

        // Check if this transitive package depends on any potentially blocked packages
        const pkgInfo = packageInfo as PackageLockPackage;
        const allDeps = { ...pkgInfo.dependencies, ...pkgInfo.peerDependencies };

        for (const blockedPackage of potentiallyBlockedPackages) {
          if (allDeps[blockedPackage]) {
            transitivePackagesToFetch.add(packageName);
            break;
          }
        }
      }

      // Fetch latest versions for selective transitive packages only
      if (transitivePackagesToFetch.size > 0) {
        onProgress?.start(transitivePackagesToFetch.size, 'Fetching latest versions for blocker analysis');

        const transitiveLatestVersions = await fetchLatestVersions(
          Array.from(transitivePackagesToFetch),
          onProgress?.increment
        );

        // Merge with top-level versions
        selectiveLatestVersions = new Map([...topLevelLatestVersions, ...transitiveLatestVersions]);
        onProgress?.stop();
      }
    }

    // Step 8: Create a Map of ALL packages for blocker detection
    const allPackagesMap = new Map<string, DependencyInfo>();

    for (const [packagePath, packageInfo] of Object.entries(packageLock.packages)) {
      if (packagePath === "") continue; // Skip root package

      // Extract package name from path
      const packageName = extractPackageName(packagePath);

      // Skip invalid package names
      if (!isValidPackageName(packageName)) {
        continue;
      }

      // Type assertion for packageInfo with proper interface
      const pkgInfo = packageInfo as PackageLockPackage;

      // Create dependency info for ALL packages (needed for blocker detection)
      const dependencyInfo: DependencyInfo = {
        name: packageName,
        requested: requestedDependencies[packageName] || undefined,
        resolved: pkgInfo.version,
        latest: selectiveLatestVersions.get(packageName) || "unknown",
        dependencies: pkgInfo.dependencies || {},
        peerDependencies: pkgInfo.peerDependencies || {}
      };

      allPackagesMap.set(packageName, dependencyInfo);
    }

    // Step 9: Populate allDependencies - only for top-level dependencies
    const allDependencies: DependencyInfo[] = [];

    for (const depName of Object.keys(requestedDependencies)) {
      const dep = allPackagesMap.get(depName);
      if (dep) {
        allDependencies.push(dep);
      }
    }

    // Step 10: Build dependency index for efficient blocker detection - O(n + m)
    const dependencyIndex = new Map<string, Set<string>>();
    const reverseDependencyIndex = new Map<string, Set<string>>();

    for (const [packageName, packageInfo] of allPackagesMap) {
      const dependencies = new Set([
        ...Object.keys(packageInfo.dependencies || {}),
        ...Object.keys(packageInfo.peerDependencies || {})
      ]);

      dependencyIndex.set(packageName, dependencies);

      // Build reverse index: who depends on this package
      for (const dep of dependencies) {
        if (!reverseDependencyIndex.has(dep)) {
          reverseDependencyIndex.set(dep, new Set());
        }
        reverseDependencyIndex.get(dep)!.add(packageName);
      }
    }

    // Step 11: Core Analysis Logic - Categorize dependencies
    const safe: DependencyInfo[] = [];
    const blocked: (DependencyInfo & { blocker: string })[] = [];
    const majorJump: DependencyInfo[] = [];

    // Analyze only the top-level dependencies from package.json
    for (const depName of Object.keys(requestedDependencies)) {
      const dep = allPackagesMap.get(depName);

      // Skip if this dependency isn't in the lockfile for some reason
      if (!dep) {
        continue;
      }

      // Step 11a: Blocker Check using reverse index - O(k) where k = packages depending on dep
      let foundBlockerName: string | null = null;
      const requiredBy = reverseDependencyIndex.get(dep.name) || new Set();

      for (const blockerName of requiredBy) {
        const blocker = allPackagesMap.get(blockerName);
        if (!blocker) continue;

        const requiredRange = blocker.dependencies[dep.name] ||
          blocker.peerDependencies[dep.name];

        if (requiredRange && dep.latest !== "unknown" && !semver.satisfies(dep.latest, requiredRange)) {
          foundBlockerName = blockerName;
          break;
        }
      }

      // Step 11b: Classification Logic - Compare Current vs Wanted (like npm outdated)

      if (foundBlockerName) {
        // Package is blocked by another package
        blocked.push({
          ...dep,
          blocker: foundBlockerName
        });
      } else if (dep.latest === 'unknown') {
        // Can't verify latest version - skip
        continue;
      } else if (!dep.requested) {
        // No requested version found (shouldn't happen for top-level deps) - skip
        continue;
      } else {
        // Calculate what version would be installed (Wanted = latest that satisfies range)
        // Calculate what version would be installed (Wanted = latest that satisfies range)
        // Check if there is a newer version available
        if (semver.gt(dep.latest, dep.resolved)) {
          if (semver.satisfies(dep.latest, dep.requested)) {
            // The latest version satisfies the range
            // Check if it's a major version jump (rare within range, but possible with * or >=)
            if (semver.major(dep.resolved) < semver.major(dep.latest)) {
              majorJump.push(dep);
            } else {
              safe.push(dep);
            }
          } else {
            // The latest version does NOT satisfy the range
            // Check true severity of the update
            const diff = semver.diff(dep.resolved, dep.latest);

            if (diff === 'major' || diff === 'premajor') {
              majorJump.push(dep);
            } else {
              // It's a safe update (minor/patch) even if it requires package.json change
              safe.push(dep);
            }
          }
        }
        // If current >= latest, no upgrade needed
      }
    }

    // Return the analysis report
    return {
      safe,
      blocked,
      majorJump,
      allDependencies
    };
  }

  /**
   * Preview available updates without applying them
   * @param options - Update options for filtering and behavior
   * @param onProgress - Optional progress callbacks
   * @param targetDirectory - Directory to analyze (defaults to current working directory)
   * @returns Promise<UpdatePlan> - Comprehensive update plan with categorized packages
   */
  async previewUpdate(options: UpdateOptions, onProgress?: ProgressCallbacks, targetDirectory: string = process.cwd()): Promise<UpdatePlan> {
    // Get current analysis for the target directory
    const analysis = await this.analyze(targetDirectory, onProgress);

    // Convert DependencyInfo to PackageUpdate
    const allUpdates: PackageUpdate[] = [];

    // Process safe updates
    for (const dep of analysis.safe) {
      const updateType = this.getUpdateType(dep.resolved, dep.latest);
      allUpdates.push({
        name: dep.name,
        currentVersion: dep.resolved,
        targetVersion: dep.latest,
        updateType,
        category: 'safe'
      });
    }

    // Process major updates
    for (const dep of analysis.majorJump) {
      const updateType = this.getUpdateType(dep.resolved, dep.latest);
      allUpdates.push({
        name: dep.name,
        currentVersion: dep.resolved,
        targetVersion: dep.latest,
        updateType,
        category: 'major'
      });
    }

    // Process blocked updates
    for (const dep of analysis.blocked) {
      const updateType = this.getUpdateType(dep.resolved, dep.latest);
      allUpdates.push({
        name: dep.name,
        currentVersion: dep.resolved,
        targetVersion: dep.latest,
        updateType,
        category: 'blocked',
        blocker: dep.blocker
      });
    }

    // Apply filters
    let filteredUpdates = allUpdates;

    if (options.safeOnly) {
      filteredUpdates = filteredUpdates.filter(u => u.category === 'safe');
    }

    if (!options.includeDev) {
      // Filter out dev dependencies (would need package.json access)
      // For now, we'll include all dependencies
    }

    // Categorize for the plan
    const categories = {
      safe: filteredUpdates.filter(u => u.category === 'safe'),
      major: filteredUpdates.filter(u => u.category === 'major'),
      blocked: filteredUpdates.filter(u => u.category === 'blocked')
    };

    // Estimate time (rough calculation: 30 seconds per package)
    const estimatedTime = filteredUpdates.length * 30;

    // Identify risks
    const risks: string[] = [];
    if (categories.major.length > 0) {
      risks.push(`${categories.major.length} major version updates may contain breaking changes`);
    }
    if (categories.blocked.length > 0) {
      risks.push(`${categories.blocked.length} packages are blocked by dependencies`);
    }

    return {
      packages: filteredUpdates,
      categories,
      estimatedTime,
      risks,
      totalPackages: filteredUpdates.length
    };
  }

  /**
   * Update selected packages
   * @param selectedPackages - Array of package names to update
   * @param options - Update options
   * @returns Promise<UpdateResult> - Result of the update operation
   */
  async update(selectedPackages: string[], options: UpdateOptions, projectPath: string = process.cwd()): Promise<UpdateResult> {
    const result: UpdateResult = {
      success: true,
      updated: [],
      failed: [],
      blocked: [],
      errors: []
    };

    try {
      // Pre-update validation
      const preValidationErrors = await UpdateValidator.validatePreUpdateState(projectPath);
      if (preValidationErrors.some(e => e.severity === 'error')) {
        result.success = false;
        result.errors = preValidationErrors.map(e => `${e.package}: ${e.reason}`);
        return result;
      }

      // Get update plan for validation
      const plan = await this.previewUpdate(options, undefined, projectPath);
      const selectedUpdates = plan.packages.filter(p => selectedPackages.includes(p.name));

      // Validate selected updates
      const validationErrors = await UpdateValidator.validateUpdates(selectedUpdates, projectPath);
      const criticalErrors = validationErrors.filter(e => e.severity === 'error');

      if (criticalErrors.length > 0) {
        result.success = false;
        result.errors = criticalErrors.map(e => `${e.package}: ${e.reason}`);
        return result;
      }

      // Show warnings but continue
      const warnings = validationErrors.filter(e => e.severity === 'warning');
      if (warnings.length > 0) {
        console.log('⚠️  Warnings:');
        warnings.forEach(w => console.log(`  ${w.package}: ${w.reason}`));
      }

      // Create backup using BackupManager
      let backupPath: string | undefined;
      if (options.backup !== false) {
        backupPath = await this.createBackup(projectPath);
        result.backupPath = backupPath;
        console.log(`💾 Backup created: ${backupPath}`);
      }

      // If dry run, just return what would be updated
      if (options.dryRun) {
        result.updated = selectedUpdates;
        return result;
      }

      // Run pre-update tests if available
      if (options.runTests !== false) {
        console.log('🧪 Running pre-update tests...');
        const testResult = await TestRunner.runPreUpdateTests(projectPath);
        if (!testResult.success) {
          result.success = false;
          result.errors?.push(`Pre-update tests failed: ${testResult.output}`);
          return result;
        }

        // Check if tests were actually run or skipped
        if (testResult.output.includes('No test script found - skipping pre-update tests')) {
          console.log('ℹ️  No test script found - skipping pre-update tests');
        } else {
          console.log('✅ Pre-update tests passed');
        }
      }

      // Update each package
      for (const update of selectedUpdates) {
        try {
          console.log(`📦 Updating ${update.name} (${update.currentVersion} → ${update.targetVersion})`);
          await this.updateSinglePackage(update.name, projectPath);

          result.updated.push({
            ...update,
            currentVersion: update.currentVersion,
            targetVersion: update.targetVersion
          });
          console.log(`✅ Updated ${update.name}`);
        } catch (error) {
          result.failed.push({
            ...update,
            currentVersion: update.currentVersion,
            targetVersion: update.targetVersion
          });
          result.errors?.push(`Failed to update ${update.name}: ${error}`);
          console.log(`❌ Failed to update ${update.name}: ${error}`);
        }
      }

      // Post-update validation
      const postValidationErrors = await UpdateValidator.validatePostUpdateState(projectPath);
      if (postValidationErrors.some(e => e.severity === 'error')) {
        result.success = false;
        result.errors?.push(...postValidationErrors.map(e => `Post-update error: ${e.package}: ${e.reason}`));
      }

      // Run post-update tests if available
      if (options.runTests !== false && result.success) {
        console.log('🧪 Running post-update tests...');
        const testResult = await TestRunner.runPostUpdateTests(projectPath);
        if (!testResult.success) {
          result.success = false;
          result.errors?.push(`Post-update tests failed: ${testResult.output}`);
          console.log('❌ Post-update tests failed - consider rollback');
        } else {
          // Check if tests were actually run or skipped
          if (testResult.output.includes('No test script found - skipping pre-update tests')) {
            console.log('ℹ️  No test script found - skipping post-update tests');
          } else {
            console.log('✅ Post-update tests passed');
          }
        }
      }

      // Cleanup old backups
      await BackupManager.cleanupBackups(5);

      return result;
    } catch (error) {
      result.success = false;
      result.errors?.push(`Update operation failed: ${error}`);
      return result;
    }
  }

  /**
   * Create backup of package.json and package-lock.json
   * @param projectPath - Path to the project directory
   * @returns Promise<string> - Path to backup directory
   */
  async createBackup(projectPath: string = process.cwd()): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = `${projectPath}/.depsver-backup-${timestamp}`;

    try {
      await this.fsModule.mkdir(backupDir, { recursive: true });

      // Backup package.json
      const packageJsonPath = `${projectPath}/package.json`;
      const packageJsonContent = await this.fsModule.readFile(packageJsonPath, 'utf-8');
      await this.fsModule.writeFile(`${backupDir}/package.json`, packageJsonContent);

      // Backup package-lock.json
      const packageLockPath = `${projectPath}/package-lock.json`;
      const packageLockContent = await this.fsModule.readFile(packageLockPath, 'utf-8');
      await this.fsModule.writeFile(`${backupDir}/package-lock.json`, packageLockContent);

      return backupDir;
    } catch (error) {
      throw wrapError(error, 'Failed to create backup') as FileSystemError;
    }
  }

  /**
   * Restore backup from specified directory
   * @param backupPath - Path to backup directory
   * @param projectPath - Path to the project directory
   */
  async restoreBackup(backupPath: string, projectPath: string = process.cwd()): Promise<void> {
    try {
      // Validate backup before restoration
      await this.validateBackup(backupPath);

      // Restore package.json
      const packageJsonContent = await this.fsModule.readFile(`${backupPath}/package.json`, 'utf-8');
      await this.fsModule.writeFile(`${projectPath}/package.json`, packageJsonContent);

      // Restore package-lock.json
      const packageLockContent = await this.fsModule.readFile(`${backupPath}/package-lock.json`, 'utf-8');
      await this.fsModule.writeFile(`${projectPath}/package-lock.json`, packageLockContent);

      // Verify restoration succeeded
      await this.verifyRestoration(projectPath, backupPath);

    } catch (error) {
      throw wrapError(error, 'Failed to restore backup') as FileSystemError;
    }
  }

  /**
   * Validate backup integrity before restoration
   * @private
   */
  private async validateBackup(backupPath: string): Promise<void> {
    const packageJsonPath = `${backupPath}/package.json`;
    const packageLockPath = `${backupPath}/package-lock.json`;
    const metadataPath = `${backupPath}/backup-info.json`;

    // Check required files exist
    const hasPackageJson = await this.fileExists(packageJsonPath);
    const hasPackageLock = await this.fileExists(packageLockPath);

    if (!hasPackageJson && !hasPackageLock) {
      throw new Error('Backup contains neither package.json nor package-lock.json');
    }

    // Validate JSON syntax if files exist
    if (hasPackageJson) {
      try {
        const content = await this.fsModule.readFile(packageJsonPath, 'utf-8');
        JSON.parse(content);
      } catch (error) {
        throw new Error(`Backup package.json is invalid: ${error}`);
      }
    }

    if (hasPackageLock) {
      try {
        const content = await this.fsModule.readFile(packageLockPath, 'utf-8');
        JSON.parse(content);
      } catch (error) {
        throw new Error(`Backup package-lock.json is invalid: ${error}`);
      }
    }

    // Validate metadata if available
    if (await this.fileExists(metadataPath)) {
      try {
        const metadataContent = await this.fsModule.readFile(metadataPath, 'utf-8');
        JSON.parse(metadataContent);
      } catch (error) {
        throw new Error(`Backup metadata is invalid: ${error}`);
      }
    }
  }

  /**
   * Verify that restoration was successful
   * @private
   */
  private async verifyRestoration(projectPath: string, backupPath: string): Promise<void> {
    const packageJsonPath = `${projectPath}/package.json`;
    const packageLockPath = `${projectPath}/package-lock.json`;

    // Verify files exist after restoration
    const hasPackageJson = await this.fileExists(packageJsonPath);
    const hasPackageLock = await this.fileExists(packageLockPath);

    if (!hasPackageJson && !hasPackageLock) {
      throw new Error('Restoration failed: No package files exist after restore');
    }

    // Verify JSON syntax
    try {
      if (hasPackageJson) {
        const packageJsonContent = await this.fsModule.readFile(packageJsonPath, 'utf-8');
        JSON.parse(packageJsonContent);
      }

      if (hasPackageLock) {
        const packageLockContent = await this.fsModule.readFile(packageLockPath, 'utf-8');
        JSON.parse(packageLockContent);
      }
    } catch (error) {
      throw new Error(`Restoration verification failed: ${error}`);
    }
  }

  /**
   * Check if a file exists
   * @private
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await this.fsModule.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate if a package update is safe
   * @param packageName - Name of the package to validate
   * @param version - Target version
   * @returns Promise<boolean> - True if update is valid
   */
  async validateUpdate(packageName: string, version: string): Promise<boolean> {
    try {
      // Check if package exists in registry
      const latestVersions = await fetchLatestVersions([packageName]);
      const latestVersion = latestVersions.get(packageName);

      if (!latestVersion) {
        return false;
      }

      // Validate version format
      if (!semver.valid(version)) {
        return false;
      }

      // Check if version is available (not newer than latest)
      if (semver.gt(version, latestVersion)) {
        return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Calculate the wanted version - latest version that satisfies the requested range
   * @private
   */
  private async getWantedVersion(latest: string, requested: string): Promise<string> {
    if (!requested || !semver.validRange(requested)) {
      return latest;
    }

    if (semver.satisfies(latest, requested)) {
      return latest;
    }

    // For now, return current resolved version as fallback
    // In a future improvement, we could fetch all available versions
    // and find the latest that satisfies the range
    return latest;
  }

  /**
   * Helper method to determine update type
   * @private
   */
  private getUpdateType(current: string, target: string): 'patch' | 'minor' | 'major' {
    if (!semver.valid(current) || !semver.valid(target)) {
      return 'patch';
    }

    if (semver.major(target) > semver.major(current)) {
      return 'major';
    } else if (semver.minor(target) > semver.minor(current)) {
      return 'minor';
    } else {
      return 'patch';
    }
  }

  /**
   * Helper method to update a single package using npm
   * @private
   */
  private async updateSinglePackage(packageName: string, projectPath: string = process.cwd()): Promise<void> {
    try {
      await execAsync(`npm install ${packageName}@latest`, { cwd: projectPath });
    } catch (error) {
      throw new UpdateFailedError(packageName, 'unknown', 'latest', error instanceof Error ? error : new Error(String(error)));
    }
  }
}
