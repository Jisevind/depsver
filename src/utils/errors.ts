/**
 * Custom error classes for better error handling and user feedback
 */

/**
 * Base error class for all Depsver errors
 */
export abstract class DepsverError extends Error {
  abstract readonly code: string;
  abstract readonly suggestions: string[];
  
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

/**
 * Error thrown when no valid npm project is found
 */
export class InvalidProjectError extends DepsverError {
  readonly code = 'INVALID_PROJECT';
  readonly suggestions = [
    'Make sure you are running this command in an npm project directory',
    'Ensure both package.json and package-lock.json files exist',
    'Run "npm install" to generate package-lock.json if missing'
  ];
  
  constructor(directory: string) {
    super(`No valid npm project found in: ${directory}`);
  }
}

/**
 * Error thrown when package.json is malformed
 */
export class MalformedPackageJsonError extends DepsverError {
  readonly code = 'MALFORMED_PACKAGE_JSON';
  readonly suggestions = [
    'Check if your package.json file has valid JSON syntax',
    'Try running "npm install" to fix potential issues',
    'Validate your package.json using an online JSON validator'
  ];
  
  constructor(cause?: string) {
    const message = cause 
      ? `Invalid package.json format: ${cause}`
      : 'Invalid package.json format';
    super(message);
  }
}

/**
 * Error thrown when package-lock.json is malformed
 */
export class MalformedPackageLockError extends DepsverError {
  readonly code = 'MALFORMED_PACKAGE_LOCK';
  readonly suggestions = [
    'Check if your package-lock.json file has valid JSON syntax',
    'Try running "npm install" to regenerate package-lock.json',
    'Delete package-lock.json and run "npm install" to create a fresh one'
  ];
  
  constructor(cause?: string) {
    const message = cause 
      ? `Invalid package-lock.json format: ${cause}`
      : 'Invalid package-lock.json format';
    super(message);
  }
}

/**
 * Error thrown when network operations fail
 */
export class NetworkError extends DepsverError {
  readonly code = 'NETWORK_ERROR';
  readonly suggestions = [
    'Check your internet connection',
    'Try running the command again',
    'If behind a corporate firewall, ensure npm registry is accessible',
    'Consider using a different npm registry with "npm config set registry"'
  ];
  
  constructor(message: string) {
    super(`Network error: ${message}`);
  }
}

/**
 * Error thrown when file system operations fail
 */
export class FileSystemError extends DepsverError {
  readonly code = 'FILESYSTEM_ERROR';
  readonly suggestions = [
    'Check if you have read permissions for the project directory',
    'Ensure the directory path is correct',
    'Check if the disk has sufficient space'
  ];
  
  constructor(operation: string, path: string, cause?: string) {
    const message = cause 
      ? `Failed to ${operation} ${path}: ${cause}`
      : `Failed to ${operation} ${path}`;
    super(message);
  }
}

/**
 * Error thrown when clipboard operations fail
 */
export class ClipboardError extends DepsverError {
  readonly code = 'CLIPBOARD_ERROR';
  readonly suggestions = [
    'Try using the --output option to save to a file instead',
    'Ensure no other application is blocking clipboard access',
    'On Linux, you may need to install xclip or xsel'
  ];
  
  constructor(cause?: string) {
    const message = cause 
      ? `Failed to access clipboard: ${cause}`
      : 'Failed to access clipboard';
    super(message);
  }
}

/**
 * Error thrown for unexpected internal errors
 */
export class InternalError extends DepsverError {
  readonly code = 'INTERNAL_ERROR';
  readonly suggestions = [
    'Please report this issue at: https://github.com/your-repo/depsver/issues',
    'Include the error message and steps to reproduce',
    'Try running with --verbose flag for more details'
  ];
  
  constructor(message: string, public readonly cause?: Error) {
    super(`Internal error: ${message}`);
  }
}

/**
 * Utility function to format and display errors to users
 */
export function formatError(error: unknown): string {
  if (error instanceof DepsverError) {
    let output = `\n❌ Error: ${error.message}\n`;
    output += `   Code: ${error.code}\n`;
    
    if (error.suggestions.length > 0) {
      output += `\n💡 Suggestions:\n`;
      error.suggestions.forEach(suggestion => {
        output += `   • ${suggestion}\n`;
      });
    }
    
    return output;
  }
  
  // Handle unknown errors
  let message = 'An unexpected error occurred';
  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === 'string') {
    message = error;
  }
  
  return `\n❌ Unexpected error: ${message}\n💡 Please report this issue if it persists.\n`;
}

/**
 * Utility function to wrap errors with context
 */
export function wrapError(error: unknown, context: string): DepsverError {
  if (error instanceof DepsverError) {
    return error;
  }
  
  if (error instanceof Error) {
    return new InternalError(`${context}: ${error.message}`, error);
  }
  
  return new InternalError(`${context}: ${String(error)}`);
}