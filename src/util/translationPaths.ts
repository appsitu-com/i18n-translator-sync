import * as path from 'path'
import * as vscode from 'vscode'
import { TranslateProjectConfig } from '../core/coreConfig'
import { normalizePath, containsLocale, replaceLocaleInPath } from '../core/util/pathShared'

// Re-export shared utilities for backward compatibility
export { normalizePath, containsLocale, replaceLocaleInPath }

/**
 * Find the source path that contains the given file
 */
export function findSourcePathForFile(uri: vscode.Uri, config: TranslateProjectConfig): string | null {
  const ws = vscode.workspace.getWorkspaceFolder(uri)
  if (!ws) return null

  // Handle both fsPath and path properties to work with tests
  const wsPath = ws.uri.fsPath || ws.uri.path;
  if (!wsPath) {
    console.log(`Workspace has no path: ${JSON.stringify(ws.uri)}`)
    return null;
  }

  const uriPath = uri.fsPath || uri.path;
  if (!uriPath) {
    console.log(`URI has no path: ${JSON.stringify(uri)}`)
    return null;
  }

  // Normalize paths for consistent comparison (especially important on Windows)
  const normalizedUriPath = normalizePath(uriPath);
  console.log(`Finding source path for: ${normalizedUriPath}`)

  // Source resolution is workspace-rooted and driven by sourcePaths.
  const basePath = normalizePath(wsPath);

  for (const sourcePath of config.sourcePaths) {
    // Normalize the full source path
    const fullSourcePath = normalizePath(path.join(basePath, sourcePath))
    console.log(`Checking if file is in: ${fullSourcePath}`)

    if (normalizedUriPath.startsWith(fullSourcePath)) {
      // Verify the path contains the source locale
      if (!containsLocale(sourcePath, config.sourceLocale)) {
        console.log(`Path ${sourcePath} doesn't contain source locale ${config.sourceLocale}`)
        continue;
      }

      console.log(`Match found: ${sourcePath}`)
      return sourcePath
    }
  }

  // For debugging
  console.log(`No source path found for ${uriPath}. Checked paths:`,
    config.sourcePaths.map(p => normalizePath(path.join(basePath, p))))

  return null
}

/**
 * Calculate the base path for source files
 */
export function getSourceBasePath(workspacePath: string, config: TranslateProjectConfig): string {
  return workspacePath;
}

/**
 * Calculate the base path for target files
 */
export function getTargetBasePath(workspacePath: string, config: TranslateProjectConfig): string {
  return workspacePath;
}

/**
 * Get relative path from a source file to its content
 */
export function getRelativePath(uri: vscode.Uri, config: TranslateProjectConfig): string {
  const ws = vscode.workspace.getWorkspaceFolder(uri);
  if (!ws) {
    throw new Error(`No workspace found for ${uri.fsPath}`);
  }

  // Ensure we have fsPath property
  const wsPath = ws.uri.fsPath || ws.uri.path;
  if (!wsPath) {
    throw new Error(`Workspace folder URI has no path: ${JSON.stringify(ws.uri)}`);
  }

  // Find which source path this file is in
  const sourcePath = findSourcePathForFile(uri, config);
  if (!sourcePath) {
    throw new Error(`File ${uri.fsPath} is not in any of the configured source paths.`);
  }

  // Source roots are derived from sourcePaths directly from workspace root.
  const basePath = getSourceBasePath(wsPath, config);

  // Get source folder path
  const sourceFolderPath = path.join(basePath, sourcePath);

  return path.relative(sourceFolderPath, uri.fsPath);
}

/**
 * Create URI for a translated output file based on configuration
 */
export function createTargetUri(
  ws: vscode.WorkspaceFolder,
  sourceLocale: string,
  targetLocale: string,
  rel: string,
  config: TranslateProjectConfig,
  sourcePath: string
): vscode.Uri {
  if (!ws || !ws.uri) {
    throw new Error(`Invalid or missing workspace folder`);
  }

  // If source and target locales are the same, we should error to prevent overwriting source files
  if (sourceLocale.toLowerCase() === targetLocale.toLowerCase()) {
    throw new Error(`Target locale "${targetLocale}" is the same as source locale "${sourceLocale}". This would overwrite source files.`);
  }

  // Check if source path contains the locale
  if (!containsLocale(sourcePath, sourceLocale)) {
    // If source path doesn't contain locale, fall back to default i18n/{locale} structure
    const basePath = getTargetBasePath(ws.uri.fsPath, config);
    const fullPath = path.join(basePath, 'i18n', targetLocale, rel);
    return vscode.Uri.file(fullPath);
  }

  // Replace source locale with target locale in the path
  const targetPath = replaceLocaleInPath(sourcePath, sourceLocale, targetLocale);

  // Verify the target path is actually different from the source path
  if (normalizePath(targetPath) === normalizePath(sourcePath)) {
    throw new Error(`Target path "${targetPath}" is the same as source path "${sourcePath}". This would overwrite source files.`);
  }

  // Determine base path for target
  const basePath = getTargetBasePath(ws.uri.fsPath, config);

  // Check if the source path is a file (has extension)
  const isSourcePathFile = path.extname(sourcePath) !== '';

  if (isSourcePathFile) {
    // For file source paths, the target path already includes the filename
    const fullPath = path.join(basePath, targetPath);
    return vscode.Uri.file(fullPath);
  } else {
    // For directory source paths, append the relative path
    const fullPath = path.join(basePath, targetPath, rel);
    return vscode.Uri.file(fullPath);
  }
}

/**
 * Create URI for back-translation output file
 */
export function createBackTranslationUri(
  ws: vscode.WorkspaceFolder,
  locale: string,
  rel: string,
  config: TranslateProjectConfig,
  sourcePath?: string
): vscode.Uri {
  if (!ws || !ws.uri) {
    throw new Error(`Invalid or missing workspace folder`);
  }

  // Determine if source is file-based by checking if sourcePath has extension
  const isSourcePathFile = sourcePath ? path.extname(sourcePath) !== '' : false;

  // Back-translation targets are computed from source paths at workspace root.
  if (isSourcePathFile) {
    // For file sources: i18n/{locale}_en.json
    return vscode.Uri.joinPath(ws.uri, 'i18n', `${locale}_en.json`);
  } else {
    // For directory sources: i18n/{locale}_en/{relativePath}
    return vscode.Uri.joinPath(ws.uri, 'i18n', `${locale}_en`, rel);
  }
}

/**
 * Utility function to verify if a file is in any of the configured source paths
 * Can be called for debugging
 */
export function verifyFilePath(uri: vscode.Uri, config: TranslateProjectConfig): void {
  const ws = vscode.workspace.getWorkspaceFolder(uri)
  if (!ws) {
    console.log(`No workspace found for ${uri.fsPath || uri.path}`)
    return
  }

  // Handle both fsPath and path properties to work with tests
  const wsPath = ws.uri.fsPath || ws.uri.path;
  if (!wsPath) {
    console.log(`Workspace has no path: ${JSON.stringify(ws.uri)}`)
    return;
  }

  const uriPath = uri.fsPath || uri.path;
  if (!uriPath) {
    console.log(`URI has no path: ${JSON.stringify(uri)}`)
    return;
  }

  const normalizedUriPath = normalizePath(uriPath);

  console.log(`Verification for file: ${uriPath}`)
  console.log(`Normalized path: ${normalizedUriPath}`)
  console.log(`Workspace path: ${wsPath}`)
  console.log('Source directory: (ignored)')
  console.log('Target directory: (ignored)')
  console.log(`Source paths:`, config.sourcePaths)
  console.log(`Source locale: ${config.sourceLocale}`)

  // Calculate base path rooted at workspace
  const basePath = getSourceBasePath(wsPath, config);

  console.log(`Base path for source: ${basePath}`)

  for (const sourcePath of config.sourcePaths) {
    const fullSourcePath = normalizePath(path.join(basePath, sourcePath))
    console.log(`Checking path ${sourcePath}: ${fullSourcePath}`)
    console.log(`Is file in path? ${normalizedUriPath.startsWith(fullSourcePath)}`)
    console.log(`Contains source locale? ${containsLocale(sourcePath, config.sourceLocale)}`)
  }
}
