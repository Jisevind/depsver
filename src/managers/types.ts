// src/managers/types.ts

/**
 * Interface for package information in package-lock.json
 */
export interface PackageLockPackage {
  version: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  dev?: boolean;
  optional?: boolean;
  integrity?: string;
}

/**
 * Interface for the root package-lock.json structure
 */
export interface PackageLock {
  name: string;
  version: string;
  lockfileVersion: number;
  packages: Record<string, PackageLockPackage>;
}

export interface DependencyInfo {
  name: string;
  requested: string;
  resolved: string;
  latest: string;
  dependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
}

export interface AnalysisReport {
  safe: DependencyInfo[];
  blocked: (DependencyInfo & { blocker: string })[];
  majorJump: DependencyInfo[];
  allDependencies: DependencyInfo[];
}

/**
 * Defines the set of callbacks the CLI can provide
 * to the manager to report progress.
 */
export interface ProgressCallbacks {
  start: (total: number, payload: string) => void;
  increment: (payload: string) => void;
  stop: () => void;
}

export interface UpdateOptions {
  interactive?: boolean;
  safeOnly?: boolean;
  preview?: boolean;
  includeDev?: boolean;
  dryRun?: boolean;
  backup?: boolean;
  runTests?: boolean;
}

export interface PackageUpdate {
  name: string;
  currentVersion: string;
  targetVersion: string;
  updateType: 'patch' | 'minor' | 'major';
  category: 'safe' | 'major' | 'blocked';
  blocker?: string;
  changelog?: string;
  securityNotes?: string[];
}

export interface UpdateResult {
  success: boolean;
  updated: PackageUpdate[];
  failed: PackageUpdate[];
  blocked: PackageUpdate[];
  backupPath?: string;
  errors?: string[];
}

export interface UpdatePlan {
  packages: PackageUpdate[];
  categories: {
    safe: PackageUpdate[];
    major: PackageUpdate[];
    blocked: PackageUpdate[];
  };
  estimatedTime: number;
  risks: string[];
  totalPackages: number;
}

export interface BackupInfo {
  path: string;
  timestamp: Date;
  packageJsonHash: string;
  packageLockHash: string;
}

export interface UpdateValidationError {
  package: string;
  version: string;
  reason: string;
  severity: 'warning' | 'error';
}

export interface DependencyManager {
  detect(directory: string): Promise<boolean>;

  analyze(
    directory: string,
    onProgress?: ProgressCallbacks
  ): Promise<AnalysisReport>;

  previewUpdate(options: UpdateOptions): Promise<UpdatePlan>;
  update(selectedPackages: string[], options: UpdateOptions): Promise<UpdateResult>;
  createBackup(): Promise<string>;
  restoreBackup(backupPath: string): Promise<void>;
  validateUpdate(packageName: string, version: string): Promise<boolean>;
}

// Re-export blocker types for wider use
export type { 
  BlockerAnalysis, 
  BlockerInfo, 
  ResolutionStep, 
  ResolutionAction, 
  ResolutionImpact, 
  ResolutionPath, 
  UpdateOrder, 
  UpdatePhase, 
  ResolutionWorkflow 
} from '../utils/blocker.js';
