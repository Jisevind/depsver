#!/usr/bin/env node

import { Command } from 'commander';

const program = new Command();

program
  .name('context-deps')
  .description('A tool for analyzing and managing project dependencies')
  .version('1.0.0')
  .argument('[path]', 'directory to analyze', '.')
  .option('-o, --output <file>', 'output file for results')
  .option('--clip', 'copy results to clipboard')
  .action(async (path, options) => {
    // TODO: Instantiate and run manager
    console.log('Analyzing dependencies in:', path);
    console.log('Options:', options);
  });

program.parse();
 
