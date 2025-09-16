import { vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Enhances the VSCode filesystem mock with sync methods needed for tests
 */
export const enhancedFileSystemMock = {
  // Existing methods from workspace.fs
  readFile: vi.fn(),
  writeFile: vi.fn(),
  delete: vi.fn(),
  stat: vi.fn(),
  readDirectory: vi.fn(),
  createDirectory: vi.fn(),

  // Additional sync methods needed for the tests
  fileExistsSync: vi.fn().mockReturnValue(true),
  directoryExistsSync: vi.fn().mockReturnValue(true),
  createDirectorySync: vi.fn(),

  // Additional methods that might be needed
  readFileSync: vi.fn().mockReturnValue('{}'),
  writeFileSync: vi.fn(),
  deleteFileSync: vi.fn()
};

export default enhancedFileSystemMock;