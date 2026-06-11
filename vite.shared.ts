import { builtinModules } from 'node:module'
import { resolve } from 'node:path'
import type { UserConfig } from 'vite'

const nodeBuiltins = [...builtinModules, ...builtinModules.map((name) => `node:${name}`)]

interface NodeBundleConfigOptions {
  entry: string
  outDir: string
  fileName: string
  includeVscodeExternal?: boolean
}

export function createNodeBundleConfig(options: NodeBundleConfigOptions): UserConfig {
  const external = options.includeVscodeExternal
    ? ['vscode', ...nodeBuiltins]
    : [...nodeBuiltins]

  return {
    resolve: {
      conditions: ['node']
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
    },
    // Bundle all non-native dependencies for extension runtime reliability.
    // Keep only explicit runtime externals (vscode, Node built-ins, native deps).
    ssr: {
      noExternal: true
    }
  }
}
