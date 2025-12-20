/**
 * Registry utility for fetching latest package versions from npm registry
 */

import { NetworkError, wrapError } from './errors.js';

interface NpmPackageInfo {
  version: string;
}

// Simple in-memory cache for package versions
const versionCache = new Map<string, { version: string; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetches the latest version of a single npm package with retry logic
 * @param packageName - Name of the package to fetch
 * @param maxRetries - Maximum number of retry attempts
 * @param retryDelay - Initial delay between retries in ms
 * @returns Promise<{ packageName: string; version: string }> - Package info
 */
async function fetchLatestVersionWithRetry(
  packageName: string,
  maxRetries: number = 3,
  retryDelay: number = 1000
): Promise<{ packageName: string; version: string }> {
  let lastError: Error | null = null;
  
  // Validate package name before making any requests
  if (!packageName || packageName.trim() === '') {
    console.warn(`Invalid package name: "${packageName}". Package name cannot be empty.`);
    return { packageName, version: 'unknown' };
  }
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Check cache first
      const cached = versionCache.get(packageName);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return { packageName, version: cached.version };
      }
      
      // Add timeout to prevent hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await fetch(`https://registry.npmjs.org/${packageName}/latest`, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json() as NpmPackageInfo;
      
      if (!data.version) {
        throw new Error('No version found in response');
      }
      
      // Cache the result
      versionCache.set(packageName, {
        version: data.version,
        timestamp: Date.now()
      });
      
      return { packageName, version: data.version };
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry on client errors (4xx) or invalid package names
      if (error instanceof Error && (error.message.includes('HTTP 4') || error.message.includes('Invalid package name'))) {
        break;
      }
      
      // If this is not the last attempt, wait before retrying
      if (attempt < maxRetries) {
        // Exponential backoff with jitter
        const delay = retryDelay * Math.pow(2, attempt) + Math.random() * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  console.warn(`Failed to fetch latest version for "${packageName}" after ${maxRetries + 1} attempts:`, lastError);
  return { packageName, version: 'unknown' };
}

/**
 * Fetches the latest version of multiple npm packages from the registry
 * @param packageNames - Array of package names to fetch latest versions for
 * @param onIncrement - Optional callback to report progress after each package fetch
 * @returns Promise<Map<string, string>> - Map with package name as key and latest version as value
 */
export async function fetchLatestVersions(
  packageNames: string[],
  onIncrement?: (payload: string) => void
): Promise<Map<string, string>> {
  const versionMap = new Map<string, string>();
  
  // Adaptive concurrency limit based on the number of packages
  // More packages = higher concurrency, but with a reasonable upper bound
  const concurrencyLimit = Math.min(Math.max(Math.ceil(packageNames.length / 10), 3), 15);
  const chunks = [];
  
  for (let i = 0; i < packageNames.length; i += concurrencyLimit) {
    chunks.push(packageNames.slice(i, i + concurrencyLimit));
  }
  
  for (const chunk of chunks) {
    const promises = chunk.map(async (packageName) => {
      try {
        const result = await fetchLatestVersionWithRetry(packageName);
        return result;
      } finally {
        // Call onIncrement after each promise settles (success or failure)
        onIncrement?.(packageName);
      }
    });
    
    const results = await Promise.all(promises);
    
    // Populate the map with results
    results.forEach(({ packageName, version }) => {
      versionMap.set(packageName, version);
    });
  }
  
  return versionMap;
}

/**
 * Fetches the latest version of a single npm package from the registry
 * @param packageName - Name of the package to fetch
 * @returns Promise<string | null> - Latest version string or null if fetch failed
 */
export async function fetchLatestVersion(packageName: string): Promise<string | null> {
  try {
    const result = await fetchLatestVersionWithRetry(packageName);
    return result.version === 'unknown' ? null : result.version;
  } catch (error) {
    throw wrapError(error, `Failed to fetch latest version for ${packageName}`) as NetworkError;
  }
}

/**
 * Clears the version cache - useful for testing or forcing fresh data
 */
export function clearVersionCache(): void {
  versionCache.clear();
}

/**
 * Gets cache statistics for debugging purposes
 */
export function getCacheStats(): { size: number; ttl: number } {
  return {
    size: versionCache.size,
    ttl: CACHE_TTL_MS
  };
}