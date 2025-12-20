import { fetchLatestVersions, fetchLatestVersion, clearVersionCache } from '../../src/utils/registry.js';

// Mock fetch at the global level
const mockFetch = vi.fn();

describe('fetchLatestVersions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Set up global fetch mock
    global.fetch = mockFetch;
    // Clear cache between tests
    clearVersionCache();
  });

  afterEach(() => {
    // Clean up global fetch
    delete (global as any).fetch;
  });

  it('should fetch and return latest versions for multiple packages', async () => {
    mockFetch.mockImplementation((url: string, options?: any) => {
      let pkgData = {};
      if (url.includes('react')) {
        pkgData = { version: '18.0.0' };
      } else if (url.includes('vitest')) {
        pkgData = { version: '1.0.0' };
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(pkgData),
      });
    });

    const packages = ['react', 'vitest'];
    const versions = await fetchLatestVersions(packages);

    expect(versions.get('react')).toBe('18.0.0');
    expect(versions.get('vitest')).toBe('1.0.0');
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenCalledWith('https://registry.npmjs.org/react/latest', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(mockFetch).toHaveBeenCalledWith('https://registry.npmjs.org/vitest/latest', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('should handle failed fetches gracefully and return "unknown"', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    const packages = ['non-existent-package'];
    const versions = await fetchLatestVersions(packages);

    expect(versions.get('non-existent-package')).toBe('unknown');
    // Should retry 3 times for 404 errors (client errors don't retry, but we still check once)
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should handle packages with missing version data', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}), // No version property
    });

    const packages = ['package-without-version'];
    const versions = await fetchLatestVersions(packages);

    expect(versions.get('package-without-version')).toBe('unknown');
    // Should retry 3 times for missing version data
    expect(mockFetch).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
  });
});

describe('fetchLatestVersion', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Set up global fetch mock
    global.fetch = mockFetch;
    // Clear cache between tests
    clearVersionCache();
  });

  afterEach(() => {
    // Clean up global fetch
    delete (global as any).fetch;
  });

  it('should return version string on success', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '1.2.3' }),
    });

    const version = await fetchLatestVersion('my-package');

    expect(version).toBe('1.2.3');
    expect(mockFetch).toHaveBeenCalledWith('https://registry.npmjs.org/my-package/latest', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('should return null on failure', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    const version = await fetchLatestVersion('bad-package');

    expect(version).toBeNull();
  });

  it('should return null when version is missing in response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}), // No version property
    });

    const version = await fetchLatestVersion('package-without-version');

    expect(version).toBeNull();
  });
});