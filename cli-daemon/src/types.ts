// ============================================================================
// TypeScript Types and Interfaces
// ============================================================================

export interface FileEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  lastModified?: number
  children?: FileEntry[]
}

export interface SketchInfo {
  valid: boolean
  error?: string
  mainFile?: string
  files?: string[]
  sketchName?: string
}
