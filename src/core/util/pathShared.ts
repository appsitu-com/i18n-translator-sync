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