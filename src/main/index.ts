import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join, parse } from 'path'
import { promises as fs } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import convert from 'heic-convert'
import icon from '../../resources/icon.png?asset'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 720,
    minWidth: 720,
    minHeight: 520,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0f172a',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

async function uniqueOutputPath(dir: string, baseName: string, ext: string): Promise<string> {
  let candidate = join(dir, `${baseName}${ext}`)
  let counter = 1
  while (true) {
    try {
      await fs.access(candidate)
      candidate = join(dir, `${baseName} (${counter})${ext}`)
      counter += 1
    } catch {
      return candidate
    }
  }
}

ipcMain.handle('dialog:openFiles', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Pilih file HEIC',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'HEIC Images', extensions: ['heic', 'heif', 'HEIC', 'HEIF'] }]
  })
  if (result.canceled) return []
  return result.filePaths
})

ipcMain.handle('dialog:openDirectory', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Pilih folder output',
    properties: ['openDirectory', 'createDirectory']
  })
  if (result.canceled) return null
  return result.filePaths[0] ?? null
})

ipcMain.handle('shell:openPath', async (_event, target: string) => {
  await shell.openPath(target)
})

interface ConvertOptions {
  inputPath: string
  outputDir?: string
  quality?: number
}

interface ConvertResult {
  inputPath: string
  outputPath: string
  inputBytes: number
  outputBytes: number
}

ipcMain.handle(
  'convert:heic',
  async (_event, options: ConvertOptions): Promise<ConvertResult> => {
    const { inputPath } = options
    const quality = Math.min(Math.max(options.quality ?? 0.9, 0.1), 1)

    const parsed = parse(inputPath)
    const outDir = options.outputDir ?? parsed.dir
    await fs.mkdir(outDir, { recursive: true })

    const inputBuffer = await fs.readFile(inputPath)
    const outputBuffer = await convert({
      buffer: inputBuffer as unknown as ArrayBufferLike,
      format: 'JPEG',
      quality
    })

    const outputPath = await uniqueOutputPath(outDir, parsed.name, '.jpg')
    await fs.writeFile(outputPath, Buffer.from(outputBuffer))

    return {
      inputPath,
      outputPath,
      inputBytes: inputBuffer.byteLength,
      outputBytes: outputBuffer.byteLength
    }
  }
)

app.whenReady().then(() => {
  electronApp.setAppUserModelId('app.myheic.desktop')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
