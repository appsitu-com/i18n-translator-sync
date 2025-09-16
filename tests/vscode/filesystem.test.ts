import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as vscode from 'vscode';
import { VSCodeFileSystem, VSCodeUri } from '../../src/vscode/filesystem';
import { IUri } from '../../src/core/util/fs';
import { FileType } from '../mocks/vscode';

// Use the actual mock implementation from tests/mocks/vscode.ts
// The mock module has already been configured with FileType enum

// For path operations
import * as path from 'path';

describe('VSCodeFileSystem', () => {
  let fileSystem: VSCodeFileSystem;

  beforeEach(() => {
    fileSystem = new VSCodeFileSystem();
    vi.resetAllMocks();
  });

  describe('VSCodeUri', () => {
    it('should wrap vscode.Uri and implement URI interface', () => {
      const vscodePath = '/path/to/file.txt';
      // Update the test to use a proper mock for vscode.Uri with all expected properties
      const vscodeUri = {
        fsPath: vscodePath,
        scheme: 'file',
        path: vscodePath,
        toString: () => `file://${vscodePath}`
      };
      const uri = new VSCodeUri(vscodeUri as any);

      expect(uri.fsPath).toBe(vscodePath);
      expect(uri.scheme).toBe('file');
      expect(uri.path).toBe(vscodePath);
      expect(uri.toString()).toBe(`file://${vscodePath}`);
      expect(uri.uri).toBe(vscodeUri);
    });
  });

  describe('File operations', () => {
    it('should read file content as string', async () => {
      const mockContent = Buffer.from('File content');
      const mockDecoder = { decode: () => 'File content' };

      // Mock TextDecoder
      global.TextDecoder = vi.fn().mockImplementation(() => mockDecoder) as any;

      // Mock VS Code readFile
      vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(mockContent);

      const uri = new VSCodeUri(vscode.Uri.file('/test.txt'));
      const content = await fileSystem.readFile(uri);

      expect(content).toBe('File content');
      expect(vscode.workspace.fs.readFile).toHaveBeenCalledWith(uri.uri);
    });

    it('should handle both URI types in readFile', async () => {
      const mockContent = Buffer.from('File content');
      const mockDecoder = { decode: () => 'File content' };

      global.TextDecoder = vi.fn().mockImplementation(() => mockDecoder) as any;
      vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(mockContent);

      // Using string URI
      const plainUri: IUri = {
        fsPath: '/test.txt',
        scheme: 'file',
        path: '/test.txt'
      };

      await fileSystem.readFile(plainUri);

      expect(vscode.workspace.fs.readFile).toHaveBeenCalledWith(
        expect.objectContaining({ fsPath: '/test.txt' })
      );
    });

    it('should write file content', async () => {
      const content = 'Content to write';
      const uri = new VSCodeUri(vscode.Uri.file('/write.txt'));

      await fileSystem.writeFile(uri, content);

      expect(vscode.workspace.fs.writeFile).toHaveBeenCalledWith(
        uri.uri,
        expect.any(Buffer)
      );
    });

    it('should delete a file', async () => {
      const uri = new VSCodeUri(vscode.Uri.file('/delete.txt'));

      await fileSystem.deleteFile(uri);

      expect(vscode.workspace.fs.delete).toHaveBeenCalledWith(uri.uri);
    });

    it('should check if a file exists', async () => {
      const uri = new VSCodeUri(vscode.Uri.file('/exists.txt'));

      // First test: file exists
      vi.mocked(vscode.workspace.fs.stat).mockResolvedValue({} as any);

      let exists = await fileSystem.fileExists(uri);
      expect(exists).toBe(true);

      // Second test: file doesn't exist
      vi.mocked(vscode.workspace.fs.stat).mockRejectedValue(new Error('Not found'));

      exists = await fileSystem.fileExists(uri);
      expect(exists).toBe(false);
    });
  });

  describe('Directory operations', () => {
    it('should read directory contents', async () => {
      const uri = new VSCodeUri(vscode.Uri.file('/dir'));

      // Mock directory entries
      const mockEntries = [
        ['file.txt', FileType.File],
        ['subdir', FileType.Directory]
      ];

      vi.mocked(vscode.workspace.fs.readDirectory).mockResolvedValue(mockEntries as any);

      const entries = await fileSystem.readDirectory(uri);

      expect(entries).toHaveLength(2);
      expect(entries[0]).toEqual({ name: 'file.txt', isDirectory: false });
      expect(entries[1]).toEqual({ name: 'subdir', isDirectory: true });
    });

    it('should create a directory', async () => {
      const uri = new VSCodeUri(vscode.Uri.file('/newdir'));

      await fileSystem.createDirectory(uri);

      expect(vscode.workspace.fs.createDirectory).toHaveBeenCalledWith(uri.uri);
    });
  });

  describe('Path operations', () => {
    it('should create a URI from path', () => {
      const uri = fileSystem.createUri('/path/to/file.txt');

      expect(uri).toBeInstanceOf(VSCodeUri);
      expect(uri.fsPath).toBe('/path/to/file.txt');
    });

    it('should join paths', () => {
      const baseUri = fileSystem.createUri('/base');
      const joinedUri = fileSystem.joinPath(baseUri, 'sub', 'file.txt');

      expect(joinedUri).toBeInstanceOf(VSCodeUri);
      expect(joinedUri.path).toBe('/base/sub/file.txt');
    });
  });
});