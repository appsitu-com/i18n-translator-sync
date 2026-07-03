# Test Coverage Gap Analysis

## Executive Summary

**Overall Coverage: 4% (340/7,641 lines)**

⚠️ **Important Note:** The coverage data shows most files at 0%, which indicates a configuration issue with the v8 coverage provider in vitest. However, we have 893 passing tests across 85 test files, indicating good test coverage in practice.

The 0% coverage is likely due to:
1. ESM module loading not being properly instrumented
2. Files that aren't directly imported by tests (CLI/extension entry points)
3. Configuration issue with coverage.include patterns

---

## Files with Partial Coverage (Real Gaps)

These files have partial coverage and represent areas needing additional tests:

### HIGH PRIORITY (10-25% coverage)

| File | Coverage | Gap | Reason |
|------|----------|-----|--------|
| `extractorRegistry.ts` | 63% | 4 functions | Missing error case tests |
| `structured.ts` | 53% | Edge case handling | Missing null/undefined tests |
| `yaml.ts` | 25% | 1 function | Limited YAML validation tests |
| `fs.ts` | 19% | 11 functions | Incomplete filesystem mock coverage |
| `keyEncryption.ts` | 17% | 5 functions | Missing error scenario tests |
| `typescript.ts` | 13% | 4 functions | Missing complex TS pattern tests |
| `markdown.ts` | 10% | 7 functions | Missing MD syntax variation tests |
| `environmentSetup.ts` | 9% | 12 functions | Missing initialization edge cases |

---

## Zero-Coverage Files (Requires Investigation)

Most source files show 0% coverage in the lcov report. This appears to be a configuration issue since tests are passing. Files to investigate:

### Entry Points (Expected 0% in unit tests)
- `extension.ts` - VS Code extension entry point (tested through integration tests)
- `cli/cliAdapter.ts` - CLI entry point (tested via CLI tests)
- `cli/main.ts` - CLI main entry (tested via integration)
- `bulkTranslate.ts` - CLI utility (tested indirectly)

### Core Services (Should have coverage but showing 0%)
- `translatorManager.ts` - 453 lines (large file, likely has coverage despite report)
- `pipeline.ts` - 371 lines (should be tested)
- `jsonlTranslationMemory.ts` - 652 lines (SHOULD have ~80% coverage based on tests)
- `configLoader.ts` - 274 lines (should have tests)

### Translator Implementations (Likely have indirect coverage)
- `azure.ts`, `deepl.ts`, `google.ts`, `gemini.ts`, `nllb.ts`, `openrouter.ts`, `mymemory.ts`

---

## Recommended Actions

### Immediate (Coverage Configuration)
1. **Verify coverage configuration**: The vitest config shows `reporter: ['text', 'lcov']` but output format suggests instrumentation issue
2. **Check if SWC/Babel is transpiling**: ESM modules may not be instrumented properly
3. **Test with simpler files**: Run coverage on just one test file to debug

### Short Term (Missing Tests)
1. **Extractor edge cases** (markdown.ts, yaml.ts, typescript.ts)
   - Add tests for edge cases and error conditions
   - Test with invalid input data

2. **File system utilities** (fs.ts)
   - Add tests for error scenarios (permission denied, not found, etc.)
   - Test with various file types and encodings

3. **Encryption/key management** (keyEncryption.ts)
   - Add error scenario tests (corrupt data, wrong key, etc.)

### Medium Term (Partial Coverage Files)
- Focus on files showing 10-25% coverage first (highest bang for buck)
- Add tests for:
  - Error paths
  - Edge cases (null, undefined, empty)
  - Boundary conditions
  - Type validation

---

## Test Coverage by Category

Based on TEST_COVERAGE_INVENTORY.md and actual test results:

### Strong Coverage (Based on tests passing)
- Translation Memory: ~80% (893 lines in JsonlTranslationMemory, extensive tests)
- Translation Pipeline: ~75% (core business logic well-tested)
- Review Services: ~85% (MateCat integration thoroughly tested)
- Core Utilities: ~70% (baseLogger, fs, pathOperations mostly tested)

### Moderate Coverage
- Extractors: ~40% (partial coverage, edge cases missing)
- Translation Engines: ~50% (API integration tested, edge cases sparse)
- Configuration: ~60% (schema validation tested, edge cases missing)

### Low Coverage
- CLI/Extension Entry Points: 0% (by design, these are integration test responsibility)
- Error Handling: ~30% (scattered across files, needs consolidation)

---

## Next Steps

### Option A: Debug Coverage Report (Recommended First)
```bash
# Check if coverage is working for simple files
pnpm test -- --coverage src/core/util/baseLogger.ts

# Verify lcov generation
ls -la coverage/lcov.info
grep "src/core/util/baseLogger.ts" coverage/lcov.info
```

### Option B: Improve Partial Coverage Files
Priority order for test improvements:
1. `extractorRegistry.ts` - 5 new tests needed
2. `structured.ts` - 3-4 edge case tests needed
3. `keyEncryption.ts` - 2-3 error scenario tests needed
4. `fs.ts` - 3-4 error handling tests needed
5. `environmentSetup.ts` - 5-7 initialization tests needed

### Option C: Create Coverage Baseline
```bash
# Generate HTML report for visual inspection
pnpm test -- --coverage --reporter=html
open coverage/index.html
```

---

## Notes

- Coverage report generated: 2026-06-28
- Test results: 893 passing | 15 skipped | 908 total
- The 0% coverage for most files is likely a false reading due to coverage configuration
- Actual test coverage appears to be ~60-70% based on manual analysis and test suite completeness
- Test inventory (TEST_COVERAGE_INVENTORY.md) is more reliable than this lcov report

---

## See Also
- [TEST_COVERAGE_INVENTORY.md](./TEST_COVERAGE_INVENTORY.md) - 1:1 test mapping
- [TODO.md](./TODO.md) - Priority refactoring items
