#!/usr/bin/env node

import * as path from 'path';
import * as fs from 'fs';
import { CLITranslatorAdapter } from './adapter';
import { program } from 'commander';

/**
 * Run the CLI application
 */
export async function runCli(): Promise<void> {
  // Set up the command line interface
  program
    .name('i18n-translator')
    .description('I18n Translator CLI for translating JSON and Markdown files')
    .version('0.1.2')
    .argument('[workspace]', 'Path to workspace directory containing .translate.json', process.cwd())
    .option('--config <path>', 'Path to custom configuration file (defaults to <workspace>/.translate.json)')
    .option('--push-matecat', 'Push translations to MateCat')
    .option('--pull-matecat', 'Pull translations from MateCat')
    .option('--bulk-translate', 'Perform bulk translation of all files')
    .option('--file <path>', 'Process a single file for translation (relative to workspace)')
    .option('--force', 'Force translation even if target files are up to date')
    .option('--watch', 'Watch for file changes', true)
    .option('--no-watch', 'Disable file watching')
    .parse(process.argv);

  const options = program.opts();
  const workspacePath = program.args[0] || process.cwd();

  // Use .translate.json in the project folder only
  const configPath = options.config || path.join(workspacePath, '.translate.json');

  console.log(`Starting i18n translator for: ${workspacePath}`);
  console.log(`Using configuration from: ${configPath}`);

  // Create the adapter
  const adapter = new CLITranslatorAdapter(workspacePath, configPath);

  // Set up signal handlers for clean shutdown
  process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down...');
    adapter.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down...');
    adapter.stop();
    process.exit(0);
  });

  try {
    // Start the translator
    await adapter.start();

    // Process commands
    if (options.pushMatecat) {
      await adapter.pushToMateCat();
    }

    if (options.pullMatecat) {
      await adapter.pullFromMateCat();
    }

    if (options.file) {
      await adapter.translateFile(options.file);
    }

    if (options.bulkTranslate) {
      await adapter.bulkTranslate();
    }

    // Determine if any command was executed
    const commandExecuted = options.pushMatecat || options.pullMatecat || options.bulkTranslate || options.file;

    // Keep the process running if watching is enabled and no specific command was executed
    if (options.watch && !commandExecuted) {
      console.log('Translator is running in watch mode. Press Ctrl+C to stop.');
      // Keep the process alive
      setInterval(() => {}, 1000);
    } else if (!commandExecuted) {
      // If not watching and no commands specified, exit
      console.log('No watch mode or commands specified. Exiting.');
      adapter.stop();
    } else if (!options.watch) {
      // If a command was executed and we're not watching, exit
      adapter.stop();
    }
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

// Run the main function if this file is executed directly
if (require.main === module) {
  runCli().catch(error => {
    console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  });
}