import { DependencyInfo, PackageUpdate } from '../managers/types.js';
import { getPackageVersion } from './version.js';

/**
 * Performance optimization utilities for dependency operations
 */
export class PerformanceOptimizer {
  private static cache = new Map<string, CacheEntry>();
  private static readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Optimized dependency analysis with caching and batching
   */
  static async optimizedAnalyze(
    dependencies: DependencyInfo[],
    options: OptimizationOptions = {}
  ): Promise<OptimizedResult> {
    const startTime = Date.now();
    const cacheKey = this.generateCacheKey(dependencies);

    // Check cache first
    if (!options.skipCache) {
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        return {
          ...cached,
          performance: {
            ...cached.performance,
            cacheHit: true,
            totalTime: Date.now() - startTime
          }
        };
      }
    }

    // Batch processing for registry queries
    const batchSize = options.batchSize || 10;
    const batches = this.createBatches(dependencies, batchSize);

    const results: DependencyInfo[] = [];
    const performanceMetrics: PerformanceMetrics = {
      cacheHits: 0,
      cacheMisses: 0,
      registryQueries: 0,
      totalTime: 0,
      averageQueryTime: 0,
      memoryUsage: process.memoryUsage()
    };

    // Process batches with concurrency control
    const concurrency = options.concurrency || 3;
    for (let i = 0; i < batches.length; i += concurrency) {
      const concurrentBatches = batches.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        concurrentBatches.map(batch => this.processBatch(batch, performanceMetrics))
      );
      results.push(...batchResults.flat());
    }

    const optimizedResult: OptimizedResult = {
      dependencies: results,
      performance: {
        ...performanceMetrics,
        totalTime: Date.now() - startTime,
        averageQueryTime: performanceMetrics.totalTime / performanceMetrics.registryQueries
      }
    };

    // Cache results
    if (!options.skipCache) {
      this.setCache(cacheKey, optimizedResult);
    }

    return optimizedResult;
  }

  /**
   * Memory-efficient package update generation
   */
  static generateUpdatesOptimized(
    dependencies: DependencyInfo[],
    options: UpdateGenerationOptions = {}
  ): PackageUpdate[] {
    const updates: PackageUpdate[] = [];
    const seen = new Set<string>();

    // Process dependencies in chunks to manage memory
    const chunkSize = options.chunkSize || 100;
    const chunks = this.createChunks(dependencies, chunkSize);

    for (const chunk of chunks) {
      const chunkUpdates = this.processChunk(chunk, options);

      // Deduplicate and filter
      for (const update of chunkUpdates) {
        const key = `${update.name}-${update.targetVersion}`;
        if (!seen.has(key)) {
          seen.add(key);
          updates.push(update);
        }
      }

      // Allow garbage collection between chunks
      if (options.allowGC) {
        if (global.gc) {
          global.gc();
        }
      }
    }

    return updates;
  }

  /**
   * Parallel registry queries with rate limiting
   */
  static async parallelRegistryQuery(
    packages: string[],
    options: QueryOptions = {}
  ): Promise<Map<string, any>> {
    const results = new Map<string, any>();
    const rateLimiter = new RateLimiter(options.rateLimit || 10); // 10 requests per second
    const concurrency = options.concurrency || 5;

    // Create query batches
    const batches = this.createBatches(packages, concurrency);

    for (const batch of batches) {
      const batchPromises = batch.map(async (pkg) => {
        await rateLimiter.wait();
        return this.queryPackage(pkg);
      });

      const batchResults = await Promise.allSettled(batchPromises);

      batchResults.forEach((result, index) => {
        const packageName = batch[index];
        if (packageName) {
          if (result.status === 'fulfilled') {
            results.set(packageName, result.value);
          } else {
            console.warn(`Failed to query ${packageName}:`, result.reason);
          }
        }
      });
    }

    return results;
  }

  /**
   * Progress tracking with performance metrics
   */
  static createProgressTracker(total: number): ProgressTracker {
    let completed = 0;
    const startTime = Date.now();
    const metrics: ProgressMetrics = {
      total,
      completed: 0,
      percentage: 0,
      estimatedTimeRemaining: 0,
      averageTimePerItem: 0,
      itemsPerSecond: 0
    };

    return {
      update: (increment = 1) => {
        completed += increment;
        const elapsed = Date.now() - startTime;

        metrics.completed = completed;
        metrics.percentage = Math.round((completed / total) * 100);
        metrics.averageTimePerItem = elapsed / completed;
        metrics.itemsPerSecond = completed / (elapsed / 1000);

        if (completed > 0) {
          const estimatedTotal = metrics.averageTimePerItem * total;
          metrics.estimatedTimeRemaining = estimatedTotal - elapsed;
        }

        return { ...metrics };
      },
      getMetrics: () => ({ ...metrics })
    };
  }

  /**
   * Memory usage monitoring
   */
  static createMemoryMonitor(): MemoryMonitor {
    const initial = process.memoryUsage();
    const samples: MemorySample[] = [];

    return {
      sample: () => {
        const current = process.memoryUsage();
        const sample: MemorySample = {
          timestamp: Date.now(),
          rss: current.rss,
          heapUsed: current.heapUsed,
          heapTotal: current.heapTotal,
          external: current.external,
          arrayBuffers: current.arrayBuffers
        };

        samples.push(sample);

        // Keep only last 100 samples
        if (samples.length > 100) {
          samples.shift();
        }

        return sample;
      },
      getTrend: () => {
        if (samples.length < 2) return 'stable';

        const recent = samples.slice(-10);
        const older = samples.slice(-20, -10);

        if (recent.length === 0 || older.length === 0) return 'stable';

        const recentAvg = recent.reduce((sum, s) => sum + s.heapUsed, 0) / recent.length;
        const olderAvg = older.reduce((sum, s) => sum + s.heapUsed, 0) / older.length;

        const change = (recentAvg - olderAvg) / olderAvg;

        if (change > 0.1) return 'increasing';
        if (change < -0.1) return 'decreasing';
        return 'stable';
      },
      getPeak: () => {
        if (samples.length === 0) {
          return {
            timestamp: Date.now(),
            rss: initial.rss,
            heapUsed: initial.heapUsed,
            heapTotal: initial.heapTotal,
            external: initial.external,
            arrayBuffers: initial.arrayBuffers
          };
        }
        return samples.reduce((max, sample) =>
          sample.heapUsed > max.heapUsed ? sample : max
        );
      }
    };
  }

  /**
   * Cache management
   */
  private static generateCacheKey(dependencies: DependencyInfo[]): string {
    const sorted = dependencies.sort((a, b) => a.name.localeCompare(b.name));
    const key = sorted.map(d => `${d.name}@${d.resolved}`).join('|');
    return this.hashString(key);
  }

  private static hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  private static getFromCache(key: string): OptimizedResult | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.DEFAULT_TTL) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  private static setCache(key: string, data: OptimizedResult): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });

    // Limit cache size
    if (this.cache.size > 50) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
  }

  private static createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  private static createChunks<T>(items: T[], chunkSize: number): T[][] {
    return this.createBatches(items, chunkSize);
  }

  private static async processBatch(
    batch: DependencyInfo[],
    metrics: PerformanceMetrics
  ): Promise<DependencyInfo[]> {
    const startTime = Date.now();

    try {
      // Simulate registry queries (in real implementation, this would query npm)
      const results = await Promise.all(
        batch.map(async (dep) => {
          metrics.registryQueries++;
          // Simulate network delay
          await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
          return {
            ...dep,
            latest: this.simulateLatestVersion(dep.resolved)
          };
        })
      );

      metrics.totalTime += Date.now() - startTime;
      return results;
    } catch (error) {
      console.error('Batch processing failed:', error);
      return batch; // Return original data on failure
    }
  }

  private static processChunk(
    chunk: DependencyInfo[],
    options: UpdateGenerationOptions
  ): PackageUpdate[] {
    const updates: PackageUpdate[] = [];

    for (const dep of chunk) {
      if (this.shouldUpdate(dep, options)) {
        updates.push(this.createUpdate(dep));
      }
    }

    return updates;
  }

  private static shouldUpdate(dep: DependencyInfo, options: UpdateGenerationOptions): boolean {
    if (!dep.latest) return false;

    const current = semver.clean(dep.resolved);
    const latest = semver.clean(dep.latest);

    if (!current || !latest) return false;

    return semver.gt(latest, current);
  }

  private static createUpdate(dep: DependencyInfo): PackageUpdate {
    const current = semver.clean(dep.resolved) || dep.resolved;
    const latest = semver.clean(dep.latest) || dep.latest;

    return {
      name: dep.name,
      currentVersion: current,
      targetVersion: latest,
      updateType: this.getUpdateType(current, latest),
      category: this.getUpdateCategory(current, latest)
    };
  }

  private static getUpdateType(current: string, latest: string): 'patch' | 'minor' | 'major' {
    const diff = semver.diff(latest, current);
    return (diff as 'patch' | 'minor' | 'major') || 'patch';
  }

  private static getUpdateCategory(current: string, latest: string): 'safe' | 'major' | 'blocked' {
    const updateType = this.getUpdateType(current, latest);
    return updateType === 'major' ? 'major' : 'safe';
  }

  private static simulateLatestVersion(current: string): string {
    // Simulate version checking (in real implementation, this would query npm)
    const parts = current.split('.').map(Number);
    const random = Math.random();

    if (random < 0.7) {
      // 70% chance of patch update
      return `${parts[0]}.${parts[1]}.${(parts[2] || 0) + 1}`;
    } else if (random < 0.9) {
      // 20% chance of minor update
      return `${parts[0]}.${(parts[1] || 0) + 1}.0`;
    } else {
      // 10% chance of major update
      return `${(parts[0] || 0) + 1}.0.0`;
    }
  }

  private static async queryPackage(packageName: string): Promise<any> {
    await new Promise(resolve => setTimeout(resolve, Math.random() * 200));
    return {
      name: packageName,
      version: getPackageVersion(),
      description: `Package ${packageName}`
    };
  }
}

/**
 * Rate limiter for controlling request frequency
 */
class RateLimiter {
  private lastRequest = 0;
  private readonly interval: number;

  constructor(requestsPerSecond: number) {
    this.interval = 1000 / requestsPerSecond;
  }

  async wait(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequest;

    if (timeSinceLastRequest < this.interval) {
      const delay = this.interval - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    this.lastRequest = Date.now();
  }
}

// Type definitions
export interface OptimizationOptions {
  skipCache?: boolean;
  batchSize?: number;
  concurrency?: number;
}

export interface UpdateGenerationOptions {
  chunkSize?: number;
  allowGC?: boolean;
  includeDev?: boolean;
  safeOnly?: boolean;
}

export interface QueryOptions {
  rateLimit?: number;
  concurrency?: number;
  timeout?: number;
}

export interface OptimizedResult {
  dependencies: DependencyInfo[];
  performance: PerformanceMetrics;
}

export interface PerformanceMetrics {
  cacheHits: number;
  cacheMisses: number;
  registryQueries: number;
  totalTime: number;
  averageQueryTime: number;
  memoryUsage: NodeJS.MemoryUsage;
  cacheHit?: boolean;
}

export interface ProgressTracker {
  update: (increment?: number) => ProgressMetrics;
  getMetrics: () => ProgressMetrics;
}

export interface ProgressMetrics {
  total: number;
  completed: number;
  percentage: number;
  estimatedTimeRemaining: number;
  averageTimePerItem: number;
  itemsPerSecond: number;
}

export interface MemoryMonitor {
  sample: () => MemorySample;
  getTrend: () => 'increasing' | 'decreasing' | 'stable';
  getPeak: () => MemorySample;
}

export interface MemorySample {
  timestamp: number;
  rss: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
}

interface CacheEntry {
  data: OptimizedResult;
  timestamp: number;
}

// Import semver for version comparison
import * as semver from 'semver';
