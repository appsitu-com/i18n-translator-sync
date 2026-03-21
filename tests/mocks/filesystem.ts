import { vi } from 'vitest';
import { FileSystem, IUri } from '../../src/core/util/fs';

/**
 * Creates a mock FileSystem with the given files
 */
export function createMockFileSystem(files: Record<string, string> = {}): FileSystem {
  // Normalize all paths to use forward slashes for consistent testing
  const normalizedFiles: Record<string, string> = {};
  for (const [path, content] of Object.entries(files)) {
    normalizedFiles[path.replace(/\\/g, '/')] = content;
  }

  return {
    readFile: vi.fn().mockImplementation(async (uri: IUri): Promise<string> => {
      const normalizedPath = uri.path.replace(/\\/g, '/');
      if (normalizedPath in normalizedFiles) {
        return normalizedFiles[normalizedPath];
      }
      throw new Error(`File not found: ${normalizedPath}`);
    }),

    writeFile: vi.fn().mockImplementation(async (uri: IUri, content: string): Promise<void> => {
      const normalizedPath = uri.path.replace(/\\/g, '/');
      normalizedFiles[normalizedPath] = content;
    }),

    deleteFile: vi.fn().mockImplementation(async (uri: IUri): Promise<void> => {
      const normalizedPath = uri.path.replace(/\\/g, '/');
      delete normalizedFiles[normalizedPath];
    }),

    fileExists: vi.fn().mockImplementation(async (uri: IUri): Promise<boolean> => {
      const normalizedPath = uri.path.replace(/\\/g, '/');
      return normalizedPath in normalizedFiles;
    }),

    createDirectory: vi.fn().mockResolvedValue(undefined),

    readDirectory: vi.fn().mockImplementation(async (uri: IUri): Promise<[string, number][]> => {
      const dirPath = uri.path.replace(/\\/g, '/');
      const entries: [string, number][] = [];

      for (const filePath of Object.keys(normalizedFiles)) {
        if (filePath.startsWith(dirPath) && filePath !== dirPath) {
          const relativePath = filePath.substring(dirPath.length + 1);
          if (!relativePath.includes('/')) {
            entries.push([relativePath, 1]); // 1 for file type
          }
        }
      }

      return entries;
    }),

    stat: vi.fn().mockResolvedValue({
      isFile: true,
      isDirectory: false,
      mtime: new Date(),
      ctime: new Date(),
      size: 100
    }),

    createUri: vi.fn((path: string): IUri => ({
      path: path.replace(/\\/g, '/'),
      fsPath: path,
      scheme: 'file'
    })),

    joinPath: vi.fn((uri: IUri, ...segments: string[]): IUri => {
      const joined = [uri.path, ...segments].join('/').replace(/\/+/g, '/');
      return {
        path: joined,
        fsPath: joined,
        scheme: 'file'
      };
    }),

    isDirectory: vi.fn().mockResolvedValue(false)
  };
}