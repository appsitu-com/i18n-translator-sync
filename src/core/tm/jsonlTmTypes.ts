export type TmEntry = {
  engine: string     // Translation engine name, for example "google", "deepl", or "copy"
  source: string     // Source locale code used for this translation, for example "en"
  target: string     // Target locale code used for this translation, for example "fr"
  sourcePath: string // Workspace-relative source root path; a file path for file-based sources or a directory path for folder-based sources
  textPos: number | string // Zero-based segment position for plain text, or a structured path such as "user.name" for JSON/YAML/TS data
  sourceText: string // Original source segment text before translation
  context: string    // Optional segment context string; usually empty, but may carry disambiguation metadata
  targetText: string // Translated text stored in the cache
  status: string     // Translation status; defaults to "ai_draft"
  updatedAt: number  // Unix timestamp in seconds when the row was last written
}

export type JsonlTmLine = { type: 'meta'; schemaVersion: number } | ({ type: 'entry' } & TmEntry)