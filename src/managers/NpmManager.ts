import { promises as fs } from 'fs';
import semver from 'semver';
import { DependencyManager, AnalysisReport, DependencyInfo } from './types.js';
import { fetchLatestVersions } from '../utils/registry.js';

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
  async analyze(directory: string): Promise<AnalysisReport> {
    // Step 1: Find and read files
    const packageJsonPath = `${directory}/package.json`;
    const packageLockPath = `${directory}/package-lock.json`;
    
    const packageJsonContent = await this.fsModule.readFile(packageJsonPath, 'utf-8');
    const packageLockContent = await this.fsModule.readFile(packageLockPath, 'utf-8');
    
    const packageJson = JSON.parse(packageJsonContent);
    const packageLock = JSON.parse(packageLockContent);
    
    // Step 2: Extract requested dependencies
    const requestedDependencies = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies
    };
    
    // Step 3: Get unique package names from package-lock.json
    const packageNames = Object.keys(packageLock.packages)
      .filter(key => key !== "") // Skip root package
      .map(key => {
        // Extract package name from node_modules/path
        if (key.startsWith("node_modules/")) {
          return key.replace("node_modules/", "");
        }
        return key;
      });
    
    const uniquePackageNames = [...new Set(packageNames)];
    
    // Step 4: Fetch latest versions
    const latestVersions = await fetchLatestVersions(uniquePackageNames);
    
    // Step 5: Populate allDependencies
    const allDependencies: DependencyInfo[] = [];
    
    for (const [packagePath, packageInfo] of Object.entries(packageLock.packages)) {
      if (packagePath === "") continue; // Skip root package
      
      // Extract package name from path
      let packageName = packagePath;
      if (packagePath.startsWith("node_modules/")) {
        packageName = packagePath.replace("node_modules/", "");
      }
      
      // Type assertion for packageInfo
      const pkgInfo = packageInfo as any;
      
      // Create dependency info
      const dependencyInfo: DependencyInfo = {
        name: packageName,
        requested: requestedDependencies[packageName] || undefined,
        resolved: pkgInfo.version,
        latest: latestVersions.get(packageName) || "unknown",
        dependencies: pkgInfo.dependencies || {}
      };
      
      allDependencies.push(dependencyInfo);
    }
    
    // Step 6: Core Analysis Logic - Categorize dependencies
    const safe: DependencyInfo[] = [];
    const blocked: (DependencyInfo & { blocker: string })[] = [];
    const majorJump: DependencyInfo[] = [];
    
    // Create a Map from allDependencies for fast lookups by package name
    const dependenciesMap = new Map<string, DependencyInfo>();
    for (const dep of allDependencies) {
      dependenciesMap.set(dep.name, dep);
    }
    
    // Loop through each dependency and perform analysis
    for (const dep of allDependencies) {
      // Step 4: Blocker Check
      let blockerName: string | null = null;
      
      // Iterate through all other packages to find potential blockers
      for (const potentialBlocker of allDependencies) {
        // Skip if it's the same package
        if (potentialBlocker.name === dep.name) continue;
        
        // Check if potentialBlocker has a dependency on dep.name
        const requiredRange = potentialBlocker.dependencies[dep.name];
        if (requiredRange) {
          // Check if the current version satisfies the required range
          if (dep.latest !== "unknown" && !semver.satisfies(dep.latest, requiredRange)) {
            blockerName = potentialBlocker.name;
            break; // Found a blocker, stop searching
          }
        }
      }
      
      // Step 5: Classification Logic
      if (blockerName) {
        // Package is blocked by another package
        blocked.push({
          ...dep,
          blocker: blockerName
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