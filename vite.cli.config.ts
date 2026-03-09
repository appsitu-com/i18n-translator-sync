import { defineConfig } from 'vite'
import { builtinModules } from 'node:module'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

interface PackageJson {
  dependencies?: Record<string, string>
}

const packageJson = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8')) as PackageJson
const dependencyNames = Object.keys(packageJson.dependencies || {})
const nodeBuiltins = [...builtinModules, ...builtinModules.map((name) => `node:${name}`)]

export default defineConfig({
  build: {
    target: 'node20',
    outDir: 'dist/cli',
    emptyOutDir: false,
    sourcemap: true,
    minify: false,
    lib: {
      entry: resolve(__dirname, 'src/cli/cliMain.ts'),
      formats: ['cjs'],
      fileName: () => 'cliMain.js'
    },
    rollupOptions: {
      external: [...dependencyNames, ...nodeBuiltins],
      output: {
        inlineDynamicImports: true
      }
    }
  }
})
