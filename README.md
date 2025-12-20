# Depsver

> **⚠️ Disclaimer**: This tool provides guidance and analysis for dependency management, but all dependency updates should be thoroughly tested in your specific environment before applying to production. Always review breaking changes and test updates in a development environment first.

A TypeScript CLI tool for analyzing project dependencies and generating AI-ready reports. This tool helps you understand your project's dependency landscape by analyzing package.json and package-lock.json files, checking for outdated packages, and identifying potential upgrade blockers with comprehensive error handling and performance optimizations.

**Current Version: 1.0.0** - Now available as a stable CLI tool with executable `depsver` command.

## Features

- **Dependency Analysis**: Analyzes your npm project's dependencies and their current versions
- **Upgrade Classification**: Categorizes dependencies into safe upgrades, blocked upgrades, and major version jumps
- **Blocker Detection**: Identifies which packages are preventing other packages from being upgraded using optimized O(n + m) algorithms
- **Interactive Updates**: **NEW** - Interactively select which packages to update with smart categorization
- **Safe Update Management**: **NEW** - Preview updates, create automatic backups, and rollback functionality
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

Run depsver in your project directory:

```bash
cd /path/to/your/project
depsver
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

### Update Dependencies

**NEW**: depsver now supports interactive dependency updates with safety features!

Preview available updates:

```bash
depsver update --preview
```

Interactive package selection:

```bash
depsver update --interactive
```

Safe updates only (no major versions):

```bash
depsver update --safe-only
```

Dry run (show what would be updated):

```bash
depsver update --dry-run
```

Rollback to previous backup:

```bash
depsver rollback .depsver-backup-2023-12-19T22-00-00-000Z
```

#### Update Options

- `-i, --interactive` - Interactive package selection with numbered menu
- `-s, --safe-only` - Only show safe updates (patch/minor versions)
- `-p, --preview` - Preview changes without applying them
- `--include-dev` - Include dev dependencies in updates
- `--dry-run` - Show what would be updated without making changes
- `--no-tests` - Skip running tests before/after updates

#### Safety Features

- **Automatic Backups**: Creates timestamped backups before any updates
- **Rollback Support**: Restore from backup if updates cause issues
- **Smart Categorization**: Separates safe, major, and blocked updates
- **Risk Assessment**: Identifies potential breaking changes and blockers
- **Pre/Post-Update Validation**: Validates package files and dependencies
- **Test Integration**: Automatically runs tests before and after updates
- **Dependency Conflict Detection**: Prevents incompatible updates
- **Git Integration**: Checks for uncommitted changes before updating

#### Advanced Features

- **Blocker Resolution**: **NEW** - Intelligent analysis and resolution of dependency conflicts
- **Smart Update Ordering**: **NEW** - Optimized update sequence to minimize conflicts
- **Interactive Resolution Workflows**: **NEW** - Step-by-step guidance for complex updates
- **Comprehensive Reporting**: **NEW** - Detailed reports with risk assessment and recommendations
- **Multiple Export Formats**: **NEW** - JSON, CSV, and Markdown report generation
- **Dependency Graph Analysis**: **NEW** - Deep analysis of dependency relationships

#### Performance & UX Enhancements

- **Optimized Performance**: **NEW** - Caching, batching, and parallel processing for faster analysis
- **Memory Management**: **NEW** - Efficient memory usage with monitoring and optimization
- **Enhanced Progress Tracking**: **NEW** - Real-time progress with performance metrics
- **Smart Error Handling**: **NEW** - Contextual error messages with actionable solutions
- **Interactive UI**: **NEW** - Rich terminal interface with smart selections and confirmations
- **Contextual Help**: **NEW** - Operation-specific help and pro tips

### Help

```bash
depsver --help
depsver update --help
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

1. **Detection**: Verifies that the current directory contains both `package.json` and `package-lock.json` files
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
│   ├── NpmManager.ts   # npm-specific dependency analysis and updates
│   └── types.ts        # Type definitions for dependency managers
└── utils/
    ├── errors.ts       # Custom error classes and error handling
    ├── formatter.ts    # Report formatting utilities
    ├── interactive.ts  # Interactive menu system for updates
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
