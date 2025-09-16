import * as path from 'path'
import { FileSystem, IUri } from './fs'
import { TranslateProjectConfig } from '../config'

/**
 * Normalize a path string for consistent comparison across platforms
 */
export function normalizePath(pathStr: string): string {
  return pathStr.replace(/\\/g, '/').toLowerCase();
}

/**
 * Checks if the given path contains a locale identifier
 * either as a folder name or basename (without extension)
 */
export function containsLocale(pathStr: string, locale: string): boolean {
  // Normalize paths and locale for comparison
  const normalizedPath = normalizePath(pathStr);
  const normalizedLocale = locale.toLowerCase();

  // Check if the path contains the locale as a folder name
  if (normalizedPath.includes(`/${normalizedLocale}/`)) {
    return true;
  }

  // Check if the path ends with the locale (for filenames)
  const basename = path.basename(normalizedPath, path.extname(normalizedPath)).toLowerCase();
  return basename === normalizedLocale;
}

/**
 * Replaces the source locale with target locale in a path
 */
export function replaceLocaleInPath(pathStr: string, sourceLocale: string, targetLocale: string): string {
  const normalizedPath = pathStr.replace(/\\/g, '/');
  const normalizedSourceLocale = sourceLocale.toLowerCase();

  // Handle folder in path case
  const folderPattern = new RegExp(`/${normalizedSourceLocale}/`, 'i');
  if (folderPattern.test(normalizedPath)) {
    return normalizedPath.replace(
      folderPattern,
      `/${targetLocale}/`
    );
  }

  // Handle filename case (replace basename)
  const ext = path.extname(normalizedPath);
  const dir = path.dirname(normalizedPath);
  const basename = path.basename(normalizedPath, ext);

  if (basename.toLowerCase() === normalizedSourceLocale) {
    return path.join(dir, `${targetLocale}${ext}`).replace(/\\/g, '/');
  }

  // Return original if no replacement was made
  return normalizedPath;
}

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

  for (const sourcePath of config.sourcePaths) {
    // Normalize the full source path
    const fullSourcePath = normalizePath(path.join(basePath, sourcePath))

    if (normalizedFilePath.startsWith(fullSourcePath)) {
      // Verify the path contains the source locale
      if (!containsLocale(sourcePath, config.sourceLocale)) {
        continue;
      }

      return sourcePath
    }
  }

  return null
}

/**
 * Calculate the base path for source files
 */
export function getSourceBasePath(workspacePath: string, config: TranslateProjectConfig): string {
  return config.sourceDir ?
    path.join(workspacePath, config.sourceDir) :
    workspacePath;
}

/**
 * Calculate the base path for target files
 */
export function getTargetBasePath(workspacePath: string, config: TranslateProjectConfig): string {
  return config.targetDir ?
    path.join(workspacePath, config.targetDir) :
    workspacePath;
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

  // Get source folder path
  const sourceFolderPath = path.join(basePath, sourcePath);

  return path.relative(sourceFolderPath, filePath);
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

  // Determine the source path pattern
  const sourcePath = config.sourcePaths.find(sp => containsLocale(sp, sourceLocale));

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

  // Join the base path with the modified target path and relative path
  return path.join(basePath, targetPath, relativePath);
}

/**
 * Create path for back-translation output file
 */
export function createBackTranslationPath(
  workspacePath: string,
  locale: string,
  relativePath: string,
  config: TranslateProjectConfig
): string {
  // If target directory is configured, use it for back-translation as well
  if (config.targetDir) {
    const targetBasePath = path.join(workspacePath, config.targetDir);
    return path.join(targetBasePath, 'i18n', `${locale}_en`, relativePath);
  }

  // Default behavior
  return path.join(workspacePath, 'i18n', `${locale}_en`, relativePath);
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
  config: TranslateProjectConfig
): IUri {
  const backTranslationPath = createBackTranslationPath(
    workspacePath,
    locale,
    relativePath,
    config
  );

  return fs.createUri(backTranslationPath);
}