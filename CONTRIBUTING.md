# Contributing Guide

Thanks for helping improve **i18n Translator**! This guide explains how to set up your environment, run the project, and submit pull requests.

## Prerequisites

- **Node.js 22+**
- **Yarn** or **npm**
- **VS Code** (latest) with TypeScript support

## Code Architecture

For information about the internal architecture of the extension, see [Architecture Documentation](doc/Architecture.md).

## Getting Started

This project uses NPM for global package installs and YARN for project installs.

> **Note about Yarn warning**
> You may see: `The engine "vscode" appears to be invalid.`
> This is safe to ignore. `"engines.vscode"` is required for VS Code extensions, but Yarn doesn’t validate it. If you prefer to silence it:
> ```bash
> yarn config set ignore-engines true
> ```

### Install

```bash
# clone
git clone https://github.com/yourname/i18n-translator-vscode.git
cd i18n-translator-vscode

# Install yarn
npm install -g yarn

# install packages
yarn install
```

### Unit testing

For each cloud service you plan to test, create accounts and configured API keys in `.translator.env`.
Never commit your API key files to GIT.

```bash
cp .translator.env.sample .translator.env
echo .translator.env >> .gitignore

# build & run unit tests
yarn build
yarn test

# Auto run tests on source code change
yarn test:watch

## Analyze test code coverage
npm run test:cov

```

### Debugging

Use the "Run Extension with Test Project" in VS Code Debug panel.
This will launch a new instance of VS Code and open the `test-project` subfolder.
The test project contains a `.vscode/settings.json` file with `"translator.autoStart": true` that should auto start the extension server.

Copy your API keys from `.translator.env` into `test-project/.translator.env` for use during manual testing.
Make sure that `test-project/.gitignore` includes `.translator.env` - *so you don't accidentally commit your keys into GIT!*

## Native Modules: better-sqlite3 and Electron

If you see an error like:

```
The module '.../better_sqlite3.node' was compiled against a different Node.js version...
```

You will need to rebuild native modules for the Electron version used by VS Code.

**How to find your VS Code Electron version:**

1. Open VS Code and go to the menu: **Help > About** (or run the `Help: About` command from the Command Palette). The Electron version will be listed in the dialog.
2. Alternatively, open the **Debug Console** (while debugging the extension) and enter:
  ```js
  process.versions.electron
  ```

  This will output the Electron version used by the current VS Code instance.

3. You can also check the [VS Code release notes](https://code.visualstudio.com/updates/) for your version.

**Rebuild native modules:**

For example, if your VS Code uses Electron 37.2.3:

```bash
yarn electron-rebuild -v 37.2.3
```

This will rebuild `better-sqlite3` and other native modules for the correct ABI.  This `better-sqlite3` version is only used during local testing.

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
- Ensure `yarn build` and `yarn test` pass locally.
- Open a PR with a concise description and screenshots/logs if applicable.

## CI/CD (Not yet tested!)

- **CI**: build + test on push/PR (`.github/workflows/ci.yml`).
- **Release**: create a tag `vX.Y.Z` to build a VSIX and attach it to a GitHub Release.
- **Publish**: when a Release is published, the VSIX is pushed to VS Code Marketplace & Open VSX (if secrets are configured).

## Questions?

Open an issue. PRs welcome — thanks for contributing!
