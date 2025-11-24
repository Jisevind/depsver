import { NpmManager } from '../../src/managers/NpmManager.js';
import { fetchLatestVersions } from '../../src/utils/registry.js';

// Mock the registry module
vi.mock('../../src/utils/registry.js');

const mockFetchLatestVersions = vi.mocked(fetchLatestVersions);

describe('NpmManager.analyze', () => {
  let manager: NpmManager;
  let mockReadFile: ReturnType<typeof vi.fn>;
  let mockFs: { access: ReturnType<typeof vi.fn>, readFile: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    // Reset mocks before each test
    vi.resetAllMocks();
    
    // Create mock fs module
    mockReadFile = vi.fn();
    mockFs = {
      access: vi.fn().mockResolvedValue(undefined),
      readFile: mockReadFile
    };
    
    // Create manager with mocked fs
    manager = new NpmManager(mockFs as any);
  });

  it('should analyze dependencies correctly', async () => {
    // Mock package.json content
    const packageJsonContent = JSON.stringify({
      dependencies: {
        "react": "^18.0.0",
        "lodash": "^4.1.0"
      },
      devDependencies: {
        "typescript": "^5.0.0"
      }
    });
    
    // Mock package-lock.json content with blocker scenario
    const packageLockContent = JSON.stringify({
      packages: {
        "": {
          name: "test-project",
          version: "1.0.0"
        },
        "node_modules/react": {
          version: "18.2.0",
          dependencies: {
            "loose-envify": "^1.1.0"
          }
        },
        "node_modules/old-ui-kit": {
          version: "2.0.0",
          dependencies: {
            "react": "^17.0.0"  // This blocks react from updating to 18.x
          }
        },
        "node_modules/lodash": {
          version: "4.1.0"
        },
        "node_modules/typescript": {
          version: "5.3.3"
        },
        "node_modules/loose-envify": {
          version: "1.4.0"
        }
      }
    });
    
    // Mock file reading
    mockReadFile.mockImplementation((path: string) => {
      if (path.includes('package.json')) {
        return Promise.resolve(packageJsonContent);
      }
      if (path.includes('package-lock.json')) {
        return Promise.resolve(packageLockContent);
      }
      return Promise.reject(new Error('File not found'));
    });
    
    // Mock fetchLatestVersions with specific scenarios
    mockFetchLatestVersions.mockResolvedValue(new Map([
      ['react', '18.3.0'],           // Major version same (18.x), but blocked by old-ui-kit requiring ^17.0.0
      ['lodash', '5.0.0'],           // Major jump from 4.x to 5.x
      ['typescript', '5.4.5'],       // Minor update, already at latest
      ['loose-envify', '1.6.0'],     // Safe minor/patch update
      ['old-ui-kit', '2.1.0']        // Not requested in package.json
    ]));
    
    const result = await manager.analyze('.');
    
    // Verify the structure
    expect(result).toHaveProperty('safe');
    expect(result).toHaveProperty('blocked');
    expect(result).toHaveProperty('majorJump');
    expect(result).toHaveProperty('allDependencies');
    
    // Verify allDependencies - now only top-level dependencies
    expect(result.allDependencies).toHaveLength(3);
    
    // Check specific dependencies
    const reactDep = result.allDependencies.find(dep => dep.name === 'react');
    expect(reactDep).toBeDefined();
    expect(reactDep?.requested).toBe('^18.0.0');
    expect(reactDep?.resolved).toBe('18.2.0');
    expect(reactDep?.latest).toBe('18.3.0');
    expect(reactDep?.dependencies).toEqual({ 'loose-envify': '^1.1.0' });
    expect(reactDep?.peerDependencies).toEqual({});
    
    const lodashDep = result.allDependencies.find(dep => dep.name === 'lodash');
    expect(lodashDep).toBeDefined();
    expect(lodashDep?.requested).toBe('^4.1.0');
    expect(lodashDep?.resolved).toBe('4.1.0');
    expect(lodashDep?.latest).toBe('5.0.0');
    expect(lodashDep?.dependencies).toEqual({});
    expect(lodashDep?.peerDependencies).toEqual({});
    
    const typescriptDep = result.allDependencies.find(dep => dep.name === 'typescript');
    expect(typescriptDep).toBeDefined();
    expect(typescriptDep?.requested).toBe('^5.0.0');
    expect(typescriptDep?.resolved).toBe('5.3.3');
    expect(typescriptDep?.latest).toBe('5.4.5');
    expect(typescriptDep?.dependencies).toEqual({});
    expect(typescriptDep?.peerDependencies).toEqual({});
    
    // NEW: Verify classification logic - only top-level dependencies are analyzed
    expect(result.blocked).toHaveLength(1);
    const blockedReact = result.blocked.find(dep => dep.name === 'react');
    expect(blockedReact).toBeDefined();
    expect(blockedReact?.blocker).toBe('old-ui-kit');
    
    expect(result.majorJump).toHaveLength(1);
    const majorJumpLodash = result.majorJump.find(dep => dep.name === 'lodash');
    expect(majorJumpLodash).toBeDefined();
    
    expect(result.safe).toHaveLength(1);
    const safeTypescript = result.safe.find(dep => dep.name === 'typescript');
    expect(safeTypescript).toBeDefined();
  });

  it('should handle scoped packages correctly', async () => {
    // Mock package.json content
    const packageJsonContent = JSON.stringify({
      dependencies: {
        "@types/node": "^20.0.0"
      }
    });
    
    // Mock package-lock.json content
    const packageLockContent = JSON.stringify({
      packages: {
        "": {
          name: "test-project",
          version: "1.0.0"
        },
        "node_modules/@types/node": {
          version: "20.10.5"
        }
      }
    });
    
    // Mock file reading
    mockReadFile.mockImplementation((path: string) => {
      if (path.includes('package.json')) {
        return Promise.resolve(packageJsonContent);
      }
      if (path.includes('package-lock.json')) {
        return Promise.resolve(packageLockContent);
      }
      return Promise.reject(new Error('File not found'));
    });
    
    // Mock fetchLatestVersions
    mockFetchLatestVersions.mockResolvedValue(new Map([
      ['@types/node', '20.19.24']
    ]));
    
    const result = await manager.analyze('.');
    
    expect(result.allDependencies).toHaveLength(1);
    
    const nodeTypesDep = result.allDependencies.find(dep => dep.name === '@types/node');
    expect(nodeTypesDep).toBeDefined();
    expect(nodeTypesDep?.requested).toBe('^20.0.0');
    expect(nodeTypesDep?.resolved).toBe('20.10.5');
    expect(nodeTypesDep?.latest).toBe('20.19.24');
    expect(nodeTypesDep?.dependencies).toEqual({});
    expect(nodeTypesDep?.peerDependencies).toEqual({});
  });

  it('should detect blockers from peer dependencies', async () => {
    // Mock package.json content
    const packageJsonContent = JSON.stringify({
      dependencies: {
        "onnxruntime-web": "1.21.0",
        "@imgly/background-removal": "^1.7.0"
      }
    });
    
    // Mock package-lock.json content with peer dependency scenario
    const packageLockContent = JSON.stringify({
      packages: {
        "": {
          name: "test-project",
          version: "1.0.0"
        },
        "node_modules/onnxruntime-web": {
          version: "1.21.0"
        },
        "node_modules/@imgly/background-removal": {
          version: "1.7.0",
          peerDependencies: {
            "onnxruntime-web": "1.21.0"
          }
        }
      }
    });
    
    // Mock file reading
    mockReadFile.mockImplementation((path: string) => {
      if (path.includes('package.json')) {
        return Promise.resolve(packageJsonContent);
      }
      if (path.includes('package-lock.json')) {
        return Promise.resolve(packageLockContent);
      }
      return Promise.reject(new Error('File not found'));
    });
    
    // Mock fetchLatestVersions - onnxruntime-web has newer version available
    mockFetchLatestVersions.mockResolvedValue(new Map([
      ['onnxruntime-web', '1.23.2'],      // Newer version available
      ['@imgly/background-removal', '1.7.1']
    ]));
    
    const result = await manager.analyze('.');
    
    // Verify that onnxruntime-web is blocked by @imgly/background-removal's peer dependency
    expect(result.blocked).toHaveLength(1);
    const blockedOnnx = result.blocked.find(dep => dep.name === 'onnxruntime-web');
    expect(blockedOnnx).toBeDefined();
    expect(blockedOnnx?.blocker).toBe('@imgly/background-removal');
    expect(blockedOnnx?.resolved).toBe('1.21.0');
    expect(blockedOnnx?.latest).toBe('1.23.2');
    
    // Verify peer dependencies are captured
    const imglyDep = result.allDependencies.find(dep => dep.name === '@imgly/background-removal');
    expect(imglyDep).toBeDefined();
    expect(imglyDep?.peerDependencies).toEqual({ 'onnxruntime-web': '1.21.0' });
  });
});