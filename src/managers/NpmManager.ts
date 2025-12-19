import { promises as fs } from 'fs';
import * as semver from 'semver';
import { DependencyManager, AnalysisReport, DependencyInfo, ProgressCallbacks, PackageLock, PackageLockPackage } from './types.js';
import { fetchLatestVersions } from '../utils/registry.js';
import {
  MalformedPackageJsonError,
  MalformedPackageLockError,
  FileSystemError,
  NetworkError,
  wrapError
} from '../utils/errors.js';

/**
 * Extracts the package name from a package-lock.json path.
 * e.g., "node_modules/react" -> "react"
 * e.g., "node_modules/clipboardy/node_modules/execa" -> "execa"
 * e.g., "node_modules/@types/node" -> "@types/node"
 */
export function extractPackageName(packagePath: string): string {
  const parts = packagePath.split('node_modules/');
  // The last part will always be the package name
  return parts[parts.length - 1] || '';
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
  
  // Basic npm package name validation
  // Package names can contain lowercase letters, numbers, hyphens, underscores, and dots
  // Scoped packages start with @ and contain a slash
  const npmPackageNameRegex = /^(@[a-z0-9-_.]+\/[a-z0-9-_.]+|[a-z0-9-_.]+)$/;
  
  return npmPackageNameRegex.test(packageName);
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
      packageLockContent = await this.fsModule.readFile(packageLockPath, 'utf-8');
    } catch (error) {
      throw wrapError(error, `Failed to read project files`) as FileSystemError;
    }
    
    let packageJson: any;
    let packageLock: PackageLock;
    
    try {
      packageJson = JSON.parse(packageJsonContent);
    } catch (error) {
      throw new MalformedPackageJsonError(error instanceof Error ? error.message : String(error));
    }
    
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
        let wantedVersion = dep.latest;
        if (!semver.satisfies(dep.latest, dep.requested)) {
          // Find the latest version that satisfies the range
          // For now, we'll use the current resolved version as fallback
          wantedVersion = dep.resolved;
        }
        
        // Compare current (resolved) vs wanted
        if (semver.gt(wantedVersion, dep.resolved)) {
          if (semver.major(dep.resolved) < semver.major(wantedVersion)) {
            // Major version jump required
            majorJump.push(dep);
          } else {
            // Safe minor or patch upgrade
            safe.push(dep);
          }
        }
        // If current >= wanted, no upgrade needed
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
}
