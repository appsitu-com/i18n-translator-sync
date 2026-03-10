import * as path from 'path'

/**
 * Shared path utilities used across both VSCode-specific and platform-agnostic implementations
 */

/**
 * Normalize a path string for consistent comparison across platforms
 */
export function normalizePath(pathStr: string): string {
  return pathStr.replace(/\\/g, '/').toLowerCase();
}

/**
 * Convert an absolute or relative path to workspace-relative POSIX format
 * Used for storing paths in the database in a portable format
 *
 * @param filePath Absolute or relative file path
 * @param workspacePath Absolute path to workspace root
 * @returns Relative path from workspace root using forward slashes
 * @example
 * toWorkspaceRelativePosix('C:\\Users\\tony\\project\\src\\file.ts', 'C:\\Users\\tony\\project')
 * // Returns: 'src/file.ts'
 */
export function toWorkspaceRelativePosix(filePath: string, workspacePath: string): string {
  if (!filePath) return '';

  // Convert to absolute path if needed
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(workspacePath, filePath);

  // Make relative to workspace
  const relativePath = path.relative(workspacePath, absolutePath);

  // Convert backslashes to forward slashes for cross-platform consistency
  return relativePath.split(path.sep).join('/');
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
 * Replaces the translation source locale with translation target locale in a path
 * @param pathStr - The path to transform
 * @param translationSourceLocale - The locale we're translating FROM
 * @param translationTargetLocale - The locale we're translating TO
 */
export function replaceLocaleInPath(pathStr: string, translationSourceLocale: string, translationTargetLocale: string): string {
  const normalizedPath = pathStr.replace(/\\/g, '/');
  const normalizedTranslationSourceLocale = translationSourceLocale.toLowerCase();

  // Handle folder in path case
  const folderPattern = new RegExp(`/${normalizedTranslationSourceLocale}/`, 'i');
  if (folderPattern.test(normalizedPath)) {
    return normalizedPath.replace(
      folderPattern,
      `/${translationTargetLocale}/`
    );
  }

  // Handle filename case (replace basename)
  const ext = path.extname(normalizedPath);
  const dir = path.dirname(normalizedPath);
  const basename = path.basename(normalizedPath, ext);

  if (basename.toLowerCase() === normalizedTranslationSourceLocale) {
    return path.join(dir, `${translationTargetLocale}${ext}`).replace(/\\/g, '/');
  }

  // Return original if no replacement was made
  return normalizedPath;
}

/**
 * Replaces the back translation source locale with back translation target locale + "_" + back translation source locale in a path.
 * Used for back-translation paths where we reverse the translation direction.
 * Example: i18n/en/messages.json with forwardTargetLocale=fr, backSourceLocale=en → i18n/fr_en/messages.json
 * @param pathStr - The path to transform
 * @param backTranslationSourceLocale - The locale we're translating back TO (original sourceLocale)
 * @param forwardTranslationTargetLocale - The locale we translated TO in forward translation
 */
export function replaceLocaleInPathForBackTranslation(
  pathStr: string,
  backTranslationSourceLocale: string,
  forwardTranslationTargetLocale: string
): string {
  const normalizedPath = pathStr.replace(/\\/g, '/');
  const normalizedBackTranslationSourceLocale = backTranslationSourceLocale.toLowerCase();
  const backTranslationTargetLocale = `${forwardTranslationTargetLocale}_${backTranslationSourceLocale}`;

  // Handle folder in path case
  const folderPattern = new RegExp(`/${normalizedBackTranslationSourceLocale}/`, 'i');
  if (folderPattern.test(normalizedPath)) {
    return normalizedPath.replace(
      folderPattern,
      `/${backTranslationTargetLocale}/`
    );
  }

  // Handle filename case (replace basename)
  const ext = path.extname(normalizedPath);
  const dir = path.dirname(normalizedPath);
  const basename = path.basename(normalizedPath, ext);

  if (basename.toLowerCase() === normalizedBackTranslationSourceLocale) {
    return path.join(dir, `${backTranslationTargetLocale}${ext}`).replace(/\\/g, '/');
  }

  // Return original if no replacement was made
  return normalizedPath;
}