import { PackageUpdate, DependencyInfo } from '../managers/types.js';
import * as semver from 'semver';

/**
 * Blocker resolution utilities for dependency updates
 */
export class BlockerResolver {
  /**
   * Analyze dependency chains to identify blockers
   */
  static async analyzeBlockers(updates: PackageUpdate[], dependencies: DependencyInfo[]): Promise<BlockerAnalysis> {
    const blockers: BlockerInfo[] = [];
    const resolutionPaths: ResolutionPath[] = [];

    // Create dependency graph
    const dependencyGraph = this.buildDependencyGraph(dependencies);
    
    // Analyze each blocked package
    for (const update of updates.filter(u => u.category === 'blocked')) {
      const blockerAnalysis = await this.analyzeBlocker(update, dependencyGraph, dependencies);
      blockers.push(blockerAnalysis);
      
      // Generate resolution paths
      const paths = this.generateResolutionPaths(update, blockerAnalysis, dependencyGraph);
      resolutionPaths.push(...paths);
    }

    // Sort blockers by priority (fewest steps to resolve first)
    blockers.sort((a, b) => a.resolutionSteps.length - b.resolutionSteps.length);

    return {
      blockers,
      resolutionPaths,
      totalBlocked: blockers.length,
      estimatedResolutionTime: this.estimateResolutionTime(blockers)
    };
  }

  /**
   * Suggest optimal update order to minimize conflicts
   */
  static suggestUpdateOrder(updates: PackageUpdate[]): UpdateOrder {
    const ordered: PackageUpdate[] = [];
    const phases: UpdatePhase[] = [];
    
    // Separate by category
    const safe = updates.filter(u => u.category === 'safe');
    const major = updates.filter(u => u.category === 'major');
    const blocked = updates.filter(u => u.category === 'blocked');

    // Phase 1: Safe updates (no conflicts)
    if (safe.length > 0) {
      ordered.push(...safe);
      phases.push({
        name: 'Safe Updates',
        packages: safe,
        description: 'Updates that can be applied safely without conflicts',
        estimatedTime: safe.length * 30
      });
    }

    // Phase 2: Major updates (review required)
    if (major.length > 0) {
      ordered.push(...major);
      phases.push({
        name: 'Major Updates',
        packages: major,
        description: 'Major version updates requiring careful review',
        estimatedTime: major.length * 60
      });
    }

    // Phase 3: Blocked updates (require dependency resolution)
    if (blocked.length > 0) {
      // Sort blocked updates by dependency depth
      const sortedBlocked = this.sortBlockedByDependency(blocked);
      ordered.push(...sortedBlocked);
      phases.push({
        name: 'Blocked Updates',
        packages: sortedBlocked,
        description: 'Updates requiring dependency resolution',
        estimatedTime: sortedBlocked.length * 90
      });
    }

    return {
      ordered,
      phases,
      totalPhases: phases.length,
      estimatedTotalTime: phases.reduce((sum, phase) => sum + phase.estimatedTime, 0)
    };
  }

  /**
   * Generate interactive blocker resolution workflow
   */
  static async generateResolutionWorkflow(blockerAnalysis: BlockerAnalysis): Promise<ResolutionWorkflow> {
    const steps: ResolutionStep[] = [];
    
    for (const blocker of blockerAnalysis.blockers) {
      const step: ResolutionStep = {
        id: `resolve-${blocker.blockedPackage}`,
        title: `Resolve blocker for ${blocker.blockedPackage}`,
        description: `${blocker.blockedPackage} is blocked by ${blocker.blockerPackage}`,
        type: 'blocker-resolution',
        package: blocker.blockedPackage,
        impact: blocker.impact.riskLevel,
        automated: blocker.automatedResolvable,
        command: `# Resolve blocker for ${blocker.blockedPackage}`,
        actions: [],
        status: 'pending'
      };

      // Add resolution actions
      if (step.actions) {
        for (const resolution of blocker.resolutionSteps) {
          step.actions.push({
            id: `action-${resolution.type}-${resolution.package}`,
            description: resolution.description,
            type: resolution.type,
            package: resolution.package,
            impact: resolution.impact,
            automated: resolution.automated,
            command: resolution.command
          });
        }
      }

      steps.push(step);
    }

    return {
      title: 'Dependency Blocker Resolution',
      description: 'Step-by-step guide to resolve dependency conflicts',
      steps,
      currentStep: 0,
      totalSteps: steps.length,
      estimatedTime: blockerAnalysis.estimatedResolutionTime
    };
  }

  /**
   * Build dependency graph from dependencies
   */
  private static buildDependencyGraph(dependencies: DependencyInfo[]): Map<string, Set<string>> {
    const graph = new Map<string, Set<string>>();
    
    for (const dep of dependencies) {
      const dependents = new Set<string>();
      
      // Find all packages that depend on this one
      for (const otherDep of dependencies) {
        if (otherDep.dependencies[dep.name] || otherDep.peerDependencies[dep.name]) {
          dependents.add(otherDep.name);
        }
      }
      
      graph.set(dep.name, dependents);
    }
    
    return graph;
  }

  /**
   * Analyze a specific blocker
   */
  private static async analyzeBlocker(
    blockedUpdate: PackageUpdate,
    dependencyGraph: Map<string, Set<string>>,
    dependencies: DependencyInfo[]
  ): Promise<BlockerInfo> {
    const blockerPackage = blockedUpdate.blocker!;
    const resolutionSteps: ResolutionStep[] = [];

    // Find the blocker package info
    const blockerDep = dependencies.find(d => d.name === blockerPackage);
    if (!blockerDep) {
      throw new Error(`Blocker package ${blockerPackage} not found in dependencies`);
    }

    // Analyze current version constraints
    const currentConstraint = blockerDep.dependencies[blockedUpdate.name] || 
                             blockerDep.peerDependencies[blockedUpdate.name] || '';

    // Generate resolution options
    resolutionSteps.push(...this.generateResolutionOptions(
      blockedUpdate,
      blockerPackage,
      currentConstraint,
      blockerDep
    ));

    // Calculate impact
    const impact = await this.calculateResolutionImpact(blockedUpdate, blockerPackage, dependencyGraph);

    return {
      blockedPackage: blockedUpdate.name,
      blockerPackage,
      currentVersion: blockedUpdate.currentVersion,
      targetVersion: blockedUpdate.targetVersion,
      blockerCurrentVersion: blockerDep.resolved,
      blockerLatestVersion: blockerDep.latest,
      constraint: currentConstraint,
      resolutionSteps,
      impact,
      automatedResolvable: resolutionSteps.some(step => step.automated)
    };
  }

  /**
   * Generate resolution options for a blocker
   */
  private static generateResolutionOptions(
    blockedUpdate: PackageUpdate,
    blockerPackage: string,
    currentConstraint: string,
    blockerDep: DependencyInfo
  ): ResolutionStep[] {
    const options: ResolutionStep[] = [];

    // Option 1: Update blocker package
    if (semver.gt(blockerDep.latest, blockerDep.resolved)) {
      options.push({
        id: `update-${blockerPackage}`,
        description: `Update ${blockerPackage} to version compatible with ${blockedUpdate.targetVersion}`,
        type: 'update',
        package: blockerPackage,
        impact: 'medium',
        automated: true,
        command: `npm install ${blockerPackage}@latest`
      });
    }

    // Option 2: Relax constraint
    if (currentConstraint && !this.isPermissiveConstraint(currentConstraint)) {
      const newConstraint = this.suggestRelaxedConstraint(currentConstraint, blockedUpdate.targetVersion);
      options.push({
        id: `relax-${blockerPackage}`,
        description: `Update ${blockerPackage} dependency constraint from "${currentConstraint}" to "${newConstraint}"`,
        type: 'constraint-update',
        package: blockerPackage,
        impact: 'low',
        automated: false,
        command: `# Manually update package.json constraint for ${blockedUpdate.name}`
      });
    }

    // Option 3: Find alternative package
    options.push({
      id: `alternative-${blockedUpdate.name}`,
      description: `Find alternative package compatible with current ${blockerPackage} version`,
      type: 'alternative',
      package: blockedUpdate.name,
      impact: 'high',
      automated: false,
      command: `# Research alternative packages for ${blockedUpdate.name}`
    });

    return options;
  }

  /**
   * Generate resolution paths
   */
  private static generateResolutionPaths(
    blockedUpdate: PackageUpdate,
    blockerAnalysis: BlockerInfo,
    dependencyGraph: Map<string, Set<string>>
  ): ResolutionPath[] {
    const paths: ResolutionPath[] = [];

    // Direct resolution path
    paths.push({
      name: 'Direct Update',
      description: `Update ${blockerAnalysis.blockerPackage} to compatible version`,
      steps: [
        {
          action: 'update',
          package: blockerAnalysis.blockerPackage,
          from: blockerAnalysis.blockerCurrentVersion,
          to: blockerAnalysis.blockerLatestVersion
        },
        {
          action: 'update',
          package: blockedUpdate.name,
          from: blockedUpdate.currentVersion,
          to: blockedUpdate.targetVersion
        }
      ],
      confidence: 0.8,
      estimatedTime: 120
    });

    // Constraint relaxation path
    paths.push({
      name: 'Constraint Relaxation',
      description: `Relax dependency constraint in ${blockerAnalysis.blockerPackage}`,
      steps: [
        {
          action: 'constraint-update',
          package: blockerAnalysis.blockerPackage,
          constraint: blockerAnalysis.constraint
        },
        {
          action: 'update',
          package: blockedUpdate.name,
          from: blockedUpdate.currentVersion,
          to: blockedUpdate.targetVersion
        }
      ],
      confidence: 0.6,
      estimatedTime: 90
    });

    return paths;
  }

  /**
   * Sort blocked updates by dependency depth
   */
  private static sortBlockedByDependency(blocked: PackageUpdate[]): PackageUpdate[] {
    // Simple sort by blocker count (packages with fewer blockers first)
    return blocked.sort((a, b) => {
      const aBlockers = a.blocker ? a.blocker.split(',').length : 0;
      const bBlockers = b.blocker ? b.blocker.split(',').length : 0;
      return aBlockers - bBlockers;
    });
  }

  /**
   * Calculate resolution impact
   */
  private static async calculateResolutionImpact(
    blockedUpdate: PackageUpdate,
    blockerPackage: string,
    dependencyGraph: Map<string, Set<string>>
  ): Promise<ResolutionImpact> {
    const dependents = dependencyGraph.get(blockerPackage) || new Set();
    
    return {
      affectedPackages: Array.from(dependents),
      riskLevel: this.assessRiskLevel(blockedUpdate, blockerPackage),
      estimatedBreakage: dependents.size * 0.1, // 10% chance of breakage per dependent
      testCoverage: 'unknown' // Would need integration with test coverage tools
    };
  }

  /**
   * Assess risk level of resolution
   */
  private static assessRiskLevel(blockedUpdate: PackageUpdate, blockerPackage: string): 'low' | 'medium' | 'high' {
    if (blockedUpdate.updateType === 'major') return 'high';
    if (blockedUpdate.updateType === 'minor') return 'medium';
    return 'low';
  }

  /**
   * Check if constraint is permissive
   */
  private static isPermissiveConstraint(constraint: string): boolean {
    return constraint === '*' || constraint === '^' || constraint === '~';
  }

  /**
   * Suggest relaxed constraint
   */
  private static suggestRelaxedConstraint(currentConstraint: string, targetVersion: string): string {
    // Simple heuristic - suggest broader range
    if (currentConstraint.startsWith('^')) {
      return `^${targetVersion}`;
    }
    if (currentConstraint.startsWith('~')) {
      return `~${targetVersion}`;
    }
    return `^${targetVersion}`;
  }

  /**
   * Estimate resolution time
   */
  private static estimateResolutionTime(blockers: BlockerInfo[]): number {
    // Base time per blocker + complexity multiplier
    const baseTime = 5 * 60; // 5 minutes per blocker
    const complexityMultiplier = blockers.length > 3 ? 1.5 : 1.0;
    return Math.round(blockers.length * baseTime * complexityMultiplier);
  }
}

// Type definitions for blocker resolution
export interface BlockerAnalysis {
  blockers: BlockerInfo[];
  resolutionPaths: ResolutionPath[];
  totalBlocked: number;
  estimatedResolutionTime: number;
}

export interface BlockerInfo {
  blockedPackage: string;
  blockerPackage: string;
  currentVersion: string;
  targetVersion: string;
  blockerCurrentVersion: string;
  blockerLatestVersion: string;
  constraint: string;
  resolutionSteps: ResolutionStep[];
  impact: ResolutionImpact;
  automatedResolvable: boolean;
}

export interface ResolutionStep {
  id: string;
  description: string;
  type: 'update' | 'constraint-update' | 'alternative' | 'blocker-resolution';
  package: string;
  impact: 'low' | 'medium' | 'high';
  automated: boolean;
  command: string;
  actions?: ResolutionAction[];
  status?: 'pending' | 'in-progress' | 'completed';
  title?: string;
}

export interface ResolutionAction {
  id: string;
  description: string;
  type: 'update' | 'constraint-update' | 'alternative' | 'blocker-resolution';
  package: string;
  impact: 'low' | 'medium' | 'high';
  automated: boolean;
  command: string;
}

export interface ResolutionImpact {
  affectedPackages: string[];
  riskLevel: 'low' | 'medium' | 'high';
  estimatedBreakage: number;
  testCoverage: 'unknown' | 'low' | 'medium' | 'high';
}

export interface ResolutionPath {
  name: string;
  description: string;
  steps: Array<{
    action: string;
    package: string;
    from?: string;
    to?: string;
    constraint?: string;
  }>;
  confidence: number;
  estimatedTime: number;
}

export interface UpdateOrder {
  ordered: PackageUpdate[];
  phases: UpdatePhase[];
  totalPhases: number;
  estimatedTotalTime: number;
}

export interface UpdatePhase {
  name: string;
  packages: PackageUpdate[];
  description: string;
  estimatedTime: number;
}

export interface ResolutionWorkflow {
  title: string;
  description: string;
  steps: ResolutionStep[];
  currentStep: number;
  totalSteps: number;
  estimatedTime: number;
}
