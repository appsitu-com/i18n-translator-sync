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

