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
function extractPackageName(packagePath: string): string {
  const parts = packagePath.split('node_modules/');
  // The last part will always be the package name
  return parts[parts.length - 1] || '';
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
    
    // Step 3: Get unique package names from package-lock.json
    const packageNames = Object.keys(packageLock.packages)
      .filter(key => key !== "") // Skip root package
      .map(key => extractPackageName(key));
    
    const uniquePackageNames = [...new Set(packageNames)];
    
    // Initialize progress tracking
    onProgress?.start(uniquePackageNames.length, 'Fetching latest versions');
    
    // Step 4: Fetch latest versions
    let latestVersions: Map<string, string>;
    try {
      latestVersions = await fetchLatestVersions(uniquePackageNames, onProgress?.increment);
    } catch (error) {
      throw wrapError(error, 'Failed to fetch latest package versions') as NetworkError;
    }
    
    // Stop progress tracking
    onProgress?.stop();
    
    // Step 5: Create a Map of ALL packages for blocker detection
    const allPackagesMap = new Map<string, DependencyInfo>();
    
    for (const [packagePath, packageInfo] of Object.entries(packageLock.packages)) {
      if (packagePath === "") continue; // Skip root package
      
      // Extract package name from path
      const packageName = extractPackageName(packagePath);
      
      // Type assertion for packageInfo with proper interface
      const pkgInfo = packageInfo as PackageLockPackage;
      
      // Create dependency info for ALL packages (needed for blocker detection)
      const dependencyInfo: DependencyInfo = {
        name: packageName,
        requested: requestedDependencies[packageName] || undefined,
        resolved: pkgInfo.version,
        latest: latestVersions.get(packageName) || "unknown",
        dependencies: pkgInfo.dependencies || {},
        peerDependencies: pkgInfo.peerDependencies || {}
      };
      
      allPackagesMap.set(packageName, dependencyInfo);
    }
    
    // Step 6: Populate allDependencies - only for top-level dependencies
    const allDependencies: DependencyInfo[] = [];
    
    for (const depName of Object.keys(requestedDependencies)) {
      const dep = allPackagesMap.get(depName);
      if (dep) {
        allDependencies.push(dep);
      }
    }
    
    // Step 7: Build dependency index for efficient blocker detection - O(n + m)
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

    // Step 8: Core Analysis Logic - Categorize dependencies
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

      // Step 4: Blocker Check using reverse index - O(k) where k = packages depending on dep
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
      
      // Step 5: Classification Logic
      if (foundBlockerName) {
        // Package is blocked by another package
        blocked.push({
          ...dep,
          blocker: foundBlockerName
        });
      } else if (dep.latest === 'unknown' || semver.gte(dep.resolved, dep.latest)) {
        // Package is already at latest version or we can't verify it - do nothing
        continue;
      } else if (semver.major(dep.resolved) < semver.major(dep.latest)) {
        // Major version jump required
        majorJump.push(dep);
      } else {
        // Safe minor or patch upgrade
        safe.push(dep);
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