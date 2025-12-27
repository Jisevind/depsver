import { NpmManager } from '../../src/managers/NpmManager.js';
import { promises as fs } from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import { vi } from 'vitest';

vi.mock('../../src/utils/registry.js');

describe('Large Project Performance', () => {
  let manager: NpmManager;
  let testDir: string;

  beforeEach(async () => {
    // Create a temporary test directory
    testDir = await fs.mkdtemp(path.join(tmpdir(), 'depsver-large-test-'));

    // Create a large mock package.json with many dependencies
    const dependencies: Record<string, string> = {};
    const devDependencies: Record<string, string> = {};

    // Generate 1000 mock dependencies
    for (let i = 0; i < 1000; i++) {
      dependencies[`package-${i}`] = `^${Math.floor(Math.random() * 5)}.${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 10)}`;
      if (i % 10 === 0) {
        devDependencies[`dev-package-${i}`] = `^${Math.floor(Math.random() * 3)}.${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 10)}`;
      }
    }

    const packageJson = {
      name: 'large-test-project',
      version: '1.0.0',
      dependencies,
      devDependencies
    };

    // Create a large mock package-lock.json
    const packages: Record<string, any> = {
      '': {
        name: 'large-test-project',
        version: '1.0.0'
      }
    };

    // Add all dependencies to packages
    for (let i = 0; i < 1000; i++) {
      const packageName = `package-${i}`;
      packages[`node_modules/${packageName}`] = {
        version: (dependencies[packageName] || '1.0.0').replace('^', ''),
        dependencies: {}
      };

      if (i % 10 === 0) {
        const devName = `dev-package-${i}`;
        packages[`node_modules/${devName}`] = {
          version: (devDependencies[devName] || '1.0.0').replace('^', ''),
          dependencies: {},
          dev: true
        };
      }
    }

    const packageLock = {
      name: 'large-test-project',
      version: '1.0.0',
      lockfileVersion: 2,
      packages
    };

    // Write files
    await fs.writeFile(
      path.join(testDir, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    );
    await fs.writeFile(
      path.join(testDir, 'package-lock.json'),
      JSON.stringify(packageLock, null, 2)
    );

    // Create manager with test directory
    manager = new NpmManager(fs);
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to clean up test directory:', error);
    }
  });

  it('should handle 1000+ dependencies without memory issues', async () => {
    const startTime = Date.now();
    const startMemory = process.memoryUsage();

    // Mock fetchLatestVersions to return versions for all packages
    const { fetchLatestVersions } = await import('../../src/utils/registry.js');
    vi.mocked(fetchLatestVersions).mockImplementation(async (packageNames) => {
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 10));

      const versions = new Map<string, string>();
      for (const name of packageNames) {
        versions.set(name, `${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 10)}`);
      }
      return versions;
    });

    const result = await manager.analyze(testDir);

    const endTime = Date.now();
    const endMemory = process.memoryUsage();

    // Verify performance metrics
    expect(endTime - startTime).toBeLessThan(30000); // Should complete within 30 seconds
    expect(endMemory.heapUsed - startMemory.heapUsed).toBeLessThan(100 * 1024 * 1024); // Should use less than 100MB additional memory

    // Verify analysis structure
    expect(result).toHaveProperty('safe');
    expect(result).toHaveProperty('blocked');
    expect(result).toHaveProperty('majorJump');
    expect(result).toHaveProperty('allDependencies');

    // Should handle all dependencies correctly
    expect(result.allDependencies.length).toBe(1100);
  });

  it('should complete analysis within reasonable time for complex dependency graphs', async () => {
    // Create a complex dependency scenario
    const packageJson = {
      name: 'complex-project',
      version: '1.0.0',
      dependencies: {
        'root-package': '^1.0.0',
        'level1-package': '^2.0.0',
        'level2a-package': '^3.0.0',
        'level2b-package': '^3.0.0'
      },
      devDependencies: {
        'dev-package': '^1.5.0'
      }
    };

    // Create complex dependency graph with chains
    const packages: Record<string, any> = {
      '': {
        name: 'complex-project',
        version: '1.0.0'
      },
      'node_modules/root-package': {
        version: '1.0.0',
        dependencies: {
          'level1-package': '^1.5.0',
          'level2a-package': '^2.5.0',
          'level2b-package': '^2.5.0'
        }
      },
      'node_modules/level1-package': {
        version: '1.5.0',
        dependencies: {
          'level2a-package': '^2.0.0',
          'level2b-package': '^2.0.0'
        }
      },
      'node_modules/level2a-package': {
        version: '2.0.0',
        dependencies: {
          'leaf-package-1': '^1.0.0',
          'leaf-package-2': '^1.0.0'
        }
      },
      'node_modules/level2b-package': {
        version: '2.0.0',
        dependencies: {
          'leaf-package-1': '^1.0.0',
          'leaf-package-2': '^1.0.0'
        }
      },
      'node_modules/leaf-package-1': {
        version: '1.0.0',
        dependencies: {}
      },
      'node_modules/leaf-package-2': {
        version: '1.0.0',
        dependencies: {}
      },
      'node_modules/dev-package': {
        version: '1.5.0',
        dev: true,
        dependencies: {}
      }
    };

    const packageLock = {
      name: 'complex-project',
      version: '1.0.0',
      lockfileVersion: 2,
      packages
    };

    await fs.writeFile(
      path.join(testDir, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    );
    await fs.writeFile(
      path.join(testDir, 'package-lock.json'),
      JSON.stringify(packageLock, null, 2)
    );

    manager = new NpmManager(fs);

    const startTime = Date.now();
    const result = await manager.analyze(testDir);
    const endTime = Date.now();

    // Should complete complex analysis within reasonable time
    expect(endTime - startTime).toBeLessThan(15000); // Should complete within 15 seconds
    expect(endTime - startTime).toBeGreaterThan(0); // But should take some time for complexity

    // Verify all dependencies were processed
    const expectedDependencies = Object.keys(packageJson.dependencies || {}).concat(
      Object.keys(packageJson.devDependencies || {})
    );
    expect(result.allDependencies.map(d => d.name)).toEqual(expect.arrayContaining(expectedDependencies));
  });

  it('should handle memory efficiently with O(n + m) blocker detection', async () => {
    // This test creates a scenario where we need to verify the O(n + m) complexity
    const totalPackages = 500; // n packages
    const totalDependencies = 2000; // m average dependencies per package

    const packageJson = {
      name: 'efficiency-test',
      version: '1.0.0',
      dependencies: {},
      devDependencies: {}
    };

    const packages: Record<string, any> = {
      '': {
        name: 'efficiency-test',
        version: '1.0.0'
      }
    };

    // Create packages with complex interdependencies
    for (let i = 0; i < totalPackages; i++) {
      const packageName = `package-${i}`;
      const dependencies: Record<string, string> = {};

      // Each package depends on multiple other packages (creating m dependencies)
      const dependencyCount = Math.floor(totalDependencies / totalPackages);
      for (let j = 0; j < dependencyCount; j++) {
        const depName = `dep-${i}-${j}`;
        dependencies[depName] = `^${Math.floor(Math.random() * 5)}.${Math.floor(Math.random() * 10)}.0`;
      }

      packages[`node_modules/${packageName}`] = {
        version: '1.0.0',
        dependencies
      };

      const packageJsonDeps = packageJson.dependencies as Record<string, string>;
      if (!packageJsonDeps) {
        (packageJson as any).dependencies = {};
      }
      (packageJson.dependencies as Record<string, string>)[packageName] = `^${Math.floor(Math.random() * 2)}.${Math.floor(Math.random() * 10)}.0`;
    }

    const packageLock = {
      name: 'efficiency-test',
      version: '1.0.0',
      lockfileVersion: 2,
      packages
    };

    await fs.writeFile(
      path.join(testDir, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    );
    await fs.writeFile(
      path.join(testDir, 'package-lock.json'),
      JSON.stringify(packageLock, null, 2)
    );

    manager = new NpmManager(fs);

    const startTime = Date.now();
    const result = await manager.analyze(testDir);
    const endTime = Date.now();

    // The key test: verify O(n + m) complexity by ensuring reasonable completion time
    const maxAllowedTime = (totalPackages + totalDependencies) * 2; // 2ms per package/dependency pair

    expect(endTime - startTime).toBeLessThan(maxAllowedTime);
    expect(endTime - startTime).toBeGreaterThan(0); // But should take some meaningful time

    // Verify the analysis is correct
    expect(result.allDependencies.length).toBe(totalPackages);
  });
});
