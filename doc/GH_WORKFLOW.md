# GitHub Actions Workflow Setup Guide

This document provides a comprehensive guide to setting up and configuring GitHub Actions workflows for automated CI/CD in the i18n-translator-sync extension.

## Overview of Workflows

The repository has three GitHub Actions workflows:

1. **CI** ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)) - Continuous Integration
2. **Release** ([`.github/workflows/release.yml`](../.github/workflows/release.yml)) - Package and create GitHub releases
3. **Publish** ([`.github/workflows/publish.yml`](../.github/workflows/publish.yml)) - Publish to marketplaces

## Required Secrets Configuration

### 1. VSCE_PAT (VS Code Marketplace Personal Access Token)

**Purpose**: Required to publish the extension to the [VS Code Marketplace](https://marketplace.visualstudio.com/).

**Setup Steps**:

1. **Create a Microsoft Azure DevOps account** (if you don't have one):
   - Go to https://dev.azure.com/
   - Sign in with your Microsoft account or create one

2. **Create a Personal Access Token**:
   - Navigate to your Azure DevOps organization
   - Click on User Settings (top right) → Personal Access Tokens
   - Click "New Token"
   - Configure the token:
     - **Name**: `vscode-marketplace-publish` (or similar)
     - **Organization**: Select **All accessible organizations**
     - **Expiration**: Set an appropriate expiration date (recommend 1 year or custom)
     - **Scopes**: Select **Custom defined** → **Marketplace** → Check **Manage**
   - Click "Create"
   - **IMPORTANT**: Copy the token immediately - it won't be shown again

3. **Add to GitHub Secrets**:
   - Go to your repository: `https://github.com/appsitu-com/i18n-translator-sync`
   - Navigate to **Settings** → **Secrets and variables** → **Actions**
   - Click **New repository secret**
   - Name: `VSCE_PAT`
   - Value: Paste the token you copied
   - Click **Add secret**

**Documentation**: https://code.visualstudio.com/api/working-with-extensions/publishing-extension#get-a-personal-access-token

---

### 2. OVSX_TOKEN (Open VSX Registry Token)

**Purpose**: Required to publish the extension to [Open VSX Registry](https://open-vsx.org/) (used by VS Code alternatives like VSCodium).

**Setup Steps**:

1. **Create an Open VSX account**:
   - Go to https://open-vsx.org/
   - Click "Sign in" → Choose GitHub or Eclipse login

2. **Generate an Access Token**:
   - Click on your profile (top right) → **Settings**
   - Navigate to **Access Tokens**
   - Click **Generate New Token**
   - Give it a descriptive name: `github-actions-publish`
   - Click **Generate Token**
   - **IMPORTANT**: Copy the token immediately

3. **Add to GitHub Secrets**:
   - Go to your repository settings
   - Navigate to **Settings** → **Secrets and variables** → **Actions**
   - Click **New repository secret**
   - Name: `OVSX_TOKEN`
   - Value: Paste the token you copied
   - Click **Add secret**

**Documentation**: https://github.com/eclipse/openvsx/wiki/Publishing-Extensions

---

### 3. CODECOV_TOKEN (Optional - Code Coverage)

**Purpose**: Upload test coverage reports to [Codecov](https://codecov.io/) for tracking code coverage over time.

**Setup Steps**:

1. **Sign up for Codecov**:
   - Go to https://codecov.io/
   - Click **Sign up** → Choose **Sign up with GitHub**
   - Authorize Codecov to access your GitHub account

2. **Add your repository**:
   - After signing in, Codecov should detect your repositories
   - Find `appsitu-com/i18n-translator-sync`
   - Click **Setup repo** or **Add repository**

3. **Get your Upload Token**:
   - Once the repository is added, go to **Settings** tab
   - Copy the **CODECOV_TOKEN** value

4. **Add to GitHub Secrets**:
   - Go to your repository settings
   - Navigate to **Settings** → **Secrets and variables** → **Actions**
   - Click **New repository secret**
   - Name: `CODECOV_TOKEN`
   - Value: Paste the token
   - Click **Add secret**

**Note**: This is optional. The CI workflow checks if the secret exists before attempting to upload coverage:
```yaml
if: ${{ secrets.CODECOV_TOKEN != '' }}
```

---

## Workflow Triggers and Usage

### CI Workflow
- **Triggers**: Automatically on push to `main` branch and on pull requests
- **Actions**: Builds the project, runs tests, generates coverage

### Release Workflow
- **Triggers**: When you push a git tag matching `v*.*.*` (e.g., `v0.2.0`)
- **Actions**: Builds and packages the extension, creates a GitHub Release with the `.vsix` file attached
- **No secrets required**

**To create a release**:
```bash
# Update version in package.json
git add package.json
git commit -m "Release version 0.2.0"
git tag -a v0.2.0 -m "Version 0.2.0"
git push origin main --tags
```

### Publish Workflow
- **Triggers**: When a GitHub Release is **published** (not just created)
- **Actions**: Publishes the extension to VS Code Marketplace and Open VSX
- **Required secrets**: `VSCE_PAT`.  `OVSX_TOKEN` not yet used

**Workflow**:
1. Tag created → Release workflow runs → Creates draft GitHub Release
2. You manually publish the release in GitHub UI
3. Publish workflow runs → Publishes to marketplaces

---

## Verification Steps

### 1. Verify Secrets Are Set
```bash
# Go to your repository
https://github.com/appsitu-com/i18n-translator-sync/settings/secrets/actions

# You should see:
- VSCE_PAT
- OVSX_TOKEN
- CODECOV_TOKEN (optional)
```

### 2. Test CI Workflow
- Push a commit to `main` or create a pull request
- Check the Actions tab: https://github.com/appsitu-com/i18n-translator-sync/actions
- Verify the CI workflow runs successfully

### 3. Test Release Workflow
```bash
# Create a test tag (use a pre-release version)
git tag -a v0.1.0-test -m "Test release"
git push origin v0.1.0-test
```
- Check that the Release workflow creates a GitHub Release with the `.vsix` file

### 4. Test Publish Workflow
- Go to the GitHub Release created in step 3
- Click "Edit release"
- Uncheck "Set as a pre-release" if needed
- Click "Publish release"
- Verify the Publish workflow runs and completes successfully

---

## Security Best Practices

1. **Token Expiration**: Set reasonable expiration dates for tokens (e.g., 1 year) and set reminders to renew them

2. **Minimal Permissions**: Only grant the specific permissions needed:
   - VSCE_PAT: Only "Marketplace: Manage" scope
   - OVSX_TOKEN: Basic publish permissions

3. **Monitor Secret Usage**: Regularly check the Actions tab for any unexpected usage

4. **Rotate Tokens**: If a token is compromised, immediately:
   - Revoke it in the source platform (Azure DevOps, Open VSX)
   - Generate a new token
   - Update the GitHub secret

5. **Never Commit Secrets**: Secrets are only in GitHub repository settings, never in code

---

## Troubleshooting

### Publishing Fails with Authentication Error
- Verify the secret name matches exactly: `VSCE_PAT` or `OVSX_TOKEN`
- Check if the token has expired
- Ensure the token has the correct permissions

### Workflow Doesn't Trigger
- For Release workflow: Ensure the tag matches pattern `v*.*.*`
- For Publish workflow: Ensure you **published** the release, not just created it
- Check branch protection rules aren't blocking workflow runs

### Coverage Upload Fails
- This is non-critical since `fail_ci_if_error: false`
- Verify CODECOV_TOKEN is valid
- Check Codecov service status

---

## Summary Checklist

- [x] Create VSCE_PAT in Azure DevOps
- [x] Add VSCE_PAT to GitHub repository secrets
- [ ] Create OVSX_TOKEN in Open VSX
- [ ] Add OVSX_TOKEN to GitHub repository secrets
- [x] (Optional) Create CODECOV_TOKEN
- [x] (Optional) Add CODECOV_TOKEN to GitHub repository secrets
- [x] Test CI workflow with a push to main
- [ ] Test Release workflow with a version tag
- [ ] Test Publish workflow by publishing a release
- [ ] Update [CICD.md](CICD.md) to remove "NOT yet tested!!" once verified

Once all steps are complete, your CI/CD pipeline will be fully automated! 🚀