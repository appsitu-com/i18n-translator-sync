import * as path from 'path'
import { FileSystem, IUri } from './fs'
import { TranslateProjectConfig } from '../coreConfig'
import { normalizePath, containsLocale, replaceLocaleInPath, replaceLocaleInPathForBackTranslation } from './pathShared'

// Re-export shared utilities for backward compatibility
export { normalizePath, containsLocale, replaceLocaleInPath, replaceLocaleInPathForBackTranslation }

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

  // First pass: Check for exact file matches
  for (const sourcePath of config.sourcePaths) {
    const fullSourcePath = normalizePath(path.join(basePath, sourcePath));

    // Exact file match
    if (normalizedFilePath === fullSourcePath) {
      if (containsLocale(sourcePath, config.sourceLocale)) {
        return sourcePath;
      }
    }
  }

  // Second pass: Check for directory containment
  for (const sourcePath of config.sourcePaths) {
    const fullSourcePath = normalizePath(path.join(basePath, sourcePath));

    // Directory containment (file must be inside directory and path separator must follow)
    if (normalizedFilePath.startsWith(fullSourcePath + '/')) {
      if (containsLocale(sourcePath, config.sourceLocale)) {
        return sourcePath;
      }
    }
  }

  return null;
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

  if (isSourcePathFile) {
    // If source path is a file, return just the filename
    const result = path.basename(filePath);
    return result;
  } else {
    // If source path is a directory, calculate relative path from that directory
    const sourceFolderPath = path.join(basePath, sourcePath);
    const result = path.relative(sourceFolderPath, filePath);
    return result.replace(/\\/g, '/');
  }
}

/**
 * Create path for a translated output file based on configuration
 * @param translationSourceLocale - The locale we're translating FROM
 * @param translationTargetLocale - The locale we're translating TO
 */
export function createTargetPath(
  workspacePath: string,
  translationSourceLocale: string,
  translationTargetLocale: string,
  relativePath: string,
  config: TranslateProjectConfig,
  sourcePath: string
): string {
  // If source and target locales are the same, we should error to prevent overwriting source files
  if (translationSourceLocale.toLowerCase() === translationTargetLocale.toLowerCase()) {
    throw new Error(`Translation target locale "${translationTargetLocale}" is the same as translation source locale "${translationSourceLocale}". This would overwrite source files.`);
  }

  // Replace translation source locale with translation target locale in the path
  const targetPath = replaceLocaleInPath(sourcePath, translationSourceLocale, translationTargetLocale);

  // Verify the target path is actually different from the source path
  if (normalizePath(targetPath) === normalizePath(sourcePath)) {
    throw new Error(`Target path "${targetPath}" is the same as source path "${sourcePath}". This would overwrite source files.`);
  }

  // Also check any non-matching paths for problems - they should contain a locale to be valid
  if (!containsLocale(sourcePath, translationSourceLocale)) {
    throw new Error(`Source path "${sourcePath}" doesn't contain the translation source locale "${translationSourceLocale}". Unable to determine proper target path.`);
  }

  // Determine base path for target
  const basePath = getTargetBasePath(workspacePath, config);

  // Check if the source path is a file (has extension)
  const isSourcePathFile = path.extname(sourcePath) !== '';

  if (isSourcePathFile) {
    // For file source paths, the translation target path already includes the filename
    const result = path.join(basePath, targetPath);
    return result.replace(/\\/g, '/');
  } else {
    // For directory source paths, append the relative path
    const result = path.join(basePath, targetPath, relativePath);
    return result.replace(/\\/g, '/');
  }
}

/**
 * Create path for back-translation output file
 * Back translation uses the same path structure as the source, but replaces
 * the source locale with forwardTranslationTargetLocale_backTranslationTargetLocale.
 * Example: i18n/en/messages.json → i18n/fr_en/messages.json (where fr was translation target, en is back translation target)
 *
 * @param workspacePath - Root workspace path
 * @param forwardTranslationTargetLocale - The locale we translated TO in forward translation (e.g., "fr")
 * @param relativePath - Relative path of the file within the source directory
 * @param config - Translation configuration (contains sourceLocale = back translation target)
 * @param sourcePath - Original source path pattern (e.g., "i18n/en" or "i18n/en.json")
 */
export function createBackTranslationPath(
  workspacePath: string,
  forwardTranslationTargetLocale: string,
  relativePath: string,
  config: TranslateProjectConfig,
  sourcePath?: string
): string {
  if (!sourcePath) {
    throw new Error('sourcePath is required for createBackTranslationPath');
  }

  const backTranslationTargetLocale = config.sourceLocale;

  // Replace source locale with forwardTranslationTargetLocale_backTranslationTargetLocale in the source path
  const backTranslationSourcePath = replaceLocaleInPathForBackTranslation(
    sourcePath,
    backTranslationTargetLocale,
    forwardTranslationTargetLocale
  );

  // Determine base path for back translation
  const basePath = config.targetDir ?
    path.join(workspacePath, config.targetDir) :
    workspacePath;

  // Check if the source path is a file (has extension)
  const isSourcePathFile = path.extname(sourcePath) !== '';

  let result: string;
  if (isSourcePathFile) {
    // For file source paths, the back translation path already includes the filename
    result = path.join(basePath, backTranslationSourcePath);
  } else {
    // For directory source paths, append the relative path
    result = path.join(basePath, backTranslationSourcePath, relativePath);
  }

  return result.replace(/\\/g, '/');
}

/**
 * Create URI for a translated output file based on configuration
 * @param translationSourceLocale - The locale we're translating FROM
 * @param translationTargetLocale - The locale we're translating TO
 */
export function createTargetUri(
  fs: FileSystem,
  workspacePath: string,
  translationSourceLocale: string,
  translationTargetLocale: string,
  relativePath: string,
  config: TranslateProjectConfig,
  sourcePath: string
): IUri {
  const targetPath = createTargetPath(
    workspacePath,
    translationSourceLocale,
    translationTargetLocale,
    relativePath,
    config,
    sourcePath
  );

  return fs.createUri(targetPath);
}

/**
 * Create URI for back-translation output file
 * @param forwardTranslationTargetLocale - The locale we translated TO in forward translation
 */
export function createBackTranslationUri(
  fs: FileSystem,
  workspacePath: string,
  forwardTranslationTargetLocale: string,
  relativePath: string,
  config: TranslateProjectConfig,
  sourcePath?: string
): IUri {
  const backTranslationPath = createBackTranslationPath(
    workspacePath,
    forwardTranslationTargetLocale,
    relativePath,
    config,
    sourcePath
  );

  return fs.createUri(backTranslationPath);
}