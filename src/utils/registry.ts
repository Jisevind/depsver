/**
 * Registry utility for fetching latest package versions from npm registry
 */

interface NpmPackageInfo {
  version: string;
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
  
  // Process packages concurrently with a reasonable limit to avoid overwhelming the registry
  const concurrencyLimit = 5;
  const chunks = [];
  
  for (let i = 0; i < packageNames.length; i += concurrencyLimit) {
    chunks.push(packageNames.slice(i, i + concurrencyLimit));
  }
  
  for (const chunk of chunks) {
    const promises = chunk.map(async (packageName) => {
      // Wrap the fetch logic to ensure onIncrement is called
      return (async () => {
        try {
          const response = await fetch(`https://registry.npmjs.org/${packageName}/latest`);
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          const data = await response.json() as NpmPackageInfo;
          
          if (!data.version) {
            throw new Error('No version found in response');
          }
          
          return { packageName, version: data.version };
        } catch (error) {
          console.warn(`Failed to fetch latest version for ${packageName}:`, error);
          // Return null for failed fetches - caller can decide how to handle
          return { packageName, version: 'unknown' };
        }
      })().finally(() => {
        // This is the key: call onIncrement after each promise settles
        onIncrement?.(packageName);
      });
    });
    
    const results = await Promise.all(promises);
    
    // Populate the map with successful results
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
    const response = await fetch(`https://registry.npmjs.org/${packageName}/latest`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json() as NpmPackageInfo;
    
    return data.version || null;
  } catch (error) {
    console.warn(`Failed to fetch latest version for ${packageName}:`, error);
    return null;
  }
}