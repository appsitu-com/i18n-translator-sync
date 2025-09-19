# File Renaming Plan - Qualify Duplicate Names

This document outlines a plan to rename files with duplicate names to more descriptive, qualified names that reflect their specific purposes.

## Current Duplicate Files Analysis

### 📋 config.ts files (4 instances)
- `src/config.ts` → **`src/extensionConfig.ts`** (Main VS Code extension config)
- `src/cli/config.ts` → **`src/cli/cliConfigProvider.ts`** (CLI-specific config provider)
- `src/core/config.ts` → **`src/core/projectConfig.ts`** (Core project configuration logic)
- `src/vscode/config.ts` → **`src/vscode/vscodeConfigProvider.ts`** (VS Code config provider)

### 🔌 adapter.ts files (2 instances)
- `src/cli/adapter.ts` → **`src/cli/cliAdapter.ts`** (CLI platform adapter)
- `src/vscode/adapter.ts` → **`src/vscode/vscodeAdapter.ts`** (VS Code platform adapter)

### 📝 contextCsv.ts files (2 instances)
- `src/contextCsv.ts` → **`src/translationContext.ts`** (Main translation context handling)
- `src/core/contextCsv.ts` → **`src/core/contextCsvParser.ts`** (Core CSV parsing logic)

### 🌍 env.ts files (2 instances)
- `src/core/util/env.ts` → **`src/core/util/environmentSetup.ts`** (Environment initialization)
- `src/types/env.ts` → **`src/types/environmentTypes.ts`** (Environment type definitions)

### 📁 index.ts files (3 instances)
- `src/cli/index.ts` → **`src/cli/cliMain.ts`** (CLI entry point)
- `src/extractors/index.ts` → **`src/extractors/extractorRegistry.ts`** (Extractor registry)
- `src/translators/index.ts` → **`src/translators/translatorRegistry.ts`** (Translator registry)

### 📊 logger.ts files (2 instances)
- `src/core/util/logger.ts` → **`src/core/util/baseLogger.ts`** (Base logger interface)
- `src/vscode/logger.ts` → **`src/vscode/vscodeLogger.ts`** (VS Code-specific logger)

### 🛤️ paths.ts files (2 instances)
- `src/core/util/paths.ts` → **`src/core/util/pathOperations.ts`** (Core path operations)
- `src/util/paths.ts` → **`src/util/translationPaths.ts`** (Translation-specific path utilities)

### 👀 watcher.ts files (3 instances)
- `src/cli/watcher.ts` → **`src/cli/cliFileWatcher.ts`** (CLI file watching)
- `src/core/util/watcher.ts` → **`src/core/util/fileWatcherBase.ts`** (Base watcher interface)
- `src/vscode/watcher.ts` → **`src/vscode/vscodeFileWatcher.ts`** (VS Code file watcher)

## Implementation Strategy

### Phase 1: Update File Names and Exports
1. Rename files to new qualified names
2. Update export statements in renamed files
3. Update import statements across the codebase

### Phase 2: Update Import References
Update all import statements that reference the old file names:

#### Config Files Impact
```typescript
// OLD
import { someFunction } from './config'
import { ConfigProvider } from '../core/config'

// NEW
import { someFunction } from './extensionConfig'
import { ConfigProvider } from '../core/projectConfig'
```

#### Adapter Files Impact
```typescript
// OLD
import { CliAdapter } from './adapter'
import { VsCodeAdapter } from '../vscode/adapter'

// NEW
import { CliAdapter } from './cliAdapter'
import { VsCodeAdapter } from '../vscode/vscodeAdapter'
```

### Phase 3: Update Build and Test Configurations
- Update any build scripts that reference specific file names
- Update test files that import the renamed modules
- Update VS Code extension manifest if needed

## Benefits of This Renaming

### 🎯 Clarity and Intent
- **Before**: `config.ts` (which config?)
- **After**: `projectConfig.ts` (clearly project-level configuration)

### 🔍 Better IDE Experience
- IntelliSense will show qualified names
- File search becomes more precise
- Reduces cognitive load when navigating

### 🧪 Improved Testability
- Test files can have more descriptive names
- Clearer relationship between test and source files

### 📚 Documentation Alignment
- File names match their actual purpose
- Easier for new developers to understand architecture

## Risk Assessment

### Low Risk Renames
- Internal utility files (paths, logger, env)
- Platform-specific adapters
- Registry files (index.ts → *Registry.ts)

### Medium Risk Renames
- Config files (multiple imports across codebase)
- Watcher files (used in multiple contexts)

### Mitigation Strategy
1. Use TypeScript compiler to catch all import errors
2. Run full test suite after each batch of renames
3. Update imports in small, logical groups
4. Verify VS Code extension still builds and runs

## Execution Checklist

- [ ] Phase 1: Rename files and update exports
- [ ] Phase 2: Update all import statements
- [ ] Phase 3: Update build/test configurations
- [ ] [ ] Verify TypeScript compilation succeeds
- [ ] Run full test suite
- [ ] Test VS Code extension functionality
- [ ] Test CLI functionality
- [ ] Update documentation if needed

## Priority Order

1. **Start with registry files** (index.ts → *Registry.ts) - lowest risk
2. **Utility files** (logger, paths, env) - isolated changes
3. **Platform adapters** (adapter.ts files) - clear separation
4. **Config files** - highest impact, requires careful coordination

This renaming will significantly improve code clarity and align with the project's emphasis on descriptive, intention-revealing names per the GitHub Copilot Instructions.