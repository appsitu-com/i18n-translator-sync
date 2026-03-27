## Release 0.8.0

### Features

- Added Gemini batch translation support so multiple strings are translated in one API request.
- Added automatic Gemini Flash model discovery and fallback when configured models are unavailable.
- Added one-time discovery caching (including in-flight deduplication) for Gemini model lookup.
- Added NLLB registration lifecycle updates and related translator wiring improvements while engine rollout is being finalized.
- Added deferred environment variable resolution so only engines in use require env configured credentials.

### Fixes

- Fixed file watcher reliability by introducing watcher readiness (`waitUntilReady`) and removing fragile timing assumptions.
- Fixed integration and unit test stability by replacing fixed sleeps with polling where safe and updating watcher mocks.
- Fixed NLLB integration configuration to use dedicated Hugging Face environment variables (`HUGGINGFACE_API_KEY` / `HUGGINGFACE_API_URL`).
- Fixed NLLB error messaging to better explain ambiguous model-ID failures that are often endpoint/auth configuration issues.
- Fixed environment variable coverage and related CI/config test expectations.
- Fixed config parsing behavior to ensure `translator.json` in VS Code uses JSON5 parsing consistently.
- Fixed DeepL config behavior to rely on a single endpoint value and removed obsolete free-endpoint assumptions.

### Documentation and Maintenance

- Updated README and supported-language docs, including NLLB documentation and language data organization improvements.
- Updated sample and test project environment/config defaults to match current provider expectations.
- Performed translator registry and menu cleanup, including temporarily de-registering NLLB while rollout hardening continues.

## Release 0.7.0

### Features

- Added NLLB translation engine support with broad language coverage (204 locale mappings), including configuration, validation, registry wiring, and docs/sample updates.
- Added locale-aware auto engine selection so engine choice can adapt by language pair instead of using one static engine strategy.
- Added clearer auto-engine override behavior in documentation to make mixed auto/manual engine workflows explicit.
- Added comprehensive supported-languages documentation across engines, including a generated language matrix and provider language inventories.
- Expanded integration validation for translator providers, including dedicated NLLB integration coverage and stronger OpenRouter failure-signal handling.
- Improved translation output export behavior with automatic translator.csv export during re-translation cycles when enabled.

### Fixes

- Fixed DeepL locale and language-map handling for back-translation scenarios (including casing and mapping consistency).
- Fixed path and configuration resolution behavior for source/root paths and relative path handling, improving consistency across CLI/extension runs.
- Fixed configuration loading robustness by tightening validation and reducing unsafe fallback behavior.
- Fixed credential-source and engine-selection observability issues by improving logging around provider selection and credential origin.
- Fixed failure behavior for missing environment configuration by failing fast instead of continuing with ambiguous runtime state.
- Fixed copy/back-translation workflow behavior so back-translation is skipped when forward translation is already up to date.
- Fixed endpoint safety checks by enforcing trusted endpoint validation for outbound translator service calls.
- Fixed skips whitespace-only input text strings and keeps them unchanged
- Fixed preserve prefix/suffix whitespace of input text strings to translated output strings

### Documentation and Operational Improvements

- Updated docs for supported languages, configuration, and CLI references.
- Improved release/maintenance readiness with workflow and versioning updates tied to current tooling/runtime expectations.

## Release 0.6.2

### Features

- Added expanded README usage examples.

### Fixes

- Fixed package/version-update script output to keep underlying git command output visible.
- Fixed test-project cache behavior by purging `translator.csv` in release updates.

## Release 0.6.1

### Fixes

- Fixed README duplication in the purge documentation section.

## Release 0.6.0

### Features

- Added major configuration refactor around `ITranslatorEngines` and `ITranslatorConfig` interfaces.

### Fixes

- Fixed environment loading to remove duplicate logic and improve config consistency.
- Fixed cross-platform path normalization (`toWorkspaceRelativePosix`) for Windows-style paths during Linux-based runs.
- Fixed Gemini model test coverage and cleaned recurring setup logging.

## Release 0.5.2

### Features

- Added environment variable wiring for CI/release flows and improved runtime env diagnostics.

### Fixes

- Fixed integration-test behavior for both local and CI environments.
- Fixed back-translation target path handling (issue #6) with added coverage.
- Fixed release workflow test execution to ensure full test suite coverage.

## Release 0.5.1

### Fixes

- Fixed SQLite build-tool detection in GitHub Actions for more reliable cross-OS native builds.

## Release 0.5.0-rc

### Features

- Added release candidate for cross-OS SQLite build workflow hardening.

## Release 0.4.20

### Fixes

- Fixed Vite SSR dependency bundling behavior.
- Fixed minor spelling/documentation issues.

## Release 0.4.9

### Fixes

- Fixed README title/app naming mismatch.

## Release 0.4.8

### Fixes

- Fixed packaging script behavior in `scripts/package-extension.js`.
- Fixed package-extension links and refreshed test-project purge artifacts.

## Release 0.4.7

### Maintenance

- Updated marketplace/gallery banner presentation and workflow metadata.

## Release 0.4.6

### Maintenance

- Updated publish workflow configuration.

## Release 0.4.5

### Maintenance

- Enabled publishing workflow path for extension releases.

## Release 0.4.4

### Features

- Added maximum character limit handling per API request during translation chunking.

### Maintenance

- Updated sample environment guidance for Google key configuration.

## Release 0.4.4-beta.4

### Maintenance

- Published pre-release build for the `0.4.4` rollout.

## Release 0.4.3

### Features

- Added bundled dependency strategy that excludes native dependencies.

### Maintenance

- Refreshed test-project purge artifacts.

## Release 0.4.2

### Features

- Added Vite-based bundling for extension builds.

## Release 0.4.1

### Features

- Added Google v3 API integration and broader translator integration test coverage.
- Added comment-tolerant `translator.json` parsing.
- Added translator chunking updates and workspace-relative path handling improvements.

### Fixes

- Fixed `rebuild-sqlite.js` behavior for Linux and Windows compatibility.
- Fixed locale normalization behavior to avoid modifying locales outside language maps.
- Fixed DeepL locale mapping behavior by normalizing locale casing.

## Release 0.3.0

### Features

- Added startup CSV auto-import for translation database bootstrapping.
- Added fallback translation cache lookup support for moved files.
- Added cache export/import/purge capabilities.
- Added automatic `.translator/` gitignore setup.
- Added relative POSIX source-path tracking with source-position metadata in cache records.

### Fixes

- Fixed startup behavior so database creation occurs on extension start path that avoids polluting unrelated VS Code projects.
- Fixed translation execution when cache is empty or purge is pending.

### Maintenance

- Renamed cache directory from `.i18n-cache` to `.translator`.
- Updated docs and tests for cache behavior and lifecycle updates.

## Release 0.2.7

### Maintenance

- Updated packaging dependencies (`@vscode/vsce`) and release metadata.

## Release 0.2.6

### Maintenance

- Switched packaging flow to global `vsce package` invocation.

## Release 0.2.5

### Fixes

- Fixed publish/release workflow to include required `pnpm rebuild:sqlite:electron && pnpm build` steps.
- Improved `execPromise()` logging for build/release diagnostics.

## Release 0.2.4

### Features

- Added baseline workflow/documentation cleanup for manual package build and CI release flow alignment.

### Fixes

- Fixed workflow conditional logic issues affecting release automation.

