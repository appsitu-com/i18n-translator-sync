# Actionable Test Coverage Roadmap

## Coverage Gap Analysis - Specific Test Gaps to Address

Based on coverage report analysis (2026-06-28), here are specific gaps and recommendations:

---


### 3. **environmentSetup.ts** (9% coverage - 197 uncovered lines)
**Location:** `src/core/util/environmentSetup.ts`

**Uncovered functions (12 functions, 0 covered):**
- `initTranslatorEnv()` - Environment initialization
- Path resolution logic - Different OS paths
- `.env` file loading edge cases

**What's needed:**
- [ ] Test with missing .env files
- [ ] Test with invalid .env syntax (partially covered in dedicated tests)
- [ ] Test environment variable precedence
- [ ] Test path resolution on different OSes
- [ ] Test with circular references in config

**Estimated test cases needed:** 8-10

---

## HIGH-PRIORITY GAPS (Affecting Features)

### 4. **structured.ts** (53% coverage - 40 uncovered lines)
**Location:** `src/extractors/structured.ts`

**Current coverage:** 4 functions out of 6

**Uncovered paths:**
- Complex nested structure handling
- Circular reference detection
- Large collection edge cases (>1000 items)

**What's needed:**
- [ ] Test deeply nested objects (5+ levels)
- [ ] Test circular references detection
- [ ] Test with very large arrays (10,000+ items)
- [ ] Test with mixed null/undefined values

**Estimated test cases needed:** 3-4

---

### 5. **markdown.ts** (10% coverage - 87 uncovered lines)
**Location:** `src/extractors/markdown.ts`

**Uncovered functions (7 functions):**
- Front matter extraction (YAML, TOML)
- Complex nested markdown patterns
- Edge case link/image parsing

**What's needed:**
- [ ] Test with invalid YAML front matter
- [ ] Test TOML front matter (if supported)
- [ ] Test complex nested lists/blockquotes
- [ ] Test code blocks with embedded markdown
- [ ] Test with malformed links/images

**Estimated test cases needed:** 5-7

---

### 6. **typescript.ts** (13% coverage - 43 uncovered lines)
**Location:** `src/extractors/typescript.ts`

**Uncovered functions (4 functions):**
- Complex decorator handling
- Generic type extraction
- Template literal string handling

**What's needed:**
- [ ] Test decorators with arguments
- [ ] Test generic type parameters
- [ ] Test template literals with embedded expressions
- [ ] Test union/intersection types in strings

**Estimated test cases needed:** 3-4

---

### 7. **yaml.ts** (25% coverage - 12 uncovered lines)
**Location:** `src/extractors/yaml.ts`

**Uncovered paths:**
- Invalid YAML syntax handling
- Special YAML constructs (anchors, aliases)
- Multi-document YAML files

**What's needed:**
- [ ] Test invalid YAML (parsing errors)
- [ ] Test YAML anchors and aliases
- [ ] Test multi-document YAML files
- [ ] Test special types (dates, timestamps, nulls)

**Estimated test cases needed:** 2-3

---

## CONFIGURATION ISSUES (Not Real Gaps)

### Coverage Report Problems

Several files show 0% coverage despite having tests:

**Likely reasons:**
1. **CLI/Extension entry points** (expected 0% in unit tests)
   - `extension.ts` - VS Code integration
   - `cli/cliAdapter.ts`, `cli/main.ts` - CLI integration
   - These are tested via integration tests, not unit tests

2. **Large files with incomplete instrumentation**
   - `translatorManager.ts` (453 lines)
   - `pipeline.ts` (371 lines)
   - `jsonlTranslationMemory.ts` (652 lines)
   - These have tests, but coverage tool may not be instrumenting properly

3. **Translator implementations**
   - Azure, Google, DeepL, Gemini, OpenRouter, etc.
   - Have integration tests but may not show in unit coverage

---

## Testing Priority (Effort vs Impact)

### Quick Wins (Low effort, high impact)
1. **yaml.ts** - 2-3 tests for YAML edge cases (15 min)
2. **extractorRegistry.ts** - Error cases (20 min)
3. **keyEncryption.ts** - Invalid data handling (25 min)

### Medium Effort (Worth doing)
4. **typescript.ts** - Complex patterns (30 min)
5. **markdown.ts** - Front matter and complex nesting (45 min)
6. **structured.ts** - Edge cases (30 min)

### Longer Term (Investigate first)
7. **fs.ts** - Comprehensive error handling (depends on architecture)
8. **environmentSetup.ts** - Needs refactoring planning

---

## Implementation Checklist

### Phase 1: Quick Fixes (Week 1)
- [ ] Add error handling tests to keyEncryption.ts
- [ ] Add edge case tests to yaml.ts
- [ ] Add invalid data tests to structured.ts

### Phase 2: Extractor Improvements (Week 2)
- [ ] Add complex pattern tests to typescript.ts
- [ ] Add markdown edge case tests

### Phase 3: Root Cause Investigation (Week 3)
- [ ] Debug why large files show 0% coverage
- [ ] Verify coverage configuration with SWC/Babel
- [ ] Consider moving integration tests coverage into unit test count

---

## Notes

- Total coverage gap across partial files: ~250 lines
- Estimated effort to close gaps: 4-6 hours
- Estimated test cases to add: 30-40
- Current test passing rate: 893/908 (98.3%)

## Related Files
- [COVERAGE_GAPS.md](./COVERAGE_GAPS.md) - Full coverage analysis
- [TEST_COVERAGE_INVENTORY.md](./TEST_COVERAGE_INVENTORY.md) - Test file mapping
- [vitest.config.ts](./vitest.config.ts) - Coverage configuration
