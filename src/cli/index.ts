#!/usr/bin/env node

/**
 * CLI entry point - delegates to main.ts which has the actual implementation
 */
import { runCli } from './main'

runCli().catch((error) => {
  console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`)
  if (error instanceof Error && error.stack) {
    console.error(error.stack)
  }
  process.exit(1)
})
