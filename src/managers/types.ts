// src/managers/types.ts
export interface DependencyInfo {
  name: string;
  requested: string; // From package.json
  resolved: string;  // From package-lock.json
  latest: string;    // From registry
  dependencies: Record<string, string>; // Sub-dependencies from lockfile
}

export interface AnalysisReport {
  safe: DependencyInfo[];
  blocked: (DependencyInfo & { blocker: string })[];
  majorJump: DependencyInfo[];
  allDependencies: DependencyInfo[]; // For the full-context list
}

export interface DependencyManager {
  /** Checks if this manager can run in the given directory */
  detect(directory: string): Promise<boolean>;

  /** Runs the full analysis and returns the data for the report */
  analyze(directory: string): Promise<AnalysisReport>;
}