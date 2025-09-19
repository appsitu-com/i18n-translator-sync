# Code Quality Improvements - TODO List

This file contains recommended changes based on a comprehensive review of the codebase against the GitHub Copilot Instructions (`.github/copilot-instructions.md`).

## 🚨 CRITICAL ISSUES (Must Fix Immediately)

### 1. File Length Violations
**Problem**: Files exceeding the 500-line limit
- `src/core/translatorManager.ts` - **604 lines** (CRITICAL - exceeds limit by 104 lines)

**Action Required**: Break up `translatorManager.ts` immediately into smaller, focused modules:
- Extract file watching logic into `FileWatcherService`
- Extract MateCat integration into separate service
- Extract event handling into `FileEventHandler`
- Keep core translation coordination logic in main class

## 🔧 HIGH PRIORITY ISSUES

### 2. Function Length Violations
**Problem**: Functions exceeding 40-line guideline

**Files to Refactor**:
- `src/core/translatorManager.ts`:
  - `startWatching()` - ~62 lines, needs breaking into smaller functions
  - Constructor and initialization logic could be modularized

**Recommended Approach**:
- Extract pattern creation logic from `startWatching()`
- Create separate methods for file vs directory watcher setup
- Extract event handler registration into separate method

### 3. TypeScript Typing Issues
**Problem**: Usage of `any` type violates strict typing guidelines

**Files with `any` Usage**:
- `src/vscode/config.ts` (lines 41, 109, 135)
- `src/vscode/adapter.ts` (lines 94, 132, 149)
- `src/util/http.ts` (line 5)
- `src/translators/mymemory.ts` (lines 97, 107)
- `src/translators/openrouter.ts` (lines 121, 154)

**Action Required**:
- Define proper interfaces for engine configurations
- Create specific error types instead of `any` in catch blocks
- Define proper response types for HTTP requests
- Create typed interfaces for translation API responses

### 4. Modular Design Improvements
**Problem**: Tight coupling and insufficient dependency injection

**Issues Identified**:
- `TranslatorManager` directly instantiates dependencies
- Hard-coded service initialization in constructors
- Services not easily replaceable for testing

**Recommended Changes**:
- Implement proper dependency injection pattern
- Create service interfaces for better abstraction
- Extract service factories for complex initialization

## 📋 MEDIUM PRIORITY ISSUES

### 5. Naming Convention Improvements
**Problem**: Some comments use vague terms like "helper"

**Files to Update**:
- `src/types/env.ts` (lines 25, 47) - Replace "Helper function" with more specific descriptions

**Action Required**:
- Replace generic "helper" comments with specific purpose descriptions
- Ensure all function names are intention-revealing

### 6. Error Handling Consistency
**Problem**: Inconsistent error handling patterns

**Issues**:
- Mix of generic `Error` catching and specific error types
- Some error handling could be more granular

**Recommended Changes**:
- Create specific error types for different failure scenarios
- Implement consistent error handling patterns across modules
- Add proper error recovery strategies

## 📝 LOWER PRIORITY IMPROVEMENTS

### 7. Documentation Enhancements
**Current State**: Good overall documentation
**Improvements**:
- Add more JSDoc comments for complex functions
- Document dependency injection patterns once implemented
- Add architectural decision records for major refactoring

### 8. Test Coverage Validation
**Action Required**:
- Run coverage report to ensure 100% coverage goal
- Add tests for any uncovered code paths
- Ensure tests follow the "don't alter tests to make them pass" principle

## 🎯 IMPLEMENTATION STRATEGY

### Phase 1: Critical File Length Fix
1. **Immediately** break up `translatorManager.ts` into smaller modules
2. Extract file watching into `FileWatcherService`
3. Extract MateCat integration into `MateCatService`
4. Create focused interfaces for each service

### Phase 2: Function Length and Typing
1. Refactor long functions in `translatorManager.ts`
2. Replace all `any` types with proper interfaces
3. Create comprehensive type definitions for API responses

### Phase 3: Architecture Improvements
1. Implement dependency injection container
2. Create service interfaces and implementations
3. Improve testability through better separation of concerns

### Phase 4: Polish and Documentation
1. Update naming and documentation
2. Ensure comprehensive test coverage
3. Validate all changes against copilot instructions

## ✅ VALIDATION CHECKLIST

After implementing changes, verify:
- [ ] No files exceed 500 lines
- [ ] No functions exceed 40 lines
- [ ] No usage of `any` type
- [ ] All classes follow single responsibility principle
- [ ] Dependency injection implemented properly
- [ ] Test coverage remains at 100%
- [ ] All tests pass
- [ ] Code follows modular "Lego-like" design principles

## 📊 CURRENT METRICS
- **Files > 500 lines**: 1 (translatorManager.ts - 604 lines)
- **Functions > 40 lines**: ~3-4 identified
- **`any` type usage**: ~10 instances
- **Estimated refactoring effort**: 2-3 days

Remember: "Code must be built for reuse, not just to make it work" - prioritize modular, testable, and maintainable solutions.