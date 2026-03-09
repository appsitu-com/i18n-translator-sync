import { builtinModules } from 'node:module'
import { resolve } from 'node:path'
import type { UserConfig } from 'vite'

const nodeBuiltins = [...builtinModules, ...builtinModules.map((name) => `node:${name}`)]
const nativeRuntimeDeps = ['better-sqlite3', 'bindings', 'file-uri-to-path']

interface NodeBundleConfigOptions {
  entry: string
  outDir: string
  fileName: string
  includeVscodeExternal?: boolean
}

export function createNodeBundleConfig(options: NodeBundleConfigOptions): UserConfig {
  const external = options.includeVscodeExternal
    ? ['vscode', ...nativeRuntimeDeps, ...nodeBuiltins]
    : [...nativeRuntimeDeps, ...nodeBuiltins]

  return {
    resolve: {
      conditions: ['node'],
      alias: {
        'decode-named-character-reference': 'decode-named-character-reference/index.js'
      }
    },
    build: {
      ssr: true,
      target: 'node20',
      outDir: options.outDir,
      emptyOutDir: false,
      sourcemap: true,
      minify: false,
      lib: {
        entry: resolve(__dirname, options.entry),
        formats: ['cjs'],
        fileName: () => options.fileName
      },
      rollupOptions: {
        external,
        output: {
          inlineDynamicImports: true
        }
      }
    }
  }
}
