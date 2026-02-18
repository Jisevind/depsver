import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

let packageVersion: string | null = null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function getPackageVersion(): string {
    if (packageVersion) {
        return packageVersion;
    }

    try {
        // Try to find package.json in the current directory or parent directories
        const currentDir = __dirname;

        // Check if we are in src (dev) or dist/src (prod)
        let packageJsonPath = join(currentDir, '..', '..', 'package.json');

        try {
            const content = readFileSync(packageJsonPath, 'utf-8');
            const pkg = JSON.parse(content);
            packageVersion = pkg.version;
            return pkg.version;
        } catch (e) {
            // Try one level up (if running from dist)
            packageJsonPath = join(currentDir, '..', '..', '..', 'package.json');
            const content = readFileSync(packageJsonPath, 'utf-8');
            const pkg = JSON.parse(content);
            packageVersion = pkg.version;
            return pkg.version;
        }

    } catch (error) {
        // Fallback if file reading fails
        return '0.0.0';
    }
}
