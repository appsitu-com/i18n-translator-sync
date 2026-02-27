import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { tmpdir } from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { NodeFileSystem, IUri } from '../../../src/core/util/fs';

function makeTmpDir(prefix = 'i18n-fs-test-') {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

describe('NodeFileSystem', () => {
  let testDir: string;
  let fileSystem: NodeFileSystem;

  beforeEach(() => {
    testDir = makeTmpDir();
    fileSystem = new NodeFileSystem();
  });

  afterEach(() => {
    try { rmSync(testDir, { recursive: true, force: true }); } catch {}
  });

  // URI tests
  describe('URI handling', () => {
    it('should create a URI object from a file path', () => {
      const filePath = path.join(testDir, 'test.txt');
      const uri = fileSystem.createUri(filePath);

      expect(uri.fsPath).toBe(filePath);
      expect(uri.scheme).toBe('file');
      expect(uri.path).toBe(filePath.replace(/\\/g, '/'));
    });

    it('should join paths correctly', () => {
      const baseUri = fileSystem.createUri(testDir);
      const joinedUri = fileSystem.joinPath(baseUri, 'folder', 'file.txt');
      const expectedPath = path.join(testDir, 'folder', 'file.txt');

      expect(joinedUri.fsPath).toBe(expectedPath);
      expect(joinedUri.path).toBe(expectedPath.replace(/\\/g, '/'));
    });
  });

  // File operations tests
  describe('File operations', () => {
    it('should read file contents as string', async () => {
      const filePath = path.join(testDir, 'readTest.txt');
      const content = 'Hello, world!';
      writeFileSync(filePath, content);

      const uri = fileSystem.createUri(filePath);
      const result = await fileSystem.readFile(uri);

      expect(result).toBe(content);
    });

    it('should write string content to a file', async () => {
      const filePath = path.join(testDir, 'writeTest.txt');
      const content = 'Test content to write';
      const uri = fileSystem.createUri(filePath);

      await fileSystem.writeFile(uri, content);
      const readBack = await fs.readFile(filePath, 'utf8');

      expect(readBack).toBe(content);
    });

    it('should delete a file', async () => {
      const filePath = path.join(testDir, 'deleteTest.txt');
      writeFileSync(filePath, 'Content to delete');
      const uri = fileSystem.createUri(filePath);

      await fileSystem.deleteFile(uri);

      const exists = await fileSystem.fileExists(uri);
      expect(exists).toBe(false);
    });

    it('should check if a file exists', async () => {
      const existingPath = path.join(testDir, 'existing.txt');
      const nonExistingPath = path.join(testDir, 'nonExisting.txt');

      writeFileSync(existingPath, 'Test content');

      expect(await fileSystem.fileExists(fileSystem.createUri(existingPath))).toBe(true);
      expect(await fileSystem.fileExists(fileSystem.createUri(nonExistingPath))).toBe(false);
    });
  });

  // Directory operations tests
  describe('Directory operations', () => {
    it('should create a directory', async () => {
      const dirPath = path.join(testDir, 'testDir');
      const uri = fileSystem.createUri(dirPath);

      await fileSystem.createDirectory(uri);

      const exists = await fs.access(dirPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('should create nested directories recursively', async () => {
      const nestedDirPath = path.join(testDir, 'parent', 'child', 'grandchild');
      const uri = fileSystem.createUri(nestedDirPath);

      await fileSystem.createDirectory(uri);

      const exists = await fs.access(nestedDirPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('should read directory contents', async () => {
      const dirPath = path.join(testDir, 'listDir');
      const filePath = path.join(dirPath, 'file.txt');
      const subDirPath = path.join(dirPath, 'subDir');

      mkdirSync(dirPath);
      writeFileSync(filePath, 'Test file');
      mkdirSync(subDirPath);

      const entries = await fileSystem.readDirectory(fileSystem.createUri(dirPath));

      expect(entries).toHaveLength(2);
      expect(entries.find((e: { name: string }) => e.name === 'file.txt')).toBeDefined();
      expect(entries.find((e: { name: string; isDirectory: boolean }) => e.name === 'file.txt')?.isDirectory).toBe(false);
      expect(entries.find((e: { name: string }) => e.name === 'subDir')).toBeDefined();
      expect(entries.find((e: { name: string; isDirectory: boolean }) => e.name === 'subDir')?.isDirectory).toBe(true);
    });

    it('should check if path is a directory', async () => {
      const dirPath = path.join(testDir, 'checkDir');
      const filePath = path.join(testDir, 'checkFile.txt');

      mkdirSync(dirPath);
      writeFileSync(filePath, 'Test file');

      // Test: path is a directory
      expect(await fileSystem.isDirectory(fileSystem.createUri(dirPath))).toBe(true);

      // Test: path is a file
      expect(await fileSystem.isDirectory(fileSystem.createUri(filePath))).toBe(false);

      // Test: path doesn't exist
      const nonExistentPath = path.join(testDir, 'nonexistent');
      expect(await fileSystem.isDirectory(fileSystem.createUri(nonExistentPath))).toBe(false);
    });
  });

  // Error handling tests
  describe('Error handling', () => {
    it('should handle file read errors gracefully', async () => {
      const nonExistentPath = path.join(testDir, 'nonexistent.txt');

      await expect(fileSystem.readFile(fileSystem.createUri(nonExistentPath)))
        .rejects.toThrow();
    });

    it('should handle directory creation errors gracefully', async () => {
      const filePath = path.join(testDir, 'notADirectory');
      writeFileSync(filePath, 'This is a file');

      // Creating a directory where a file exists should fail
      const conflictPath = path.join(filePath, 'conflictingDir');

      await expect(fileSystem.createDirectory(fileSystem.createUri(conflictPath)))
        .rejects.toThrow();
    });
  });
});