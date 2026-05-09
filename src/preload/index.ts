import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

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

const api = {
  selectFiles: (): Promise<string[]> => ipcRenderer.invoke('dialog:openFiles'),
  selectDirectory: (): Promise<string | null> => ipcRenderer.invoke('dialog:openDirectory'),
  convertHeic: (options: ConvertOptions): Promise<ConvertResult> =>
    ipcRenderer.invoke('convert:heic', options),
  openPath: (target: string): Promise<void> => ipcRenderer.invoke('shell:openPath', target),
  getPathForFile: (file: File): string => webUtils.getPathForFile(file)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
