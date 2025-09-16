import * as vscode from 'vscode'
import { IUri } from './core/util/fs'
import { loadContextCsvForJson as loadContextCsvCore } from './core/contextCsv'
import { vsCodeFileSystem, toIUri, toVSCodeUri } from './vscode/filesystem'

export type ContextCsv = {
  map: Record<string, string>
  stats: { duplicates: string[]; emptyValues: string[]; fileUri?: vscode.Uri }
}

/**
 * VS Code specific implementation that uses the core implementation
 */
export async function loadContextCsvForJson(jsonUri: vscode.Uri): Promise<ContextCsv> {
  // Convert VS Code URI to IUri
  const iuri = toIUri(jsonUri)

  // Use the core implementation
  const result = await loadContextCsvCore(vsCodeFileSystem, iuri)

  // Convert the result back to VS Code types
  return {
    map: result.map,
    stats: {
      duplicates: result.stats.duplicates,
      emptyValues: result.stats.emptyValues,
      fileUri: result.stats.fileUri ? toVSCodeUri(result.stats.fileUri) : undefined
    }
  }
}
