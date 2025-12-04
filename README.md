# Depsver

> **⚠️ Disclaimer**: This tool provides guidance and analysis for dependency management, but all dependency updates should be thoroughly tested in your specific environment before applying to production. Always review breaking changes and test updates in a development environment first.

A TypeScript CLI tool for analyzing project dependencies and generating AI-ready reports. This tool helps you understand your project's dependency landscape by analyzing package.json and package-lock.json files, checking for outdated packages, and identifying potential upgrade blockers with comprehensive error handling and performance optimizations.

**Current Version: 1.0.0** - Now available as a stable CLI tool with executable `depsver` command.

## Features

- **Dependency Analysis**: Analyzes your npm project's dependencies and their current versions
- **Upgrade Classification**: Categorizes dependencies into safe upgrades, blocked upgrades, and major version jumps
- **Blocker Detection**: Identifies which packages are preventing other packages from being upgraded using optimized O(n + m) algorithms
- **Progress Tracking**: Shows real-time progress when fetching latest versions from the npm registry
- **Multiple Output Formats**: Supports console output, file output, and clipboard copying
- **AI-Ready Reports**: Generates markdown reports optimized for AI assistants and code review tools
- **Comprehensive Error Handling**: Provides detailed error messages with actionable suggestions for common issues
- **Performance Optimizations**: Features caching, retry logic, and concurrent processing for faster analysis
- **Type Safety**: Full TypeScript support with proper interfaces for package-lock.json parsing

## Installation

### Global Installation

```bash
npm install -g depsver
```

### Local Installation

```bash
npm install --save-dev depsver
```

### Build from Source

```bash
git clone <repository-url>
cd depsver
npm install
npm run build
```

## Usage

### Basic Usage

Analyze the current directory:

```bash
depsver
```

Analyze a specific directory:

```bash
depsver /path/to/your/project
```

**Note**: The `depsver` command is available after global installation (`npm install -g depsver`) or can be run with `npx depsver` for one-time use.

### Output Options

Save report to a file:

```bash
depsver -o dependency-report.md
```

Copy report to clipboard:

```bash
depsver --clip
```

### Help

```bash
depsver --help
```

## Report Sections

The generated report includes four main sections:

### 1. Actionable Insights
- **Safe to Upgrade**: Dependencies that can be safely updated to newer versions
- **Blocked Upgrades**: Dependencies that cannot be upgraded due to other packages' version constraints
- **Major Version Jumps**: Dependencies requiring major version updates (review recommended)

### 2. Project Dependencies
Lists all dependencies from your package.json file with their requested versions.

### 3. Resolved Dependency Graph
Shows the actual installed versions from package-lock.json and their dependency relationships.

### 4. Registry Status
Displays the latest available versions from the npm registry for comparison.

## Example Output

```markdown
## 📦 Dependency Analysis Report

### 1. Actionable Insights

* **✅ Safe to Upgrade:**
    * `lodash`: (4.17.20 → 4.17.21)
    * `express`: (4.18.1 → 4.18.2)

* **⚠️ Blocked Upgrades:**
    * `react` (Latest: 18.2.0) is **blocked** by `react-dom` (requires `react@^16.14.0`).

* **⬆️ Major Version Jumps (Review Required):**
    * `typescript`: (4.5.4 → 5.0.0) - Review breaking changes.

### 2. Project Dependencies (from package.json)
* express: "^4.18.1"
* lodash: "^4.17.20"
* react: "^16.14.0"
* react-dom: "^16.14.0"
* typescript: "^4.5.4"

### 3. Resolved Dependency Graph (from package-lock.json)
* **express**: 4.18.1
    * Depends on: `accepts@~1.3.8`, `array-flatten@1.1.1`, `body-parser@1.20.0`, ...

### 4. Registry Status (Latest Versions)
* **express**: 4.18.2
* **lodash**: 4.17.21
* **react**: 18.2.0
* **react-dom**: 18.2.0
* **typescript**: 5.0.0
```

## How It Works

1. **Detection**: Verifies that the target directory contains both `package.json` and `package-lock.json` files
2. **Analysis**: Parses both files to understand the dependency structure
3. **Version Checking**: Fetches the latest versions from the npm registry (with progress tracking)
4. **Classification**: Categorizes each dependency based on upgrade safety and potential blockers
5. **Reporting**: Generates a comprehensive markdown report with actionable insights

## Blocker Detection Algorithm

The tool identifies upgrade blockers by:

1. Checking each dependency's latest version against its current version
2. Examining all other packages in the dependency graph
3. Finding packages that have version constraints on the dependency being checked
4. Determining if the latest version satisfies those constraints
5. Flagging dependencies as "blocked" when constraints prevent upgrades

## Development

### Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm run test` - Run tests with Vitest
- `npm run dev` - Run in development mode with ts-node

### Project Structure

```
src/
├── cli.ts              # CLI entry point and command handling
├── managers/
│   ├── NpmManager.ts   # npm-specific dependency analysis
│   └── types.ts        # Type definitions for dependency managers
└── utils/
    ├── errors.ts       # Custom error classes and error handling
    ├── formatter.ts    # Report formatting utilities
    └── registry.ts     # npm registry API utilities with caching

test/
├── basic.test.ts       # Basic test suite
├── managers/           # Manager-specific tests
└── utils/              # Utility function tests
```

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run the test suite
6. Submit a pull request

## Requirements

- Node.js 16+ (ES modules support required)
- npm project with `package.json` and `package-lock.json` files
- Internet connection for fetching latest versions from npm registry

## License

MIT

## Troubleshooting

### Enhanced Error Handling
Depsver now provides comprehensive error handling with actionable suggestions for common issues:

- **Invalid Project Error**: Ensures you're in a valid npm project directory
- **Malformed package.json/package-lock.json**: Provides specific guidance for JSON syntax issues
- **Network Errors**: Offers troubleshooting steps for connectivity and firewall issues
- **Clipboard Errors**: Suggests alternatives when clipboard access fails
- **File System Errors**: Helps resolve permission and path issues

### "No package-lock.json found" Error
Ensure you're running the command in a directory that contains both `package.json` and `package-lock.json` files. If you don't have a lockfile, run `npm install` to generate one.

### Network Errors
The tool requires internet access to fetch the latest versions from the npm registry. Check your network connection if you see timeout or connection errors. The tool now includes automatic retry logic with exponential backoff for better reliability.

### Large Projects
For projects with many dependencies, the version fetching has been optimized with:
- In-memory caching with 5-minute TTL to reduce redundant API calls
- Concurrent processing with adaptive rate limiting
- O(n + m) blocker detection algorithm for improved performance
- Progress tracking to show current status