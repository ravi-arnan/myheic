import { ElectronAPI } from '@electron-toolkit/preload'

export interface ConvertOptions {
  inputPath: string
  outputDir?: string
  quality?: number
}

export interface ConvertResult {
  inputPath: string
  outputPath: string
  inputBytes: number
  outputBytes: number
}

export interface MyHeicAPI {
  selectFiles: () => Promise<string[]>
  selectDirectory: () => Promise<string | null>
  convertHeic: (options: ConvertOptions) => Promise<ConvertResult>
  openPath: (target: string) => Promise<void>
  getPathForFile: (file: File) => string
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: MyHeicAPI
  }
}
