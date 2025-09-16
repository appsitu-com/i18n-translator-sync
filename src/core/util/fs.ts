import * as fs from 'fs/promises'
import * as path from 'path'

/**
 * Platform-agnostic URI representation
 */
export interface IUri {
  /**
   * The file system path
   */
  fsPath: string

  /**
   * The scheme (e.g., 'file', 'untitled')
   */
  scheme: string

  /**
   * File path with appropriate separators for the platform
   */
  path: string
}

/**
 * File system operations interface
 * This provides a common abstraction layer that can be implemented
 * for both VSCode and Node.js environments
 */
export interface FileSystem {
  /**
   * Read file content as string
   */
  readFile(uri: IUri): Promise<string>

  /**
   * Write string content to a file
   */
  writeFile(uri: IUri, content: string): Promise<void>

  /**
   * Delete a file
   */
  deleteFile(uri: IUri, options?: { recursive?: boolean; useTrash?: boolean }): Promise<void>

  /**
   * Check if a file exists
   */
  fileExists(uri: IUri): Promise<boolean>

  /**
   * Create a directory and any parent directories that don't exist
   */
  createDirectory(uri: IUri): Promise<void>

  /**
   * Read directory contents
   */
  readDirectory(uri: IUri): Promise<Array<{ name: string; isDirectory: boolean }>>

  /**
   * Create a URI object from a file path
   */
  createUri(fsPath: string): IUri

  /**
   * Join a URI with a path segment
   */
  joinPath(uri: IUri, ...pathSegments: string[]): IUri
}

/**
 * Node.js file system implementation
 */
export class NodeFileSystem implements FileSystem {
  async readFile(uri: IUri): Promise<string> {
    return fs.readFile(uri.fsPath, { encoding: 'utf8' })
  }

  async writeFile(uri: IUri, content: string): Promise<void> {
    const dirPath = path.dirname(uri.fsPath)
    await this.ensureDirectoryExists(dirPath)
    return fs.writeFile(uri.fsPath, content, { encoding: 'utf8' })
  }

  async deleteFile(uri: IUri, options?: { recursive?: boolean; useTrash?: boolean }): Promise<void> {
    try {
      if (options?.recursive) {
        return fs.rm(uri.fsPath, { recursive: true, force: true })
      } else {
        return fs.unlink(uri.fsPath)
      }
    } catch (error) {
      // Ignore if file doesn't exist
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }
  }

  async fileExists(uri: IUri): Promise<boolean> {
    try {
      await fs.access(uri.fsPath)
      return true
    } catch {
      return false
    }
  }

  async createDirectory(uri: IUri): Promise<void> {
    await fs.mkdir(uri.fsPath, { recursive: true })
  }

  async readDirectory(uri: IUri): Promise<Array<{ name: string; isDirectory: boolean }>> {
    const entries = await fs.readdir(uri.fsPath, { withFileTypes: true })
    return entries.map(entry => ({
      name: entry.name,
      isDirectory: entry.isDirectory()
    }))
  }

  createUri(fsPath: string): IUri {
    return {
      fsPath,
      scheme: 'file',
      path: fsPath.replace(/\\/g, '/'),
    }
  }

  joinPath(uri: IUri, ...pathSegments: string[]): IUri {
    const joined = path.join(uri.fsPath, ...pathSegments)
    return this.createUri(joined)
  }

  // Helper method for creating directories if they don't exist
  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true })
    } catch (error) {
      // Ignore if directory already exists
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error
      }
    }
  }
}

// Singleton instance for Node.js file system
export const nodeFileSystem = new NodeFileSystem()