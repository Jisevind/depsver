# Depsver

> **⚠️ Disclaimer**: This tool provides guidance and analysis for dependency management, but all dependency updates should be thoroughly tested in your specific environment before applying to production. Always review breaking changes and test updates in a development environment first.

A sophisticated TypeScript CLI tool for intelligent dependency management and analysis. This tool provides comprehensive dependency insights with advanced blocker resolution, performance optimizations, and safety features for professional development workflows.

**Current Version: 1.0.0** - Production-ready with advanced dependency management capabilities.

## Core Features

### **Intelligent Dependency Analysis**
- **Multi-stage Analysis**: Optimized two-stage fetching process for top-level and transitive dependencies
- **Smart Blocker Detection**: O(n + m) algorithm for efficient dependency conflict resolution
- **Upgrade Classification**: Intelligent categorization into safe updates, major jumps, and blocked upgrades
- **Real-time Progress Tracking**: Live progress bars with performance metrics during registry fetching

### **Advanced Update Management**
- **Interactive Package Selection**: Rich terminal interface with numbered menus and smart filtering
- **Comprehensive Validation**: Pre/post-update validation with dependency conflict detection
- **Automatic Backup System**: Timestamped backups with integrity verification and cleanup
- **Test Integration**: Automated pre/post-update test execution with failure detection
- **Git Integration**: Checks for uncommitted changes before performing updates

### **Professional Safety Features**
- **Rollback Capabilities**: Instant restoration from previous backups with validation
- **Risk Assessment**: Detailed risk analysis for major version updates and blocking dependencies
- **Dependency Graph Analysis**: Deep understanding of transitive dependencies and constraints
- **Smart Update Ordering**: Optimized update sequences to minimize conflicts

### **Performance & Reliability**
- **Memory Optimization**: Efficient memory usage with monitoring and cleanup
- **Concurrent Processing**: Parallel registry requests with adaptive rate limiting
- **Intelligent Caching**: In-memory caching with TTL to reduce redundant API calls
- **Comprehensive Error Handling**: Contextual error messages with actionable solutions

### **Developer Experience**
- **Multiple Output Formats**: Console, file, and clipboard support
- **AI-Ready Reports**: Markdown reports optimized for AI assistants and code review
- **Rich Interactive UI**: Contextual help, package details, and smart selections
- **Type Safety**: Full TypeScript implementation with comprehensive interfaces

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

### Project Architecture

```
src/
├── cli.ts                    # CLI entry point and command orchestration
├── managers/
│   ├── NpmManager.ts         # Core npm dependency analysis and update engine
│   └── types.ts              # Comprehensive type definitions and interfaces
└── utils/
    ├── backup.ts             # Backup management with integrity verification
    ├── blocker.ts            # Advanced blocker detection and resolution algorithms
    ├── errors.ts             # Custom error classes with contextual handling
    ├── formatter.ts          # Report formatting and output generation
    ├── interactive.ts        # Rich interactive UI with package selection
    ├── performance.ts        # Performance monitoring and optimization
    ├── registry.ts           # npm registry API with caching and retry logic
    ├── reporting.ts          # Advanced reporting with multiple formats
    ├── ux.ts                 # User experience enhancements and helpers
    └── validation.ts         # Comprehensive validation and test integration

test/
├── basic.test.ts             # Core functionality tests
├── explicit.test.ts          # Explicit dependency resolution tests
├── simple.test.js/.ts        # Simple integration tests
├── managers/                # Manager-specific test suites
│   └── NpmManager.*.test.ts  # NpmManager comprehensive tests
├── performance/              # Performance and optimization tests
└── utils/                    # Utility function unit tests
    └── registry.test.ts      # Registry API tests
```

### Core Architecture Components

**Dependency Management Engine**
- **NpmManager**: Central orchestrator for all npm operations
- **Multi-stage Analysis**: Optimized fetching with intelligent dependency selection
- **Blocker Resolution**: O(n + m) algorithms for conflict detection and resolution

**Interactive User Interface**
- **InteractiveMenu**: Rich terminal interface with numbered selections
- **PackageFilter**: Smart filtering and categorization utilities
- **Progress Tracking**: Real-time progress bars with performance metrics

**Safety & Validation System**
- **UpdateValidator**: Comprehensive pre/post-update validation
- **TestRunner**: Automated test integration with failure detection
- **BackupManager**: Secure backup creation with integrity verification

**Performance Optimization**
- **Memory Management**: Efficient resource usage and monitoring
- **Concurrent Processing**: Parallel registry requests with rate limiting
- **Intelligent Caching**: TTL-based caching to minimize API calls

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
