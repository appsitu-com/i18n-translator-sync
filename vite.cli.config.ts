import { defineConfig } from 'vite'
import { createNodeBundleConfig } from './vite.shared'

export default defineConfig(
  createNodeBundleConfig({
    entry: 'src/cli/cliMain.ts',
    outDir: 'dist/cli',
    fileName: 'cliMain.js'
  })
)
