# Publishing a new release

The extension uses:
- pnpm for dependency management
- A unified packaging script that works for both local and CI/CD workflows

## Local Release Process

To create a VSIX package with version management:

```bash
# Run the packaging script with interactive version selection
pnpm package
```

This will:
1. Prompt you to select a version update type:
   - Major version (x.0.0) - For breaking changes
   - Minor version (0.x.0) - For new features (backward compatible)
   - Patch version (0.0.x) - For bug fixes (backward compatible)
   - Custom - Enter a specific version number
2. Update the version in package.json
3. Ensure required assets (icons, sample configs) exist
4. Build the extension (TypeScript compilation + build info generation)
5. Package it as a versioned VSIX file in the `releases/` directory
6. Display git commands to use to correctly tag the release in GIT

**Note**: The build process has been optimized to avoid redundant builds. The packaging script triggers `vsce package`, which automatically runs the `vscode:prepublish` hook (rebuilding SQLite for Electron and building the extension).

You can also update the version independently:
```bash
# Update version only (without packaging)
pnpm version:update
```

## Tagging Releases

After creating a new version, the script will provide git commands to create and push a tag for the release:

```bash
# Commit the version change
git add package.json
git commit -m "Release version X.Y.Z"

# Create an annotated tag
git tag -a vX.Y.Z -m "Version X.Y.Z"

# Push changes and tags
git push origin main --tags
```

Once you push the tag, the GitHub Actions workflow will automatically:
1. Trigger the release workflow (`.github/workflows/release.yml`)
2. Package the extension using the unified packaging script
3. Create a GitHub Release with the VSIX file attached

## CI/CD Automated Release Workflow

The extension uses the same packaging script for both local and CI/CD workflows, ensuring consistency.

### GitHub Actions Workflows

**Release Workflow** (`.github/workflows/release.yml`):
- **Trigger**: Push a git tag matching `v*.*.*` (e.g., `v0.2.3`)
- **Process**:
  1. Extracts version from the tag (e.g., `v1.2.3` → `1.2.3`)
  2. Runs `pnpm package --version=1.2.3 --ci`
  3. Creates a GitHub Release with the VSIX from `releases/` directory

**Publish Workflow** (`.github/workflows/publish.yml`):
- **Trigger**: When a GitHub Release is **published** (not drafted)
- **Process**:
  1. Extracts version from the release tag
  2. Packages the extension using `pnpm package --ci`
  3. Publishes to VS Code Marketplace using `VSCE_PAT` secret

### Packaging Script Flags

The packaging script (`scripts/package-extension.js`) supports the following flags:

**`--ci`**: Enable CI mode
- Skips interactive prompts
- Reads version from `package.json` instead of prompting
- Skips git tagging instructions in output
- Example: `pnpm package --ci`

**`--version=X.Y.Z`**: Specify version explicitly
- Sets the version to use for packaging
- In CI mode with `--version`, validates that it matches `package.json` version
- Fails if version mismatch detected (ensures git tags match package.json)
- Example: `pnpm package --version=0.2.3 --ci`

**`--force-icon-generation`**: Regenerate icon
- Forces regeneration of PNG icon from SVG
- Example: `pnpm package --force-icon-generation`

### Version Validation in CI

When using `--ci` with `--version`, the script validates that the provided version matches the version in `package.json`. This ensures that:
- The git release tag matches the actual package version
- Prevents publishing with incorrect version numbers
- Catches version mismatch errors before creating releases

If validation fails, the workflow will exit with an error and provide clear instructions on how to fix the issue.

## Cross-Platform Native Dependencies

This extension uses `better-sqlite3`, which is a native module that requires platform-specific binaries. The packaging configuration is set up to handle cross-platform compatibility:

- The extension uses the `vsce` packaging tool's native dependency support
- In `package.json`, the `vsce.dependencies` array specifies which native modules to include
- This ensures that the packaged extension will work on Windows, macOS, and Linux

This approach is the recommended way to handle native dependencies in VS Code extensions, ensuring that end users don't need to install any additional dependencies.

## Quick Packaging Options

For development iterations, you can create packages without version management:

```bash
# Create package without version selection (bypasses version management and asset preparation)
pnpm package:quick

# Package in CI mode (uses current package.json version, no prompts)
pnpm package:ci
```

**Note**: `package:quick` directly calls `vsce package` and bypasses all the preparation steps (asset generation, sample copying, etc.). Use this only for quick testing. For proper releases, always use `pnpm package`.

If you need to regenerate the extension icon:
```bash
# Regenerate the PNG icon from SVG
pnpm package:regenerate-icon
```
