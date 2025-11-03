import { promises as fs } from 'fs';
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
    
    // Return the analysis report
    return {
      safe: [],
      blocked: [],
      majorJump: [],
      allDependencies
    };
  }
}