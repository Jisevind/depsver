import { NpmManager } from '../../src/managers/NpmManager.js';

describe('NpmManager', () => {
  let manager: NpmManager;
  let mockAccess: ReturnType<typeof vi.fn>;
  let mockFs: { access: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    // Reset mocks before each test
    vi.resetAllMocks();
    
    // Create mock fs module
    mockAccess = vi.fn();
    mockFs = { access: mockAccess };
    
    // Create manager with mocked fs
    manager = new NpmManager(mockFs as any);
  });

  it('should detect successfully if package.json and package-lock.json exist', async () => {
    // Simulate 'fs.access' resolving successfully (files exist)
    mockAccess.mockResolvedValue(undefined);

    const result = await manager.detect('.');

    expect(result).toBe(true);
    // Expect 'access' to have been called twice
    expect(mockAccess).toHaveBeenCalledTimes(2);
    expect(mockAccess).toHaveBeenCalledWith('./package.json');
    expect(mockAccess).toHaveBeenCalledWith('./package-lock.json');
  });

  it('should fail detection if package.json is missing', async () => {
    // Simulate 'fs.access' for package.json rejecting (file doesn't exist)
    mockAccess.mockImplementation((path: string) => {
      if (path === './package.json') {
        return Promise.reject(new Error('File not found'));
      }
      return Promise.resolve(undefined);
    });

    const result = await manager.detect('.');

    expect(result).toBe(false);
    // It should stop checking after the first failure
    expect(mockAccess).toHaveBeenCalledTimes(1);
  });

  it('should fail detection if package-lock.json is missing', async () => {
    // Simulate 'fs.access' for package-lock.json rejecting
    mockAccess.mockImplementation((path: string) => {
      if (path === './package-lock.json') {
        return Promise.reject(new Error('File not found'));
      }
      return Promise.resolve(undefined);
    });

    const result = await manager.detect('.');

    expect(result).toBe(false);
    // It should check package.json (success) then fail on package-lock.json
    expect(mockAccess).toHaveBeenCalledTimes(2);
  });
});