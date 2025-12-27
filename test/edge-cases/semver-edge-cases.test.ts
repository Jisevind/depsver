import { NpmManager, extractPackageName, isValidPackageName } from '../../src/managers/NpmManager.js';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as semver from 'semver';
import { tmpdir } from 'os';
import { vi } from 'vitest';

vi.mock('../../src/utils/registry.js');

describe('Semver Edge Cases', () => {
  let manager: NpmManager;
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(tmpdir(), 'depsver-semver-test-'));
    manager = new NpmManager(fs);
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to clean up test directory:', error);
    }
  });

  describe('extractPackageName', () => {
    it('should handle simple package names', () => {
      expect(extractPackageName('node_modules/react')).toBe('react');
      expect(extractPackageName('node_modules/@types/node')).toBe('@types/node');
      expect(extractPackageName('node_modules/clipboardy/node_modules/execa')).toBe('execa');
    });

    it('should handle nested node_modules', () => {
      expect(extractPackageName('node_modules/clipboardy/node_modules/execa')).toBe('execa');
      expect(extractPackageName('node_modules/a/b/c/d')).toBe('d');
    });

    it('should handle empty or invalid paths', () => {
      expect(extractPackageName('')).toBe('');
      expect(extractPackageName('node_modules/')).toBe('');
      expect(extractPackageName('node_modules')).toBe('');
    });

    it('should handle edge cases with multiple separators', () => {
      expect(extractPackageName('node_modules/@babel/core/lib/data')).toBe('data');
      expect(extractPackageName('node_modules/@babel/preset-react/lib')).toBe('lib');
    });
  });

  describe('isValidPackageName', () => {
    it('should validate valid package names', () => {
      expect(isValidPackageName('react')).toBe(true);
      expect(isValidPackageName('@types/node')).toBe(true);
      expect(isValidPackageName('package-name')).toBe(true);
      expect(isValidPackageName('package_name')).toBe(false); // underscore not allowed
      expect(isValidPackageName('Package-Name')).toBe(false); // capital letters not allowed
      expect(isValidPackageName('')).toBe(false); // empty not allowed
      expect(isValidPackageName('   ')).toBe(false); // whitespace not allowed
    });

    it('should handle scoped packages correctly', () => {
      expect(isValidPackageName('@types/node')).toBe(true);
      expect(isValidPackageName('@babel/core')).toBe(true);
      expect(isValidPackageName('@babel/preset-react')).toBe(true);
      expect(isValidPackageName('@company/package')).toBe(true);
      expect(isValidPackageName('types/node')).toBe(false); // missing @ for scoped
      expect(isValidPackageName('@/node')).toBe(false); // missing package name after @
      expect(isValidPackageName('@company/')).toBe(false); // missing package name after /
    });

    it('should reject invalid formats', () => {
      expect(isValidPackageName('React')).toBe(false); // capital letters
      expect(isValidPackageName('package name')).toBe(false); // spaces
      expect(isValidPackageName('package@name')).toBe(false); // @ in middle
      expect(isValidPackageName('package#name')).toBe(false); // invalid character
    });
  });

  describe('Semver Comparison Logic', () => {
    it('should handle pre-release versions correctly', () => {
      // Test semver behavior with pre-release versions
      expect(semver.gt('1.0.0-alpha.1', '1.0.0-alpha.0')).toBe(true);
      expect(semver.gt('1.0.0-beta.2', '1.0.0-beta.1')).toBe(true);
      expect(semver.gt('2.0.0-rc.1', '2.0.0-rc.0')).toBe(true);
      expect(semver.satisfies('1.0.0-alpha.1', '^1.0.0', { includePrerelease: true })).toBe(false); // 1.0.0-alpha.1 < 1.0.0, so it doesn't satisfy ^1.0.0
      expect(semver.satisfies('1.0.0-beta.2', '^1.0.0', { includePrerelease: true })).toBe(false);
      expect(semver.satisfies('2.0.0-rc.1', '^2.0.0')).toBe(false); // rc doesn't satisfy ^2.0.0
    });

    it('should handle complex version ranges', () => {
      // Test complex semver range satisfaction
      expect(semver.satisfies('1.5.0', '^1.0.0')).toBe(true);
      expect(semver.satisfies('1.5.0', '~1.0.0')).toBe(false);
      expect(semver.satisfies('1.5.0', '>=1.0.0')).toBe(true);
      expect(semver.satisfies('1.5.0', '1.x')).toBe(true); // 1.x matches 1.5.0
      expect(semver.satisfies('1.5.0', '>=1.0.0 <2.0.0')).toBe(true);
      expect(semver.satisfies('1.5.0', '>=1.0.0 <2.0.0 || >=3.0.0')).toBe(true);
    });

    it('should handle edge case versions', () => {
      expect(semver.valid('1.0.0')).toBeTruthy();
      expect(semver.valid('0.0.1')).toBeTruthy();
      expect(semver.valid('999.999.999')).toBeTruthy();
      expect(semver.valid('1.0.0-alpha')).toBeTruthy();
      expect(semver.valid('1.0.0-beta.1')).toBeTruthy();
      expect(semver.valid('invalid')).toBeNull();
      expect(semver.valid('')).toBeNull();
      expect(semver.valid('v1.0.0')).toBeTruthy(); // v prefix is allowed/cleaned by semver.valid
    });
  });

  describe('Blocker Detection Edge Cases', () => {
    it('should handle circular dependencies correctly', async () => {
      // Mock registry to return same versions
      const { fetchLatestVersions } = await import('../../src/utils/registry.js');
      vi.mocked(fetchLatestVersions).mockResolvedValue(new Map([
        ['package-a', '1.1.0'],
        ['package-b', '1.1.0']
      ]));

      // Create a circular dependency scenario
      const packageJson = {
        name: 'circular-test',
        version: '1.0.0',
        dependencies: {
          'package-a': '^1.0.0',
          'package-b': '^1.0.0'
        }
      };

      const packageLock = {
        name: 'circular-test',
        version: '1.0.0',
        lockfileVersion: 2,
        packages: {
          '': {
            name: 'circular-test',
            version: '1.0.0'
          },
          'node_modules/package-a': {
            version: '1.0.0',
            dependencies: {
              'package-b': '^1.0.0'
            }
          },
          'node_modules/package-b': {
            version: '1.0.0',
            dependencies: {
              'package-a': '^1.0.0'
            }
          }
        }
      };

      await fs.writeFile(
        path.join(testDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );
      await fs.writeFile(
        path.join(testDir, 'package-lock.json'),
        JSON.stringify(packageLock, null, 2)
      );

      const result = await manager.analyze(testDir);

      // In circular dependencies, packages should not be blocked by each other
      // since they're at the same version level
      expect(result.blocked.length).toBe(0);
      expect(result.safe.length + result.majorJump.length).toBe(2);
    });

    it('should handle complex blocker chains', async () => {
      // Mock registry
      const { fetchLatestVersions } = await import('../../src/utils/registry.js');
      vi.mocked(fetchLatestVersions).mockResolvedValue(new Map([
        ['package-a', '2.0.0'], // Update available to 2.0.0
        ['package-b', '2.0.0'], // Already on 2.0.0
        ['package-c', '1.5.0']  // Already on 1.5.0
      ]));

      // Create a chain: A -> B -> C, where C is outdated
      const packageJson = {
        name: 'blocker-chain-test',
        version: '1.0.0',
        dependencies: {
          'package-a': '^1.0.0',
          'package-b': '^1.0.0'
        }
      };

      const packageLock = {
        name: 'blocker-chain-test',
        version: '1.0.0',
        lockfileVersion: 2,
        packages: {
          '': {
            name: 'blocker-chain-test',
            version: '1.0.0'
          },
          'node_modules/package-a': {
            version: '1.0.0',
            dependencies: {}
          },
          'node_modules/package-b': {
            version: '2.0.0', // This is newer, blocks A
            dependencies: {
              'package-a': '^1.5.0' // This range blocks A from updating
            }
          },
          'node_modules/package-c': {
            version: '1.5.0' // This is outdated, doesn't block anything
          }
        }
      };

      await fs.writeFile(
        path.join(testDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );
      await fs.writeFile(
        path.join(testDir, 'package-lock.json'),
        JSON.stringify(packageLock, null, 2)
      );

      const result = await manager.analyze(testDir);

      // Package-a should be blocked by package-b
      const blockedA = result.blocked.find(b => b.name === 'package-a');
      expect(blockedA?.blocker).toBe('package-b');

      // Package-c should be blocked by nothing (it's already at latest)
      const blockedC = result.blocked.find(b => b.name === 'package-c');
      expect(blockedC).toBeUndefined();

      // Package-b should not be blocked (it's the blocker)
      expect(result.blocked.some(b => b.name === 'package-b')).toBe(false);
    });
  });

  describe('Error Handling Edge Cases', () => {
    it('should handle malformed package.json gracefully', async () => {
      // Create malformed package.json
      await fs.writeFile(
        path.join(testDir, 'package.json'),
        '{"name": "test", "version": "1.0.0"' // Missing closing brace
      );

      // Should throw malformed package.json error
      await expect(manager.analyze(testDir)).rejects.toThrow('Invalid package.json format');
    });

    it('should handle missing package-lock.json gracefully', async () => {
      // Create package.json without package-lock.json
      const packageJson = {
        name: 'no-lockfile-test',
        version: '1.0.0',
        dependencies: {
          'lodash': '^4.17.0'
        }
      };

      await fs.writeFile(
        path.join(testDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );

      // Should detect as invalid project
      const isValid = await manager.detect(testDir);
      expect(isValid).toBe(false);
    });

    it('should handle registry failures gracefully', async () => {
      // Mock fetchLatestVersions to throw network error
      const { fetchLatestVersions } = await import('../../src/utils/registry.js');
      vi.mocked(fetchLatestVersions).mockRejectedValue(new Error('Network unreachable'));

      const packageJson = {
        name: 'registry-fail-test',
        version: '1.0.0',
        dependencies: {
          'lodash': '^4.17.0'
        }
      };

      const packageLock = {
        name: 'registry-fail-test',
        version: '1.0.0',
        lockfileVersion: 2,
        packages: {
          '': {
            name: 'registry-fail-test',
            version: '1.0.0'
          },
          'node_modules/lodash': {
            version: '4.17.0',
            dependencies: {}
          }
        }
      };

      await fs.writeFile(
        path.join(testDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );
      await fs.writeFile(
        path.join(testDir, 'package-lock.json'),
        JSON.stringify(packageLock, null, 2)
      );

      // Should throw network error
      await expect(manager.analyze(testDir)).rejects.toThrow('Failed to fetch latest package versions');
    });
  });
});
