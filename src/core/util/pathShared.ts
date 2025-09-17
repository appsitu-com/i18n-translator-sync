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