# Contributing Guide

Thanks for helping improve **i18n Translator**! This guide explains how to set up your environment, run the project, and submit pull requests.

## Prerequisites

- **Node.js 22+**
- **pnpm** (v9+)
- **VS Code** (latest) with TypeScript support

## Code Architecture

For information about the internal architecture of the extension, see [Architecture Documentation](doc/Architecture.md).

### Project Structure

```
├── src/                  # Source code
│   ├── extractors/       # File format extractors (JSON, Markdown, etc.)
│   ├── translators/      # Translation engine adapters (Azure, Google, DeepL, etc.)
│   │   ├── registry.ts   # Registration of all translation engines
│   │   └── types.ts      # Common interfaces for translation engines
│   ├── util/             # Utility functions
│   ├── extension.ts      # Main extension entry point
│   ├── pipeline.ts       # Translation pipeline
│   ├── config.ts         # Configuration loading
│   └── cache.sqlite.ts   # SQLite translation cache
├── tests/                # Test files
│   ├── fixtures/         # Test data
│   ├── mocks/            # Mock implementations
│   └── *.test.ts         # Test suites
├── doc/                  # Documentation
├── scripts/              # Build and utility scripts
└── test-project/         # Sample project for manual testing
```

## Getting Started

This project uses **pnpm** for dependency management and running scripts.

### Install

```bash
# clone
git clone https://github.com/yourname/i18n-translator-vscode.git
cd i18n-translator-vscode

# Install pnpm (if not already installed)
npm install -g pnpm

# install packages
pnpm install
```

### Unit testing

For each cloud service you plan to test, create accounts and configured API keys in `translator.env`.
Never commit your API key files to GIT.

```bash
cp translator.env.sample translator.env
echo translator.env >> .gitignore

# build & run unit tests
pnpm build
pnpm test

# Auto run tests on source code change
pnpm test:watch

## Analyze test code coverage
pnpm test:cov

```

### Debugging

Use the "Run Extension with Test Project" in VS Code Debug panel.
This will launch a new instance of VS Code and open the `test-project` subfolder.
The test project contains a `.vscode/settings.json` file with `"translator.autoStart": true` that should auto start the extension server.

The debug configuration automatically:
1. Builds the TypeScript code
2. Rebuilds the better-sqlite3 module for Electron if needed
3. Launches the extension in debug mode

Copy your API keys from `translator.env` into `test-project/translator.env` for use during manual testing.
Make sure that `test-project/.gitignore` includes `translator.env` - *so you don't accidentally commit your keys into GIT!*

## Native Modules: better-sqlite3 and Electron

SQLite support in this extension requires native modules which need to be compiled for the specific Node.js or Electron version being used. We provide helper scripts to make this easier.

If you see an error like:

```
The module '.../better_sqlite3.node' was compiled against a different Node.js version...
```

You need to rebuild the native modules using our scripts:

```bash
# For running tests (rebuilds for your current Node.js version)
pnpm rebuild:sqlite

# For running in VS Code (rebuilds for Electron)
pnpm rebuild:sqlite:electron

# Quick rebuild without cleaning (faster but less reliable)
pnpm rebuild:quick
```

These scripts will automatically handle rebuilding the native SQLite module for the appropriate environment.

**How to find your VS Code Electron version:**

The Electron version is automatically detected by our scripts. If you need to know it:

1. Open VS Code and go to the menu: **Help > About** (or run the `Help: About` command from the Command Palette). The Electron version will be listed in the dialog.
2. Alternatively, open the **Debug Console** (while debugging the extension) and enter:
  ```js
  process.versions.electron
  ```

  This will output the Electron version used by the current VS Code instance.

3. You can also check the [VS Code release notes](https://code.visualstudio.com/updates/) for your version.

**Note:** Our configuration handles this automatically:
- `pnpm test` will automatically rebuild SQLite for Node.js
- When debugging (F5), SQLite will automatically rebuild for Electron if needed
- `pnpm vscode:prepublish` will rebuild for Electron before packaging

In the `package.json` file we have the following rule to ensure that the published version will be auto updated to use the `better-sqlite3` version that matches a user's VSCode version when they install the extension.

```json
"vsce": {
  "dependencies": [
    "better-sqlite3"
  ]
}
```

## Running the Extension

1. In VS Code, press **F5** to launch an Extension Host window.

2. In that window, run a command:
   - **Translator: Start**
   - **Translator: Stop**
   - **Translator: Restart**
   - **Translator: Show Output** (displays the extension logs)

## Viewing Logs

The extension provides detailed logging through a dedicated Output channel:

1. Open the Output panel (View > Output or Ctrl+Shift+U)
2. Select "i18n Translator" from the dropdown menu
3. Alternatively, run the "Translator: Show Output" command

If you don't see the "i18n Translator" in the dropdown:
- Make sure the extension is activated by running "Translator: Start" or any other translator command
- Try restarting VS Code if the extension is installed but not showing up

During debug sessions (F5), the output channel should automatically show up. If it doesn't:
- Run the "Translator: Show Output" command manually
- Check the Debug Console for any errors during activation

Logs include information about:
- Extension activation
- Watcher setup
- File processing events
- Translation operations
- Error messages with stack traces

When debugging issues, always check the Output panel first.

**Note**: The extension will only log meaningful events - if no translation or file activity is happening, the log may be minimal.


The extension watches `i18n/en/**` for Markdown/MDX/JSON and generates translations for configured target language and (optionally) back-translations for each target language. You can create, update, rename or delete files in `i18n/en` and these changes should then be mirrored in each of the target and back translation folders.

## Configuration & Env Vars

Refer to [Configuration.md](./doc/Configuration.md) for details of how to configure the translations.

## Code Style
- TypeScript strict mode is enabled.
- Prefer small, composable modules.
- Keep translator engines pure (no VS Code API inside engines).
- Use meaningful variable names and include doc comments for exported functions.

## Commit & PR

- Create feature branches: `feat/context-csv-validation`, `fix/azure-locale-normalization`
- Write descriptive commit messages.
- Add or update tests for your change.
- Ensure `pnpm build` and `pnpm test` pass locally.
- Open a PR with a concise description and screenshots/logs if applicable.

## CI/CD (Not yet tested!)

- **CI**: build + test on push/PR (`.github/workflows/ci.yml`).
- **Release**: create a tag `vX.Y.Z` to build a VSIX and attach it to a GitHub Release.
- **Publish**: when a Release is published, the VSIX is pushed to VS Code Marketplace & Open VSX (if secrets are configured).

## Troubleshooting

### SQLite Issues
If you encounter SQLite-related errors:
1. Check that you've rebuilt the module for your environment using `pnpm rebuild:sqlite`
2. If test failures persist, try cleaning the node_modules directory and reinstalling: `rm -rf node_modules && pnpm install && pnpm rebuild:sqlite`
3. For VS Code runtime issues, ensure you've rebuilt for Electron using `pnpm rebuild:sqlite:electron`

### Debugging the Extension
1. Use the "Run Extension with Test Project" configuration in VS Code
2. Set breakpoints in your TypeScript files
3. Check the Output channel for logs
4. If breakpoints aren't hitting, ensure source maps are enabled in both launch.json and tsconfig.json

**Expected Warnings During Debugging:**
When debugging, you may see warnings like:
```
Cannot register 'translator.targetLocales'. This property is already registered.
```

These warnings are harmless and expected behavior caused by VS Code's hot-reload mechanism attempting to re-register configuration properties from package.json. They only appear during development and won't affect end users. You can safely ignore them.

### Common Issues

- **API Keys not working**: Check that `translator.env` exists and contains the correct keys
- **Files not being translated**: Verify that the file paths match your configured source paths
- **Watcher not detecting changes**: Try restarting the translator and check logs for glob pattern issues
- **SQLite version mismatch**: Use the rebuild scripts mentioned above
- **Node.js version conflicts**: Ensure you're using Node.js 22+ as recommended

## Questions?

Open an issue. PRs welcome — thanks for contributing!
