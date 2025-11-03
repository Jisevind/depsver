import { AnalysisReport } from '../managers/types.js';

/**
 * Formats an AnalysisReport into a Markdown string for the "Full-Context Advisor" report
 */
export function formatReport(report: AnalysisReport): string {
  let markdown = '## 📦 Dependency Analysis Report\n\n';
  
  // Section 1: Actionable Insights
  markdown += '### 1. Actionable Insights\n\n';
  
  // Safe to Upgrade
  if (report.safe.length > 0) {
    markdown += '* **✅ Safe to Upgrade:**\n';
    for (const dep of report.safe) {
      markdown += `    * \`${dep.name}\`: (${dep.resolved} → ${dep.latest})\n`;
    }
    markdown += '\n';
  }
  
  // Blocked Upgrades
  if (report.blocked.length > 0) {
    markdown += '* **⚠️ Blocked Upgrades:**\n';
    for (const dep of report.blocked) {
      // Find the blocker package to get the required version
      const blockerPackage = report.allDependencies.find(p => p.name === dep.blocker);
      const requiredVersion = blockerPackage?.dependencies[dep.name] || 'unknown';
      markdown += `    * \`${dep.name}\` (Latest: ${dep.latest}) is **blocked** by \`${dep.blocker}\` (requires \`${dep.name}@${requiredVersion}\`).\n`;
    }
    markdown += '\n';
  }
  
  // Major Version Jumps
  if (report.majorJump.length > 0) {
    markdown += '* **⬆️ Major Version Jumps (Review Required):**\n';
    for (const dep of report.majorJump) {
      markdown += `    * \`${dep.name}\`: (${dep.resolved} → ${dep.latest}) - Review breaking changes.\n`;
    }
    markdown += '\n';
  }
  
  // Section 2: Project Dependencies (from package.json)
  markdown += '### 2. Project Dependencies (from package.json)\n';
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
  
  // Section 3: Resolved Dependency Graph (from package-lock.json)
  markdown += '### 3. Resolved Dependency Graph (from package-lock.json)\n';
  
  // Sort dependencies by name for consistent output
  const sortedAllDeps = [...report.allDependencies].sort((a, b) => a.name.localeCompare(b.name));
  
  for (const dep of sortedAllDeps) {
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
  
  // Section 4: Registry Status (Latest Versions)
  markdown += '### 4. Registry Status (Latest Versions)\n';
  
  // Sort by name for consistent output
  const sortedLatest = [...report.allDependencies]
    .sort((a, b) => a.name.localeCompare(b.name));
  
  for (const dep of sortedLatest) {
    markdown += `* **${dep.name}**: ${dep.latest}\n`;
  }
  
  return markdown;
}