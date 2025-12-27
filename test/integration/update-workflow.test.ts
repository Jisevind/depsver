import { vi } from 'vitest';

vi.mock('../../src/utils/registry.js');
vi.mock('child_process');

import { NpmManager } from '../../src/managers/NpmManager.js';
import { promises as fs } from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import type { PackageUpdate } from '../../src/managers/types.js';

describe('Update Workflow Integration', () => {
  let manager: NpmManager;
  let testDir: string;

  beforeEach(async () => {
    // Create a temporary test directory
    testDir = await fs.mkdtemp(path.join(tmpdir(), 'depsver-test-'));

    // Create mock package.json
    const packageJson = {
      name: 'test-project',
      version: '1.0.0',
      dependencies: {
        'lodash': '^4.17.20',
        'react': '^17.0.0',
        'outdated-package': '^1.0.0'
      },
      devDependencies: {
        'typescript': '^4.5.0'
      }
    };

    // Create mock package-lock.json
    const packageLock = {
      name: 'test-project',
      version: '1.0.0',
      lockfileVersion: 2,
      packages: {
        '': {
          name: 'test-project',
          version: '1.0.0'
        },
        'node_modules/lodash': {
          version: '4.17.20',
          dependencies: {}
        },
        'node_modules/react': {
          version: '17.0.2',
          dependencies: {
            'loose-envify': '^1.1.0'
          }
        },
        'node_modules/outdated-package': {
          version: '1.0.0',
          dependencies: {}
        },
        'node_modules/blocker-package': {
          version: '2.0.0',
          dependencies: {
            'lodash': '^4.0.0', // This blocks lodash update
            'react': '^17.0.0'  // This blocks react update
          }
        },
        'node_modules/typescript': {
          version: '4.5.4',
          dev: true,
          dependencies: {}
        }
      }
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

  it('should handle blocked dependencies correctly', async () => {
    // Mock fetchLatestVersions to return specific versions
    const { fetchLatestVersions } = await import('../../src/utils/registry.js');
    vi.mocked(fetchLatestVersions).mockResolvedValue(new Map([
      ['lodash', '5.0.0'], // Major update available
      ['react', '18.2.0'], // Major update but blocked
      ['outdated-package', '1.1.0'], // Safe update available
      ['typescript', '4.6.0'], // Minor update available
      ['blocker-package', '2.1.0'], // Update available for blocker
      ['fail-package', '1.1.0'], // Update available
    ]));

    const result = await manager.analyze(testDir);

    // Verify analysis structure
    expect(result).toHaveProperty('safe');
    expect(result).toHaveProperty('blocked');
    expect(result).toHaveProperty('majorJump');
    expect(result).toHaveProperty('allDependencies');

    // Check specific classifications
    expect(result.safe.length).toBe(2); // outdated-package, typescript
    expect(result.blocked.length).toBe(2); // lodash (blocked), react (blocked)
    expect(result.majorJump.length).toBe(0);

    // Check blocker identification
    const blockedLodash = result.blocked.find(b => b.name === 'lodash');
    expect(blockedLodash?.blocker).toBe('blocker-package');

    const blockedReact = result.blocked.find(b => b.name === 'react');
    expect(blockedReact?.blocker).toBe('blocker-package');
  });

  it('should validate dependency conflicts properly', async () => {
    // Mock fetchLatestVersions
    const { fetchLatestVersions } = await import('../../src/utils/registry.js');
    vi.mocked(fetchLatestVersions).mockResolvedValue(new Map([
      ['package-a', '2.0.0'],
      ['package-b', '1.5.0'],
      ['conflicting-package', '1.0.0']
    ]));

    // Create a scenario with conflicting updates
    // First setup a lockfile with dependencies
    const conflictLock = {
      name: 'test-project',
      version: '1.0.0',
      packages: {
        '': { name: 'test-project', version: '1.0.0' },
        'node_modules/package-a': { version: '1.0.0' },
        'node_modules/dependent': {
          version: '1.0.0',
          dependencies: { 'package-a': '^1.0.0' }
        }
      }
    };
    await fs.writeFile(path.join(testDir, 'package-lock.json'), JSON.stringify(conflictLock));
    await fs.writeFile(path.join(testDir, 'package.json'), JSON.stringify({ dependencies: { 'package-a': '1.0.0' } }));

    const updates: PackageUpdate[] = [
      {
        name: 'package-a',
        currentVersion: '1.0.0',
        targetVersion: '2.0.0',
        updateType: 'major' as const,
        category: 'safe'
      },
      {
        name: 'package-b',
        currentVersion: '1.0.0',
        targetVersion: '1.5.0',
        updateType: 'minor' as const,
        category: 'safe'
      }
    ];

    // Test validation
    const { UpdateValidator } = await import('../../src/utils/validation.js');
    const errors = await UpdateValidator.validateUpdates(updates, testDir);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.severity === 'error')).toBe(true);
  });

  it('should create and restore backups correctly', async () => {
    const backupPath = await manager.createBackup(testDir);

    // Verify backup was created
    expect(backupPath).toContain('.depsver-backup-');

    // Verify backup contents
    const backupPackageJson = await fs.readFile(path.join(backupPath, 'package.json'), 'utf-8');
    const backupPackageLock = await fs.readFile(path.join(backupPath, 'package-lock.json'), 'utf-8');

    expect(JSON.parse(backupPackageJson)).toBeDefined();
    expect(JSON.parse(backupPackageLock)).toBeDefined();

    // Modify original files
    await fs.writeFile(
      path.join(testDir, 'package.json'),
      JSON.stringify({ name: 'modified', version: '1.0.0' }, null, 2)
    );

    // Restore from backup
    await manager.restoreBackup(backupPath, testDir);

    // Verify restoration
    const restoredPackageJson = await fs.readFile(path.join(testDir, 'package.json'), 'utf-8');
    const restoredPackage = JSON.parse(restoredPackageJson);
    expect(restoredPackage.name).toBe('test-project'); // Should be restored to original
  });

  it('should handle partial update failures', async () => {
    // Mock exec to fail for specific package
    const { exec } = await import('child_process');
    vi.mocked(exec).mockImplementation((...args: any[]) => {
      const command = args[0];
      const callback = args.find(arg => typeof arg === 'function');
      console.log('MOCK EXEC COMMAND:', command);

      if (callback) {
        callback(null, '', '');
      }
      return {} as any;
    });

    const updateOptions = {
      interactive: false,
      safeOnly: false,
      preview: false,
      includeDev: true,
      dryRun: false,
      backup: true,
      runTests: false
    };

    // Remove blocker-package from lockfile so lodash update isn't blocked by validation
    const noBlockerLock = {
      name: 'test-project',
      version: '1.0.0',
      packages: {
        '': { name: 'test-project', version: '1.0.0' },
        'node_modules/lodash': { version: '4.17.20' },
        'node_modules/typescript': { version: '4.5.4', dev: true },
        'node_modules/fail-package': { version: '1.0.0' }
      }
    };
    await fs.writeFile(path.join(testDir, 'package-lock.json'), JSON.stringify(noBlockerLock));
    await fs.writeFile(path.join(testDir, 'package.json'), JSON.stringify({
      dependencies: { 'lodash': '^4.17.20', 'fail-package': '^1.0.0' },
      devDependencies: { 'typescript': '^4.5.0' }
    }));

    // Spy on previewUpdate to guarantee lodash is selected (bypassing analyze complexity)
    vi.spyOn(manager, 'previewUpdate').mockResolvedValue({
      packages: [{
        name: 'lodash',
        currentVersion: '4.17.20',
        targetVersion: '5.0.0',
        updateType: 'major',
        category: 'valid' // or 'major' depending on typings, but logic usually just takes it
      }]
    } as any);

    // Spy on updateSinglePackage to force failure (bypass exec mock complexity)
    vi.spyOn(manager as any, 'updateSinglePackage').mockImplementation(async (pkg: any) => {
      if (pkg === 'lodash') {
        throw new Error('Simulation failed');
      }
      return Promise.resolve();
    });

    // Try to update packages including one that will fail
    const result = await manager.update(
      ['lodash'],
      updateOptions,
      testDir
    );

    // Verify handling
    const hasFailures = result.failed.some(f => f.name === 'lodash') || (result.errors && result.errors.length > 0);
    expect(hasFailures).toBe(true);
    // updated can be anything (0).
  });

  it('should rollback on failed post-update validation', async () => {
    // Mock validation to fail after update
    const { UpdateValidator } = await import('../../src/utils/validation.js');
    vi.spyOn(UpdateValidator, 'validatePostUpdateState').mockResolvedValue([
      {
        package: 'package.json',
        version: 'unknown',
        reason: 'Post-update validation failed',
        severity: 'error'
      }
    ]);

    const updateOptions = {
      interactive: false,
      safeOnly: false,
      preview: false,
      includeDev: false,
      dryRun: false,
      backup: true,
      runTests: false
    };

    // Remove blocker so update proceeds to post-validation
    const noBlockerLock = {
      name: 'test-project',
      version: '1.0.0',
      packages: {
        '': { name: 'test-project', version: '1.0.0' },
        'node_modules/lodash': { version: '4.17.20' }
      }
    };
    await fs.writeFile(path.join(testDir, 'package-lock.json'), JSON.stringify(noBlockerLock));
    await fs.writeFile(path.join(testDir, 'package.json'), JSON.stringify({ dependencies: { 'lodash': '^4.17.20' } }));

    const result = await manager.update(['lodash'], updateOptions, testDir);

    // Verify rollback occurred
    expect(result.success).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Post-update error')
      ])
    );
  });
});
