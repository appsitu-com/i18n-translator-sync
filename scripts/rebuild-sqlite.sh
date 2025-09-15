#!/bin/bash

# Script to rebuild better-sqlite3 for the correct Electron version used by VS Code

## 37.3.1 = Version of Node used by VSCode used to test locally

# Clean install deps
rm -rf node_modules
yarn install --frozen-lockfile
npx electron-rebuild -f -w better-sqlite3 --version 37.3.1

# Rebuild specifically for VS Code's Electron
# export npm_config_runtime=electron
# export npm_config_target=37.3.1
# export npm_config_disturl=https://electronjs.org/headers
# export npm_config_arch=x64   # or arm64 if your VS Code is arm64

# npm rebuild better-sqlite3 --build-from-source
# or:
