import { PackageUpdate, UpdateResult, BlockerAnalysis, UpdateOrder } from '../managers/types.js';
import { BlockerResolver, ResolutionStep } from './blocker.js';

/**
 * Enhanced reporting utilities for dependency updates
 */
export class EnhancedReporter {
  /**
   * Generate comprehensive update report
   */
  static generateUpdateReport(
    plan: any,
    result?: UpdateResult,
    blockerAnalysis?: BlockerAnalysis,
    updateOrder?: UpdateOrder
  ): string {
    const sections: string[] = [];

    // Header
    sections.push('# 📦 Dependency Update Report');
    sections.push(`Generated on ${new Date().toISOString()}\n`);

    // Executive Summary
    sections.push('## 📊 Executive Summary');
    sections.push(this.generateExecutiveSummary(plan, result));

    // Update Plan Overview
    sections.push('## 🎯 Update Plan Overview');
    sections.push(this.generatePlanOverview(plan));

    // Blocker Analysis (if available)
    if (blockerAnalysis && blockerAnalysis.totalBlocked > 0) {
      sections.push('## 🚫 Blocker Analysis');
      sections.push(this.generateBlockerReport(blockerAnalysis));
    }

    // Recommended Update Order (if available)
    if (updateOrder) {
      sections.push('## 📋 Recommended Update Order');
      sections.push(this.generateUpdateOrderReport(updateOrder));
    }

    // Detailed Package Information
    sections.push('## 📦 Detailed Package Information');
    sections.push(this.generateDetailedPackageInfo(plan));

    // Risk Assessment
    sections.push('## ⚠️ Risk Assessment');
    sections.push(this.generateRiskAssessment(plan, blockerAnalysis));

    // Results (if update was performed)
    if (result) {
      sections.push('## 📈 Update Results');
      sections.push(this.generateResultsReport(result));
    }

    // Recommendations
    sections.push('## 💡 Recommendations');
    sections.push(this.generateRecommendations(plan, blockerAnalysis, result));

    return sections.join('\n\n');
  }

  /**
   * Generate executive summary
   */
  private static generateExecutiveSummary(plan: any, result?: UpdateResult): string {
    const totalPackages = plan.totalPackages || plan.packages?.length || 0;
    const safeCount = plan.categories?.safe?.length || 0;
    const majorCount = plan.categories?.major?.length || 0;
    const blockedCount = plan.categories?.blocked?.length || 0;

    let summary = `- **Total Packages**: ${totalPackages}\n`;
    summary += `- **Safe Updates**: ${safeCount} (${Math.round(safeCount / totalPackages * 100)}%)\n`;
    summary += `- **Major Updates**: ${majorCount} (${Math.round(majorCount / totalPackages * 100)}%)\n`;
    summary += `- **Blocked Updates**: ${blockedCount} (${Math.round(blockedCount / totalPackages * 100)}%)\n`;

    if (result) {
      summary += `\n- **Status**: ${result.success ? '✅ Success' : '❌ Failed'}\n`;
      summary += `- **Updated**: ${result.updated.length}\n`;
      summary += `- **Failed**: ${result.failed.length}\n`;
    }

    summary += `\n- **Estimated Time**: ${Math.round((plan.estimatedTime || 0) / 60)} minutes`;

    return summary;
  }

  /**
   * Generate plan overview
   */
  private static generatePlanOverview(plan: any): string {
    let overview = '';

    // Safe updates
    if (plan.categories?.safe?.length > 0) {
      overview += '\n### ✅ Safe Updates\n';
      plan.categories.safe.forEach((pkg: PackageUpdate) => {
        overview += `- **${pkg.name}**: ${pkg.currentVersion} → ${pkg.targetVersion} (${pkg.updateType})\n`;
      });
    }

    // Major updates
    if (plan.categories?.major?.length > 0) {
      overview += '\n### ⚠️ Major Updates\n';
      plan.categories.major.forEach((pkg: PackageUpdate) => {
        overview += `- **${pkg.name}**: ${pkg.currentVersion} → ${pkg.targetVersion} (major)\n`;
      });
    }

    // Blocked updates
    if (plan.categories?.blocked?.length > 0) {
      overview += '\n### 🚫 Blocked Updates\n';
      plan.categories.blocked.forEach((pkg: PackageUpdate) => {
        overview += `- **${pkg.name}**: ${pkg.currentVersion} → ${pkg.targetVersion} (blocked by ${pkg.blocker})\n`;
      });
    }

    return overview;
  }

  /**
   * Generate blocker report
   */
  private static generateBlockerReport(blockerAnalysis: BlockerAnalysis): string {
    let report = `- **Total Blockers**: ${blockerAnalysis.totalBlocked}\n`;
    report += `- **Estimated Resolution Time**: ${Math.round(blockerAnalysis.estimatedResolutionTime / 60)} minutes\n\n`;

    for (const blocker of blockerAnalysis.blockers) {
      report += `### 🚫 ${blocker.blockedPackage}\n`;
      report += `- **Blocked by**: ${blocker.blockerPackage}\n`;
      report += `- **Current Constraint**: ${blocker.constraint}\n`;
      report += `- **Risk Level**: ${blocker.impact.riskLevel}\n`;
      report += `- **Automated Resolution**: ${blocker.automatedResolvable ? '✅ Available' : '❌ Manual required'}\n`;

      if (blocker.resolutionSteps.length > 0) {
        report += '\n**Resolution Options:**\n';
        blocker.resolutionSteps.forEach((step: ResolutionStep, index: number) => {
          report += `${index + 1}. ${step.description}\n`;
          if (step.automated) {
            report += `   - Command: \`${step.command}\`\n`;
          }
        });
      }
      report += '\n';
    }

    return report;
  }

  /**
   * Generate update order report
   */
  private static generateUpdateOrderReport(updateOrder: UpdateOrder): string {
    let report = `- **Total Phases**: ${updateOrder.totalPhases}\n`;
    report += `- **Estimated Total Time**: ${Math.round(updateOrder.estimatedTotalTime / 60)} minutes\n\n`;

    for (const phase of updateOrder.phases) {
      report += `### 📋 ${phase.name}\n`;
      report += `${phase.description}\n`;
      report += `- **Packages**: ${phase.packages.length}\n`;
      report += `- **Estimated Time**: ${Math.round(phase.estimatedTime / 60)} minutes\n\n`;

      if (phase.packages.length > 0) {
        report += '**Packages:**\n';
        phase.packages.forEach(pkg => {
          report += `- ${pkg.name}: ${pkg.currentVersion} → ${pkg.targetVersion}\n`;
        });
        report += '\n';
      }
    }

    return report;
  }

  /**
   * Generate detailed package information
   */
  private static generateDetailedPackageInfo(plan: any): string {
    let info = '';

    for (const pkg of plan.packages || []) {
      info += `### 📦 ${pkg.name}\n`;
      info += `- **Current Version**: ${pkg.currentVersion}\n`;
      info += `- **Target Version**: ${pkg.targetVersion}\n`;
      info += `- **Update Type**: ${pkg.updateType}\n`;
      info += `- **Category**: ${pkg.category}\n`;
      
      if (pkg.blocker) {
        info += `- **Blocker**: ${pkg.blocker}\n`;
      }
      
      if (pkg.changelog) {
        info += `- **Changelog**: ${pkg.changelog}\n`;
      }
      
      if (pkg.securityNotes && pkg.securityNotes.length > 0) {
        info += '- **Security Notes**:\n';
        pkg.securityNotes.forEach((note: string) => {
          info += `  - ${note}\n`;
        });
      }
      
      info += '\n';
    }

    return info;
  }

  /**
   * Generate risk assessment
   */
  private static generateRiskAssessment(plan: any, blockerAnalysis?: BlockerAnalysis): string {
    let assessment = '';

    // Overall risk level
    const majorCount = plan.categories?.major?.length || 0;
    const blockedCount = plan.categories?.blocked?.length || 0;
    const totalCount = plan.totalPackages || plan.packages?.length || 0;

    let riskLevel = 'low';
    if (majorCount > totalCount * 0.2 || blockedCount > totalCount * 0.3) {
      riskLevel = 'high';
    } else if (majorCount > 0 || blockedCount > 0) {
      riskLevel = 'medium';
    }

    assessment += `- **Overall Risk Level**: ${riskLevel.toUpperCase()}\n`;
    assessment += `- **Major Version Updates**: ${majorCount}\n`;
    assessment += `- **Blocked Updates**: ${blockedCount}\n\n`;

    // Specific risks
    if (plan.risks && plan.risks.length > 0) {
      assessment += '**Identified Risks:**\n';
      plan.risks.forEach((risk: string) => {
        assessment += `- ${risk}\n`;
      });
      assessment += '\n';
    }

    // Blocker-specific risks
    if (blockerAnalysis && blockerAnalysis.totalBlocked > 0) {
      assessment += '**Blocker-Related Risks:**\n';
      for (const blocker of blockerAnalysis.blockers) {
        assessment += `- ${blocker.blockedPackage}: ${blocker.impact.riskLevel} risk, affects ${blocker.impact.affectedPackages.length} packages\n`;
      }
      assessment += '\n';
    }

    // Mitigation strategies
    assessment += '**Mitigation Strategies:**\n';
    if (majorCount > 0) {
      assessment += '- Review breaking changes for major updates\n';
      assessment += '- Run comprehensive tests after major updates\n';
    }
    if (blockedCount > 0) {
      assessment += '- Resolve blockers before proceeding with blocked updates\n';
      assessment += '- Consider alternative packages if blockers cannot be resolved\n';
    }
    assessment += '- Create backups before applying updates\n';
    assessment += '- Test updates in development environment first\n';

    return assessment;
  }

  /**
   * Generate results report
   */
  private static generateResultsReport(result: UpdateResult): string {
    let report = `- **Status**: ${result.success ? '✅ Success' : '❌ Failed'}\n`;
    report += `- **Packages Updated**: ${result.updated.length}\n`;
    report += `- **Packages Failed**: ${result.failed.length}\n`;

    if (result.backupPath) {
      report += `- **Backup Location**: ${result.backupPath}\n`;
    }

    // Successful updates
    if (result.updated.length > 0) {
      report += '\n### ✅ Successful Updates\n';
      result.updated.forEach(pkg => {
        report += `- **${pkg.name}**: ${pkg.currentVersion} → ${pkg.targetVersion}\n`;
      });
    }

    // Failed updates
    if (result.failed.length > 0) {
      report += '\n### ❌ Failed Updates\n';
      result.failed.forEach(pkg => {
        report += `- **${pkg.name}**: ${pkg.currentVersion} → ${pkg.targetVersion}\n`;
      });
    }

    // Errors
    if (result.errors && result.errors.length > 0) {
      report += '\n### 🚨 Errors\n';
      result.errors.forEach(error => {
        report += `- ${error}\n`;
      });
    }

    return report;
  }

  /**
   * Generate recommendations
   */
  private static generateRecommendations(plan: any, blockerAnalysis?: BlockerAnalysis, result?: UpdateResult): string {
    let recommendations = '';

    // General recommendations
    recommendations += '### 🎯 Immediate Actions\n';
    
    const safeCount = plan.categories?.safe?.length || 0;
    if (safeCount > 0) {
      recommendations += '1. **Apply safe updates first** - These have minimal risk of breaking changes\n';
    }

    const majorCount = plan.categories?.major?.length || 0;
    if (majorCount > 0) {
      recommendations += '2. **Review major updates carefully** - Check breaking changes and update code accordingly\n';
    }

    const blockedCount = plan.categories?.blocked?.length || 0;
    if (blockedCount > 0) {
      recommendations += '3. **Resolve blockers** - Update blocking packages or find alternatives\n';
    }

    // Blocker-specific recommendations
    if (blockerAnalysis && blockerAnalysis.totalBlocked > 0) {
      recommendations += '\n### 🔧 Blocker Resolution\n';
      
      const automatedResolvable = blockerAnalysis.blockers.filter((b: any) => b.automatedResolvable).length;
      if (automatedResolvable > 0) {
        recommendations += `- ${automatedResolvable} blockers can be resolved automatically\n`;
      }
      
      const manualRequired = blockerAnalysis.blockers.filter((b: any) => !b.automatedResolvable).length;
      if (manualRequired > 0) {
        recommendations += `- ${manualRequired} blockers require manual intervention\n`;
      }
    }

    // Post-update recommendations
    if (result) {
      recommendations += '\n### 📋 Post-Update Actions\n';
      
      if (result.success) {
        recommendations += '1. **Run full test suite** to ensure no functionality is broken\n';
        recommendations += '2. **Update documentation** if any APIs have changed\n';
        recommendations += '3. **Monitor application** for any issues in production\n';
      } else {
        recommendations += '1. **Review failed updates** and address errors\n';
        recommendations += '2. **Consider rollback** if critical functionality is affected\n';
        recommendations += '3. **Retry failed updates** after resolving issues\n';
      }
    }

    // Long-term recommendations
    recommendations += '\n### 🔄 Long-term Strategy\n';
    recommendations += '1. **Regular updates** - Stay current to avoid large version jumps\n';
    recommendations += '2. **Automated testing** - Ensure test coverage for all dependencies\n';
    recommendations += '3. **Dependency monitoring** - Set up alerts for security updates\n';
    recommendations += '4. **Documentation** - Keep track of dependency requirements and constraints\n';

    return recommendations;
  }

  /**
   * Generate JSON report for programmatic consumption
   */
  static generateJSONReport(
    plan: any,
    result?: UpdateResult,
    blockerAnalysis?: BlockerAnalysis,
    updateOrder?: UpdateOrder
  ): string {
    const report = {
      metadata: {
        generatedAt: new Date().toISOString(),
        version: '1.0.0',
        tool: 'depsver'
      },
      plan,
      result,
      blockerAnalysis,
      updateOrder,
      summary: {
        totalPackages: plan.totalPackages || plan.packages?.length || 0,
        safeUpdates: plan.categories?.safe?.length || 0,
        majorUpdates: plan.categories?.major?.length || 0,
        blockedUpdates: plan.categories?.blocked?.length || 0,
        estimatedTime: plan.estimatedTime || 0,
        status: result ? (result.success ? 'success' : 'failed') : 'planned'
      }
    };

    return JSON.stringify(report, null, 2);
  }

  /**
   * Generate CSV report for spreadsheet analysis
   */
  static generateCSVReport(plan: any): string {
    const headers = [
      'Package Name',
      'Current Version',
      'Target Version',
      'Update Type',
      'Category',
      'Blocker',
      'Risk Level'
    ];

    const rows = plan.packages?.map((pkg: PackageUpdate) => [
      pkg.name,
      pkg.currentVersion,
      pkg.targetVersion,
      pkg.updateType,
      pkg.category,
      pkg.blocker || '',
      pkg.updateType === 'major' ? 'high' : pkg.category === 'blocked' ? 'medium' : 'low'
    ]) || [];

    const csvContent = [
      headers.join(','),
      ...rows.map((row: any) => row.map((cell: any) => `"${cell}"`).join(','))
    ].join('\n');

    return csvContent;
  }
}
