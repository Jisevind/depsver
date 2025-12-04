#!/usr/bin/env node

import { Command } from 'commander';
import { promises as fs } from 'fs';
import path from 'path';
import clipboardy from 'clipboardy';
import cliProgress from 'cli-progress';
import { NpmManager } from './managers/NpmManager.js';
import { formatReport, formatActionableInsights, formatActionableInsightsConsole } from './utils/formatter.js';
import {
  InvalidProjectError,
  ClipboardError,
  FileSystemError,
  formatError,
  wrapError
} from './utils/errors.js';

const program = new Command();

program
  .name('depsver')
  .description('Analyzes project dependencies and generates an AI-ready report')
  .version('1.0.0')
  .argument('[path]', 'directory to analyze', '.')
  .option('-o, --output <file>', 'output file for results')
  .option('--clip', 'copy results to clipboard')
  .action(async (pathArg, options) => {
    let progressBar: cliProgress.SingleBar | null = null;
    
    try {
      // Get absolute path
      const resolvedPath = path.resolve(pathArg);
      
      // Instantiate manager
      const manager = new NpmManager();
      
      // Check if this is a valid npm project
      try {
        const isValid = await manager.detect(resolvedPath);
        if (!isValid) {
          throw new InvalidProjectError(resolvedPath);
        }
      } catch (error) {
        if (error instanceof InvalidProjectError) {
          console.error(formatError(error));
          process.exit(1);
        }
        throw error;
      }
      
      // Create progress bar with stderr stream to avoid corrupting output
      progressBar = new cliProgress.SingleBar({
        stream: process.stderr,
        format: 'Fetching latest versions... {bar} {value}/{total} packages'
      });
      
      // Create progress callbacks
      const onProgress = {
        start: (total: number, payload: string) => {
          progressBar!.start(total, 0);
        },
        increment: (payload: string) => {
          progressBar!.increment();
        },
        stop: () => {
          progressBar!.stop();
        }
      };
      
      // Run analysis with progress tracking
      const report = await manager.analyze(resolvedPath, onProgress);
      
      // Format report
      const markdownReport = formatReport(report);
      
      // Handle output
      if (options.clip) {
        try {
          await clipboardy.write(markdownReport);
          console.log('Report copied to clipboard!');
        } catch (error) {
          const clipboardError = wrapError(error, 'Failed to copy to clipboard') as ClipboardError;
          console.error(formatError(clipboardError));
          process.exit(1);
        }
      } else if (options.output) {
        try {
          // Display Actionable Insights to console (plain text format)
          const actionableInsightsConsole = formatActionableInsightsConsole(report);
          console.log(actionableInsightsConsole);
          
          // Write full report to file
          await fs.writeFile(options.output, markdownReport);
          console.log(`Report written to file: ${options.output}`);
        } catch (error) {
          const fsError = wrapError(error, `Failed to write report to ${options.output}`) as FileSystemError;
          console.error(formatError(fsError));
          process.exit(1);
        }
      } else {
        console.log(markdownReport);
      }
      
    } catch (error) {
      // Handle known DepsverErrors with proper formatting
      if (error instanceof InvalidProjectError ||
          error instanceof ClipboardError ||
          error instanceof FileSystemError) {
        console.error(formatError(error));
        process.exit(1);
      }
      
      // Handle any other errors
      console.error(formatError(wrapError(error, 'Analysis failed')));
      process.exit(1);
    } finally {
      // Always stop the progress bar
      if (progressBar) {
        progressBar.stop();
      }
    }
  });

program.parse();
 
