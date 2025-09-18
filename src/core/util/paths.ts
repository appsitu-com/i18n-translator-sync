import * as path from 'path'
import { FileSystem, IUri } from './fs'
import { TranslateProjectConfig } from '../config'
import { normalizePath, containsLocale, replaceLocaleInPath } from './pathShared'

// Re-export shared utilities for backward compatibility
export { normalizePath, containsLocale, replaceLocaleInPath }

/**
 * Find the source path that contains the given file
 */
export function findSourcePathForFile(
  filePath: string,
  workspacePath: string,
  config: TranslateProjectConfig
): string | null {
  // Normalize paths for consistent comparison (especially important on Windows)
  const normalizedFilePath = normalizePath(filePath);

  // Add source directory to workspace path if specified
  const basePath = config.sourceDir ?
    normalizePath(path.join(workspacePath, config.sourceDir)) :
    normalizePath(workspacePath);

  let bestMatch: string | null = null;
  let bestMatchLength = 0;

  for (const sourcePath of config.sourcePaths) {
    // Normalize the full source path
    const fullSourcePath = normalizePath(path.join(basePath, sourcePath))

    if (normalizedFilePath.startsWith(fullSourcePath)) {
      // Verify the path contains the source locale
      if (!containsLocale(sourcePath, config.sourceLocale)) {
        continue;
      }

      // Check if this is a more specific match (longer path)
      if (fullSourcePath.length > bestMatchLength) {
        bestMatch = sourcePath;
        bestMatchLength = fullSourcePath.length;
      }
    }
  }

  console.log(`DEBUG findSourcePathForFile: filePath=${filePath}, bestMatch=${bestMatch}`);
  return bestMatch;
}

/**
 * Calculate the base path for source files
 */
export function getSourceBasePath(workspacePath: string, config: TranslateProjectConfig): string {
  const result = config.sourceDir ?
    path.join(workspacePath, config.sourceDir) :
    workspacePath;
  return result.replace(/\\/g, '/');
}

/**
 * Calculate the base path for target files
 */
export function getTargetBasePath(workspacePath: string, config: TranslateProjectConfig): string {
  const result = config.targetDir ?
    path.join(workspacePath, config.targetDir) :
    workspacePath;
  return result.replace(/\\/g, '/');
}

/**
 * Get relative path from a source file to its content
 */
export function getRelativePath(
  filePath: string,
  workspacePath: string,
  config: TranslateProjectConfig
): string {
  // Find which source path this file is in
  const sourcePath = findSourcePathForFile(filePath, workspacePath, config);
  if (!sourcePath) {
    throw new Error(`File ${filePath} is not in any of the configured source paths.`);
  }

  // Get base path including sourceDir if specified
  const basePath = getSourceBasePath(workspacePath, config);

  // Check if the source path is a specific file (has extension) or a directory
  const isSourcePathFile = path.extname(sourcePath) !== '';

  console.log(`DEBUG getRelativePath: filePath=${filePath}, sourcePath=${sourcePath}, isSourcePathFile=${isSourcePathFile}`);

  if (isSourcePathFile) {
    // If source path is a file, return just the filename
    const result = path.basename(filePath);
    console.log(`DEBUG getRelativePath: returning filename=${result}`);
    return result;
  } else {
    // If source path is a directory, calculate relative path from that directory
    const sourceFolderPath = path.join(basePath, sourcePath);
    const result = path.relative(sourceFolderPath, filePath);
    console.log(`DEBUG getRelativePath: returning relative path=${result}`);
    return result.replace(/\\/g, '/');
  }
}

/**
 * Create path for a translated output file based on configuration
 */
export function createTargetPath(
  workspacePath: string,
  sourceLocale: string,
  targetLocale: string,
  relativePath: string,
  config: TranslateProjectConfig
): string {
  // If source and target locales are the same, we should error to prevent overwriting source files
  if (sourceLocale.toLowerCase() === targetLocale.toLowerCase()) {
    throw new Error(`Target locale "${targetLocale}" is the same as source locale "${sourceLocale}". This would overwrite source files.`);
  }

  // Determine the source path pattern - find the most specific match like findSourcePathForFile does
  let sourcePath: string | undefined;
  let bestMatchLength = 0;

  for (const sp of config.sourcePaths) {
    if (containsLocale(sp, sourceLocale)) {
      // For createTargetPath, we want to find the most specific pattern that could match
      // This logic should be similar to findSourcePathForFile
      if (sp.length > bestMatchLength) {
        sourcePath = sp;
        bestMatchLength = sp.length;
      }
    }
  }

  // Default target path (legacy behavior)
  if (!sourcePath) {
    // If no specific pattern is found, use the default i18n/{locale} structure
    return path.join(workspacePath, 'i18n', targetLocale, relativePath);
  }

  // Replace source locale with target locale in the path
  const targetPath = replaceLocaleInPath(sourcePath, sourceLocale, targetLocale);

  // Verify the target path is actually different from the source path
  if (normalizePath(targetPath) === normalizePath(sourcePath)) {
    throw new Error(`Target path "${targetPath}" is the same as source path "${sourcePath}". This would overwrite source files.`);
  }

  // Also check any non-matching paths for problems - they should contain a locale to be valid
  if (!containsLocale(sourcePath, sourceLocale)) {
    throw new Error(`Source path "${sourcePath}" doesn't contain the source locale "${sourceLocale}". Unable to determine proper target path.`);
  }

  // Determine base path for target
  const basePath = getTargetBasePath(workspacePath, config);

  // Check if the source path is a file (has extension)
  const isSourcePathFile = path.extname(sourcePath) !== '';

  console.log(`DEBUG createTargetPath: sourcePath=${sourcePath}, targetPath=${targetPath}, isSourcePathFile=${isSourcePathFile}, extension=${path.extname(sourcePath)}`);

  if (isSourcePathFile) {
    // For file source paths, the target path already includes the filename
    const result = path.join(basePath, targetPath);
    console.log(`DEBUG createTargetPath: file source path, returning: ${result}`);
    return result.replace(/\\/g, '/');
  } else {
    // For directory source paths, append the relative path
    const result = path.join(basePath, targetPath, relativePath);
    console.log(`DEBUG createTargetPath: directory source path, returning: ${result}`);
    return result.replace(/\\/g, '/');
  }
}

/**
 * Create path for back-translation output file
 */
export function createBackTranslationPath(
  workspacePath: string,
  locale: string,
  relativePath: string,
  config: TranslateProjectConfig,
  sourcePath?: string
): string {
  // Determine if source is file-based by checking if sourcePath has extension
  const isSourcePathFile = sourcePath ? path.extname(sourcePath) !== '' : false;

  // If target directory is configured, use it for back-translation as well
  if (config.targetDir) {
    const targetBasePath = path.join(workspacePath, config.targetDir);

    if (isSourcePathFile) {
      // For file sources: i18n/{locale}_en.json
      const result = path.join(targetBasePath, 'i18n', `${locale}_en.json`);
      return result.replace(/\\/g, '/');
    } else {
      // For directory sources: i18n/{locale}_en/{relativePath}
      const result = path.join(targetBasePath, 'i18n', `${locale}_en`, relativePath);
      return result.replace(/\\/g, '/');
    }
  }

  // Default behavior
  if (isSourcePathFile) {
    // For file sources: i18n/{locale}_en.json
    const result = path.join(workspacePath, 'i18n', `${locale}_en.json`);
    return result.replace(/\\/g, '/');
  } else {
    // For directory sources: i18n/{locale}_en/{relativePath}
    const result = path.join(workspacePath, 'i18n', `${locale}_en`, relativePath);
    return result.replace(/\\/g, '/');
  }
}

/**
 * Create URI for a translated output file based on configuration
 */
export function createTargetUri(
  fs: FileSystem,
  workspacePath: string,
  sourceLocale: string,
  targetLocale: string,
  relativePath: string,
  config: TranslateProjectConfig
): IUri {
  const targetPath = createTargetPath(
    workspacePath,
    sourceLocale,
    targetLocale,
    relativePath,
    config
  );

  return fs.createUri(targetPath);
}

/**
 * Create URI for back-translation output file
 */
export function createBackTranslationUri(
  fs: FileSystem,
  workspacePath: string,
  locale: string,
  relativePath: string,
  config: TranslateProjectConfig,
  sourcePath?: string
): IUri {
  const backTranslationPath = createBackTranslationPath(
    workspacePath,
    locale,
    relativePath,
    config,
    sourcePath
  );

  return fs.createUri(backTranslationPath);
}