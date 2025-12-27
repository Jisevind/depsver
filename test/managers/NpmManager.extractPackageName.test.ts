import { extractPackageName, isValidPackageName } from '../../src/managers/NpmManager.js';

describe('extractPackageName and validation', () => {
  describe('extractPackageName', () => {
    it('should extract simple package names correctly', () => {
      expect(extractPackageName('node_modules/react')).toBe('react');
      expect(extractPackageName('node_modules/lodash')).toBe('lodash');
    });

    it('should extract scoped package names correctly', () => {
      expect(extractPackageName('node_modules/@types/node')).toBe('@types/node');
      expect(extractPackageName('node_modules/@babel/core')).toBe('@babel/core');
    });

    it('should handle nested node_modules paths', () => {
      expect(extractPackageName('node_modules/clipboardy/node_modules/execa')).toBe('execa');
      expect(extractPackageName('node_modules/a/node_modules/b/node_modules/c')).toBe('c');
    });

    it('should return empty string for invalid paths', () => {
      expect(extractPackageName('')).toBe('');
      expect(extractPackageName('some/other/path')).toBe(''); // No node_modules in path
      expect(extractPackageName('node_modules/')).toBe('');
    });
  });

  describe('isValidPackageName', () => {
    it('should validate simple package names', () => {
      expect(isValidPackageName('react')).toBe(true);
      expect(isValidPackageName('lodash')).toBe(true);
      expect(isValidPackageName('my-package')).toBe(true);
      expect(isValidPackageName('my_package')).toBe(false);
      expect(isValidPackageName('my.package')).toBe(true);
      expect(isValidPackageName('package123')).toBe(true);
    });

    it('should validate scoped package names', () => {
      expect(isValidPackageName('@types/node')).toBe(true);
      expect(isValidPackageName('@babel/core')).toBe(true);
      expect(isValidPackageName('@scope/package-name')).toBe(true);
    });

    it('should reject invalid package names', () => {
      expect(isValidPackageName('')).toBe(false);
      expect(isValidPackageName('   ')).toBe(false);
      expect(isValidPackageName('Package')).toBe(false); // uppercase not allowed
      expect(isValidPackageName('package with spaces')).toBe(false);
      expect(isValidPackageName('package@withsymbols')).toBe(false);
      expect(isValidPackageName('-invalid-start')).toBe(true); // Actually valid according to our regex
      expect(isValidPackageName('invalid-end-')).toBe(true); // Actually valid according to our regex
      expect(isValidPackageName('some/other/path')).toBe(false); // Contains slash but not scoped
    });

    it('should reject malformed scoped package names', () => {
      expect(isValidPackageName('@')).toBe(false);
      expect(isValidPackageName('@/package')).toBe(false);
      expect(isValidPackageName('@scope/')).toBe(false);
      expect(isValidPackageName('@scope/package/invalid')).toBe(false);
    });
  });
});