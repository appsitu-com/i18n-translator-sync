import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadContextCsvForJson } from '../../src/core/contextCsv';
import { FileSystem, IUri } from '../../src/core/util/fs';

describe('Core contextCsv', () => {
  let mockFileSystem: FileSystem;
  let csvUri: IUri;
  let jsonUri: IUri;

  beforeEach(() => {
    // Create mock file system
    mockFileSystem = {
      readFile: vi.fn(),
      writeFile: vi.fn(),
      deleteFile: vi.fn(),
      fileExists: vi.fn(),
      createDirectory: vi.fn(),
      readDirectory: vi.fn(),
      createUri: vi.fn((path) => ({ fsPath: path, scheme: 'file', path })),
      joinPath: vi.fn(),
      stat: vi.fn(),
      isDirectory: vi.fn().mockResolvedValue(false),
    };

    // Mock URIs
    jsonUri = { fsPath: '/test/file.json', scheme: 'file', path: '/test/file.json' };
    csvUri = { fsPath: '/test/file.csv', scheme: 'file', path: '/test/file.csv' };

    // Setup createUri mock to return the csvUri for the CSV path
    vi.mocked(mockFileSystem.createUri).mockImplementation((path) => {
      if (path === '/test/file.csv') {
        return csvUri;
      }
      return { fsPath: path, scheme: 'file', path };
    });

    // Setup fileExists to return true for the CSV file
    vi.mocked(mockFileSystem.fileExists).mockResolvedValue(true);
  });

  it('should load CSV with header and collect duplicates/empties', async () => {
    const csvContent = [
      'path,context',
      'buttons.save,button',
      'buttons.save,button', // duplicate
      'menu.file,' // empty value
    ].join('\n');

    // Mock readFile to return the test CSV content
    vi.mocked(mockFileSystem.readFile).mockResolvedValue(csvContent);

    const result = await loadContextCsvForJson(mockFileSystem, jsonUri);

    // Verify the CSV was loaded properly
    expect(result.map['buttons.save']).toBe('button');
    expect(result.stats.duplicates).toContain('buttons.save');
    expect(result.stats.emptyValues).toContain('menu.file');

    // Verify the file operations
    expect(mockFileSystem.createUri).toHaveBeenCalledWith('/test/file.csv');
    expect(mockFileSystem.fileExists).toHaveBeenCalledWith(csvUri);
    expect(mockFileSystem.readFile).toHaveBeenCalledWith(csvUri);
  });

  it('should return empty result if file does not exist', async () => {
    // Mock fileExists to return false (file doesn't exist)
    vi.mocked(mockFileSystem.fileExists).mockResolvedValue(false);

    const result = await loadContextCsvForJson(mockFileSystem, jsonUri);

    // Should return empty map and stats
    expect(Object.keys(result.map).length).toBe(0);
    expect(result.stats.duplicates).toHaveLength(0);
    expect(result.stats.emptyValues).toHaveLength(0);

    // File should not be read if it doesn't exist
    expect(mockFileSystem.readFile).not.toHaveBeenCalled();
  });

  it('should handle empty CSV content', async () => {
    // Mock readFile to return empty string
    vi.mocked(mockFileSystem.readFile).mockResolvedValue('');

    const result = await loadContextCsvForJson(mockFileSystem, jsonUri);

    // Should return empty map and stats
    expect(Object.keys(result.map).length).toBe(0);
    expect(result.stats.duplicates).toHaveLength(0);
    expect(result.stats.emptyValues).toHaveLength(0);
  });

  it('should handle CSV parsing edge cases', async () => {
    const csvContent = [
      'path,context',
      '"quoted,path",context with spaces',
      '"path.with.""quotes"""," context with ""quotes"" "',
      'incomplete.line'
    ].join('\n');

    // Mock readFile to return the CSV content with quoted values
    vi.mocked(mockFileSystem.readFile).mockResolvedValue(csvContent);

    const result = await loadContextCsvForJson(mockFileSystem, jsonUri);

    // Verify CSV parsing handled quotes correctly
    expect(result.map['quoted,path']).toBe('context with spaces');
    expect(result.map['path.with."quotes"']).toBe(' context with "quotes" ');

    // Incomplete line should be skipped
    expect(result.map['incomplete.line']).toBeUndefined();
  });
});