# Publishing a new release

The extension uses:
- Yarn for local project dependencies
- npm for global tools (like @vscode/vsce)

To create a VSIX package with version management:

```bash
# Run the packaging script with interactive version selection
yarn package
```

This will:
1. Prompt you to select a version update type:
   - Major version (x.0.0) - For breaking changes
   - Minor version (0.x.0) - For new features (backward compatible)
   - Patch version (0.0.x) - For bug fixes (backward compatible)
   - Custom - Enter a specific version number
2. Update the version in package.json
3. Build the extension
4. Package it as a versioned VSIX file in the `releases/` directory
5. Display git commands to use to correctly tag the release in GIT

You can also update the version independently:
```bash
# Update version only (without packaging)
yarn version:update
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

## Cross-Platform Native Dependencies

This extension uses `better-sqlite3`, which is a native module that requires platform-specific binaries. The packaging configuration is set up to handle cross-platform compatibility:

- The extension uses the `vsce` packaging tool's native dependency support
- In `package.json`, the `vsce.dependencies` array specifies which native modules to include
- This ensures that the packaged extension will work on Windows, macOS, and Linux

This approach is the recommended way to handle native dependencies in VS Code extensions, ensuring that end users don't need to install any additional dependencies.

For development iterations, you can create a quick package without updating the version:
```bash
# Create package without version selection
yarn package:quick
```

If you need to regenerate the extension icon:
```bash
# Regenerate the PNG icon from SVG
yarn package:regenerate-icon
```
