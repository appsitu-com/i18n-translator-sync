#!/usr/bin/env node

import * as path from 'path'
import * as fs from 'fs'
import { CLITranslatorAdapter } from './adapter'
import { program } from 'commander'

/**
 * Run the CLI application
 */
export async function runCli(): Promise<void> {
  // Get package version from package.json
  const packageJsonPath = path.join(__dirname, '..', '..', 'package.json')
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))

  // Set up the command line interface
  program
    .name('i18n-translator')
    .version(packageJson.version)
    .description('I18n Translator CLI for translating JSON and Markdown files')
    .argument('[workspace]', 'Path to workspace directory containing .translator.json', process.cwd())
    .option('--config <path>', 'Path to custom configuration file (defaults to <workspace>/.translator.json)')
    .option('--push-matecat', 'Push translations to MateCat')
    .option('--pull-matecat', 'Pull translations from MateCat')
    .option('--bulk-translate', 'Perform bulk translation of all files')
    .option('--force', 'Force translation even if target files are up to date')
    .option('--watch', 'Watch for file changes', true)
    .option('--no-watch', 'Disable file watching')
    .parse(process.argv)

  const options = program.opts()
  const workspacePath = program.args[0] || process.cwd()

  // Use .translator.json in the project folder only
  const configPath = options.config || path.join(workspacePath, '.translator.json')

  console.log(`Starting i18n translator for: ${workspacePath}`)
  console.log(`Using configuration from: ${configPath}`)

  // Create the adapter
  const adapter = new CLITranslatorAdapter(workspacePath, configPath)

  // Set up signal handlers for clean shutdown
  process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down...')
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down...')
    process.exit(0)
  })

  // Initialize the configuration and create the translator manager
  await adapter.initialize()

  if (options.pushMatecat) {
    await adapter.pushToMateCat()
    console.log('MateCat push operation completed. Exiting.')
    process.exit(0)
  } else if (options.pullMatecat) {
    await adapter.pullFromMateCat()
    console.log('MateCat pull operation completed. Exiting.')
    process.exit(0)
  } else if (options.bulkTranslate) {
    await adapter.bulkTranslate(options.force)
    console.log('Bulk translation completed. Exiting.')
    process.exit(0)
  } else { // watch mode
    await adapter.bulkTranslate(options.force)
    await adapter.start()
    console.log('Translator is running in watch mode. Press Ctrl+C to stop.')
    setInterval(() => {}, 60000) // Keep the process alive
  }
}
