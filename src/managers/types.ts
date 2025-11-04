// src/managers/types.ts
export interface DependencyInfo {
  name: string;
  requested: string;
  resolved: string;
  latest: string;
  dependencies: Record<string, string>;
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

export interface DependencyManager {
  detect(directory: string): Promise<boolean>;

  analyze(
    directory: string,
    onProgress?: ProgressCallbacks
  ): Promise<AnalysisReport>;
}