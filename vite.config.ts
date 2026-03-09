import { defineConfig } from 'vite'
import { createNodeBundleConfig } from './vite.shared'

export default defineConfig(
  createNodeBundleConfig({
    entry: 'src/extension.ts',
    outDir: 'dist',
    fileName: 'extension.js',
    includeVscodeExternal: true
  })
)
