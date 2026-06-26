#!/usr/bin/env node

import * as path from 'path'
import * as fs from 'fs'
import { CLITranslatorAdapter } from './cliAdapter'
import { program } from 'commander'
import { TRANSLATOR_JSON } from '../core/constants'

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
    .argument('[workspace]', 'Path to workspace directory containing translator.json', process.cwd())
    .option('--config <path>', 'Path to custom configuration file (defaults to <workspace>/translator.json)')
    .option('--review-push', 'Push translations for human translator review')
    .option('--review-pull', 'Pull translations from human translator review')
    .option('--review-status', 'Check status of pending human translator review projects')
    .option('--export-cache [path]', 'Export translation cache to CSV file')
    .option('--import-cache <path>', 'Import translation cache from CSV file')
    .option('--purge-cache', 'Purge unused translations from cache (creates backup when CSV exists)')
    .option('--bulk-translate', 'Perform bulk translation of all files')
    .option('--force', 'Force translation even if target files are up to date')
    .option('--watch', 'Watch for file changes', true)
    .option('--no-watch', 'Disable file watching')
    .parse(process.argv)

  const options = program.opts()
  const workspacePath = program.args[0] || process.cwd()

  // Use translator.json in the project folder only
  const configPath = options.config || path.join(workspacePath, TRANSLATOR_JSON)

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

  if (options.exportCache !== undefined) {
    const cachePath = typeof options.exportCache === 'string' ? options.exportCache : undefined
    await adapter.exportCache(cachePath)
    console.log('Cache export completed. Exiting.')
    process.exit(0)
  } else if (options.importCache) {
    await adapter.importCache(options.importCache)
    console.log('Cache import completed. Exiting.')
    process.exit(0)
  } else if (options.purgeCache) {
    const result = await adapter.purge()
    console.log(`Purge completed. Deleted ${result.deletedCount} unused translations.`)
    if (result.backupPath) {
      console.log(`Backup saved to: ${result.backupPath}`)
    }
    process.exit(0)
  } else if (options.reviewPush) {
    await adapter.pushToMateCat()
    console.log('Human translator review push operation completed. Exiting.')
    process.exit(0)
  } else if (options.reviewPull) {
    await adapter.pullFromMateCat()
    console.log('Human translator review pull operation completed. Exiting.')
    process.exit(0)
  } else if (options.reviewStatus) {
    const statuses = await adapter.getMateCatReviewStatus()
    if (statuses.length === 0) {
      console.log('No pending human translator review projects found.')
    } else {
      for (const status of statuses) {
        const percentDone = status.percentDone ?? 0
        console.log(`- ${status.projectId}: ${percentDone}% done (${status.status})`)
      }
    }
    console.log('Human translator review status operation completed. Exiting.')
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
