import { AnalysisReport } from '../managers/types.js';

/**
 * Configuration for formatting options
 */
interface FormatConfig {
  includeHeader?: boolean;
  includeProjectDependencies?: boolean;
  includeDependencyGraph?: boolean;
  includeRegistryStatus?: boolean;
  style: 'markdown' | 'console';
}

/**
 * Internal function to format actionable insights with configurable styling
 */
function formatActionableInsightsInternal(report: AnalysisReport, config: FormatConfig): string {
  const isMarkdown = config.style === 'markdown';
  const isConsole = config.style === 'console';
  
  let output = '';
  
  // Add header if requested
  if (config.includeHeader) {
    output += isMarkdown ? '### 1. Actionable Insights\n\n' : 'Actionable Insights:\n\n';
  }

  // No Updates Needed
  if (
    report.safe.length === 0 &&
    report.blocked.length === 0 &&
    report.majorJump.length === 0
  ) {
    output += isMarkdown
      ? '✅ All your top-level dependencies are up-to-date. Great job!\n\n'
      : 'All your top-level dependencies are up-to-date. Great job!\n\n';
  }
  
  // Safe to Upgrade
  if (report.safe.length > 0) {
    output += isMarkdown
      ? '* **✅ Safe to Upgrade:**\n'
      : 'Safe to Upgrade:\n';
    
    for (const dep of report.safe) {
      if (isMarkdown) {
        output += `    * \`${dep.name}\`: (${dep.resolved} → ${dep.latest})\n`;
      } else {
        output += `    - ${dep.name}: (${dep.resolved} → ${dep.latest})\n`;
      }
    }
    output += '\n';
  }
  
  // Blocked Upgrades
  if (report.blocked.length > 0) {
    output += isMarkdown
      ? '* **⚠️ Blocked Upgrades:**\n'
      : 'Blocked Upgrades:\n';
    
    for (const dep of report.blocked) {
      // Find the blocker package to get the required version
      const blockerPackage = report.allDependencies.find(p => p.name === dep.blocker);
      const requiredVersion = blockerPackage?.dependencies[dep.name] ||
                             blockerPackage?.peerDependencies[dep.name] || 'unknown';
      
      if (isMarkdown) {
        output += `    * \`${dep.name}\` (Latest: ${dep.latest}) is **blocked** by \`${dep.blocker}\` (requires \`${dep.name}@${requiredVersion}\`).\n`;
      } else {
        output += `    - ${dep.name} (Latest: ${dep.latest}) is blocked by ${dep.blocker} (requires ${dep.name}@${requiredVersion}).\n`;
      }
    }
    output += '\n';
  }
  
  // Major Version Jumps
  if (report.majorJump.length > 0) {
    output += isMarkdown
      ? '* **⬆️ Major Version Jumps (Review Required):**\n'
      : 'Major Version Jumps (Review Required):\n';
    
    for (const dep of report.majorJump) {
      if (isMarkdown) {
        output += `    * \`${dep.name}\`: (${dep.resolved} → ${dep.latest}) - Review breaking changes.\n`;
      } else {
        output += `    - ${dep.name}: (${dep.resolved} → ${dep.latest}) - Review breaking changes.\n`;
      }
    }
    output += '\n';
  }

  return output;
}

/**
 * Internal function to format project dependencies section
 */
function formatProjectDependencies(report: AnalysisReport): string {
  let markdown = '### 2. Project Dependencies (from package.json)\n';
  const requestedDeps = new Map<string, string>();
  
  // Collect requested dependencies from allDependencies
  for (const dep of report.allDependencies) {
    if (dep.requested && !requestedDeps.has(dep.name)) {
      requestedDeps.set(dep.name, dep.requested);
    }
  }
  
  // Sort by name for consistent output
  const sortedRequested = Array.from(requestedDeps.entries()).sort(([a], [b]) => a.localeCompare(b));
  
  for (const [name, version] of sortedRequested) {
    markdown += `* ${name}: "${version}"\n`;
  }
  markdown += '\n';
  
  return markdown;
}

/**
 * Internal function to format dependency graph section
 */
function formatDependencyGraph(report: AnalysisReport): string {
  const topLevelNames = new Set(
    report.allDependencies
      .filter(dep => dep.requested)
      .map(dep => dep.name)
  );
  
  let markdown = '### 3. Resolved Dependency Graph (from package-lock.json)\n';
  
  // Sort dependencies by name for consistent output
  const sortedAllDeps = [...report.allDependencies].sort((a, b) => a.name.localeCompare(b.name));
  
  for (const dep of sortedAllDeps) {
    if (!topLevelNames.has(dep.name)) continue;
    
    markdown += `* **${dep.name}**: ${dep.resolved}\n`;
    
    if (dep.dependencies && Object.keys(dep.dependencies).length > 0) {
      const depsList = Object.entries(dep.dependencies)
        .map(([name, version]) => `\`${name}@${version}\``)
        .join(', ');
      markdown += `    * Depends on: ${depsList}\n`;
    } else {
      markdown += `    * No dependencies\n`;
    }
  }
  markdown += '\n';
  
  return markdown;
}

/**
 * Internal function to format registry status section
 */
function formatRegistryStatus(report: AnalysisReport): string {
  const topLevelNames = new Set(
    report.allDependencies
      .filter(dep => dep.requested)
      .map(dep => dep.name)
  );
  
  let markdown = '### 4. Registry Status (Latest Versions)\n';
  
  // Sort by name for consistent output
  const sortedLatest = [...report.allDependencies]
    .sort((a, b) => a.name.localeCompare(b.name));
  
  for (const dep of sortedLatest) {
    if (!topLevelNames.has(dep.name)) continue;
    
    markdown += `* **${dep.name}**: ${dep.latest}\n`;
  }
  
  return markdown;
}

/**
 * Formats an AnalysisReport into a Markdown string for the "Full-Context Advisor" report
 */
export function formatReport(report: AnalysisReport): string {
  let markdown = '## 📦 Dependency Analysis Report\n\n';
  
  // Section 1: Actionable Insights
  markdown += formatActionableInsightsInternal(report, {
    includeHeader: true,
    style: 'markdown'
  });
  
  // Section 2: Project Dependencies (from package.json)
  markdown += formatProjectDependencies(report);
  
  // Section 3: Resolved Dependency Graph (from package-lock.json)
  markdown += formatDependencyGraph(report);
  
  // Section 4: Registry Status (Latest Versions)
  markdown += formatRegistryStatus(report);
  
  return markdown;
}

/**
 * Formats just the Actionable Insights section from an AnalysisReport
 */
export function formatActionableInsights(report: AnalysisReport): string {
  return formatActionableInsightsInternal(report, {
    includeHeader: true,
    style: 'markdown'
  });
}

/**
 * Formats just the Actionable Insights section from an AnalysisReport for console output (plain text, no markdown)
 */
export function formatActionableInsightsConsole(report: AnalysisReport): string {
  return formatActionableInsightsInternal(report, {
    includeHeader: true,
    style: 'console'
  });
}