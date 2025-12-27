import { promises as fs } from 'fs';
import * as crypto from 'crypto';
import { BackupInfo } from '../managers/types.js';

/**
 * Backup and restore utilities for package files
 */
export class BackupManager {
  /**
   * Create a backup of package.json and package-lock.json
   */
  static async createBackup(): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = `.depsver-backup-${timestamp}`;
    
    try {
      // Create backup directory
      await fs.mkdir(backupDir, { recursive: true });
      
      // Backup package.json
      const packageJsonExists = await this.fileExists('package.json');
      if (packageJsonExists) {
        const packageJsonContent = await fs.readFile('package.json', 'utf-8');
        await fs.writeFile(`${backupDir}/package.json`, packageJsonContent);
      }
      
      // Backup package-lock.json
      const packageLockExists = await this.fileExists('package-lock.json');
      if (packageLockExists) {
        const packageLockContent = await fs.readFile('package-lock.json', 'utf-8');
        await fs.writeFile(`${backupDir}/package-lock.json`, packageLockContent);
      }
      
      // Create backup metadata
      const metadata = await this.generateBackupMetadata(packageJsonExists, packageLockExists);
      await fs.writeFile(`${backupDir}/backup-info.json`, JSON.stringify(metadata, null, 2));
      
      return backupDir;
    } catch (error) {
      throw new Error(`Failed to create backup: ${error}`);
    }
  }

  /**
   * Restore from a backup directory
   */
  static async restoreBackup(backupPath: string): Promise<void> {
    try {
      // Validate backup directory
      await this.validateBackup(backupPath);
      
      // Restore package.json if it exists in backup
      const packageJsonBackup = `${backupPath}/package.json`;
      if (await this.fileExists(packageJsonBackup)) {
        const packageJsonContent = await fs.readFile(packageJsonBackup, 'utf-8');
        await fs.writeFile('package.json', packageJsonContent);
      }
      
      // Restore package-lock.json if it exists in backup
      const packageLockBackup = `${backupPath}/package-lock.json`;
      if (await this.fileExists(packageLockBackup)) {
        const packageLockContent = await fs.readFile(packageLockBackup, 'utf-8');
        await fs.writeFile('package-lock.json', packageLockContent);
      }
      
    } catch (error) {
      throw new Error(`Failed to restore backup: ${error}`);
    }
  }

  /**
   * List all available backups
   */
  static async listBackups(): Promise<BackupInfo[]> {
    try {
      const files = await fs.readdir('.');
      const backupDirs = files.filter(file => file.startsWith('.depsver-backup-'));
      
      const backups: BackupInfo[] = [];
      
      for (const dir of backupDirs) {
        try {
          const metadataPath = `${dir}/backup-info.json`;
          if (await this.fileExists(metadataPath)) {
            const metadataContent = await fs.readFile(metadataPath, 'utf-8');
            const metadata = JSON.parse(metadataContent);
            backups.push({
              path: dir,
              timestamp: new Date(metadata.timestamp),
              packageJsonHash: metadata.packageJsonHash,
              packageLockHash: metadata.packageLockHash
            });
          }
        } catch (error) {
          // Skip invalid backups
          continue;
        }
      }
      
      // Sort by timestamp (newest first)
      return backups.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      
    } catch (error) {
      throw new Error(`Failed to list backups: ${error}`);
    }
  }

  /**
   * Clean up old backups (keep only the most recent N)
   */
  static async cleanupBackups(keepCount: number = 5): Promise<void> {
    try {
      const backups = await this.listBackups();
      
      if (backups.length <= keepCount) {
        return;
      }
      
      // Remove oldest backups
      const toRemove = backups.slice(keepCount);
      
      for (const backup of toRemove) {
        await fs.rm(backup.path, { recursive: true, force: true });
      }
      
    } catch (error) {
      throw new Error(`Failed to cleanup backups: ${error}`);
    }
  }

  /**
   * Validate backup integrity
   */
  static async validateBackup(backupPath: string): Promise<boolean> {
    try {
      // Check if backup directory exists
      if (!(await this.fileExists(backupPath))) {
        return false;
      }
      
      // Check metadata file
      const metadataPath = `${backupPath}/backup-info.json`;
      if (!(await this.fileExists(metadataPath))) {
        return false;
      }
      
      // Validate metadata
      const metadataContent = await fs.readFile(metadataPath, 'utf-8');
      const metadata = JSON.parse(metadataContent);
      
      // Check if at least one package file exists
      const hasPackageJson = await this.fileExists(`${backupPath}/package.json`);
      const hasPackageLock = await this.fileExists(`${backupPath}/package-lock.json`);
      
      return hasPackageJson || hasPackageLock;
      
    } catch (error) {
      return false;
    }
  }

  /**
   * Get backup information
   */
  static async getBackupInfo(backupPath: string): Promise<BackupInfo | null> {
    try {
      if (!(await this.validateBackup(backupPath))) {
        return null;
      }
      
      const metadataPath = `${backupPath}/backup-info.json`;
      const metadataContent = await fs.readFile(metadataPath, 'utf-8');
      const metadata = JSON.parse(metadataContent);
      
      return {
        path: backupPath,
        timestamp: new Date(metadata.timestamp),
        packageJsonHash: metadata.packageJsonHash,
        packageLockHash: metadata.packageLockHash
      };
      
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if current files match backup (detect if changes were made)
   */
  static async hasChangesSinceBackup(backupPath: string): Promise<boolean> {
    try {
      const backupInfo = await this.getBackupInfo(backupPath);
      if (!backupInfo) {
        return true; // Assume changes if backup is invalid
      }
      
      // Check package.json
      if (await this.fileExists('package.json')) {
        const currentPackageJsonHash = await this.calculateFileHash('package.json');
        if (currentPackageJsonHash !== backupInfo.packageJsonHash) {
          return true;
        }
      }
      
      // Check package-lock.json
      if (await this.fileExists('package-lock.json')) {
        const currentPackageLockHash = await this.calculateFileHash('package-lock.json');
        if (currentPackageLockHash !== backupInfo.packageLockHash) {
          return true;
        }
      }
      
      return false;
      
    } catch (error) {
      return true; // Assume changes if we can't verify
    }
  }

  /**
   * Generate backup metadata
   */
  private static async generateBackupMetadata(
    hasPackageJson: boolean,
    hasPackageLock: boolean
  ): Promise<any> {
    const metadata: any = {
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      tool: 'depsver'
    };
    
    if (hasPackageJson) {
      metadata.packageJsonHash = await this.calculateFileHash('package.json');
    }
    
    if (hasPackageLock) {
      metadata.packageLockHash = await this.calculateFileHash('package-lock.json');
    }
    
    return metadata;
  }

  /**
   * Calculate SHA256 hash of a file
   */
  private static async calculateFileHash(filePath: string): Promise<string> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return crypto.createHash('sha256').update(content).digest('hex');
    } catch (error) {
      return '';
    }
  }

  /**
   * Check if a file exists
   */
  private static async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Backup cleanup scheduler
 */
export class BackupScheduler {
  private static instance: BackupScheduler;
  private cleanupInterval: NodeJS.Timeout | null = null;

  static getInstance(): BackupScheduler {
    if (!BackupScheduler.instance) {
      BackupScheduler.instance = new BackupScheduler();
    }
    return BackupScheduler.instance;
  }

  /**
   * Start automatic cleanup (runs daily)
   */
  startAutoCleanup(keepCount: number = 5): void {
    // Stop existing cleanup if running
    this.stopAutoCleanup();
    
    // Run cleanup every 24 hours
    this.cleanupInterval = setInterval(async () => {
      try {
        await BackupManager.cleanupBackups(keepCount);
      } catch (error) {
        // Log error but don't stop the scheduler
        console.error('Auto cleanup failed:', error);
      }
    }, 24 * 60 * 60 * 1000); // 24 hours
  }

  /**
   * Stop automatic cleanup
   */
  stopAutoCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}
