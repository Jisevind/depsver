#!/usr/bin/env node

import { Command } from 'commander';
import { promises as fs } from 'fs';
import path from 'path';
import clipboardy from 'clipboardy';
import cliProgress from 'cli-progress';
import { NpmManager } from './managers/NpmManager.js';
import { formatReport } from './utils/formatter.js';

const program = new Command();

program
  .name('context-deps')
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
      const isValid = await manager.detect(resolvedPath);
      if (!isValid) {
        console.error('Error: No package-lock.json found in the specified directory.');
        console.error('Make sure you are running this command in an npm project directory.');
        process.exit(1);
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
        await clipboardy.write(markdownReport);
        console.log('Report copied to clipboard!');
      } else if (options.output) {
        await fs.writeFile(options.output, markdownReport);
        console.log(`Report written to file: ${options.output}`);
      } else {
        console.log(markdownReport);
      }
      
    } catch (error) {
      console.error('Error analyzing dependencies:', error instanceof Error ? error.message : error);
      process.exit(1);
    } finally {
      // Always stop the progress bar
      if (progressBar) {
        progressBar.stop();
      }
    }
  });

program.parse();
 
