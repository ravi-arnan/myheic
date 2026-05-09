import { useCallback, useMemo, useRef, useState } from 'react'

type FileStatus = 'pending' | 'converting' | 'done' | 'error'

interface FileItem {
  id: string
  inputPath: string
  name: string
  status: FileStatus
  outputPath?: string
  inputBytes?: number
  outputBytes?: number
  error?: string
}

function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileNameFromPath(p: string): string {
  return p.split(/[\\/]/).pop() ?? p
}

function App(): React.JSX.Element {
  const [files, setFiles] = useState<FileItem[]>([])
  const [outputDir, setOutputDir] = useState<string | null>(null)
  const [quality, setQuality] = useState(90)
  const [isConverting, setIsConverting] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const dragCounter = useRef(0)

  const addFiles = useCallback((paths: string[]) => {
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => f.inputPath))
      const additions = paths
        .filter((p) => /\.(heic|heif)$/i.test(p))
        .filter((p) => !existing.has(p))
        .map<FileItem>((p) => ({
          id: `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          inputPath: p,
          name: fileNameFromPath(p),
          status: 'pending'
        }))
      return [...prev, ...additions]
    })
  }, [])

  const handlePick = async (): Promise<void> => {
    const paths = await window.api.selectFiles()
    addFiles(paths)
  }

  const handlePickOutput = async (): Promise<void> => {
    const dir = await window.api.selectDirectory()
    if (dir) setOutputDir(dir)
  }

  const handleClearOutput = (): void => setOutputDir(null)

  const handleRemove = (id: string): void => {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }

  const handleClear = (): void => {
    setFiles([])
  }

  const handleDragEnter = (e: React.DragEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current += 1
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current -= 1
    if (dragCounter.current <= 0) {
      dragCounter.current = 0
      setIsDragging(false)
    }
  }

  const handleDragOver = (e: React.DragEvent): void => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    dragCounter.current = 0
    const dropped = Array.from(e.dataTransfer.files)
    const paths = dropped
      .map((f) => window.api.getPathForFile(f))
      .filter((p): p is string => Boolean(p))
    addFiles(paths)
  }

  const updateFile = (id: string, patch: Partial<FileItem>): void => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  }

  const handleConvertAll = async (): Promise<void> => {
    const pending = files.filter((f) => f.status === 'pending' || f.status === 'error')
    if (pending.length === 0) return
    setIsConverting(true)
    for (const file of pending) {
      updateFile(file.id, { status: 'converting', error: undefined })
      try {
        const result = await window.api.convertHeic({
          inputPath: file.inputPath,
          outputDir: outputDir ?? undefined,
          quality: quality / 100
        })
        updateFile(file.id, {
          status: 'done',
          outputPath: result.outputPath,
          inputBytes: result.inputBytes,
          outputBytes: result.outputBytes
        })
      } catch (err) {
        updateFile(file.id, {
          status: 'error',
          error: err instanceof Error ? err.message : String(err)
        })
      }
    }
    setIsConverting(false)
  }

  const handleOpenOutput = async (): Promise<void> => {
    const target =
      outputDir ??
      (files.find((f) => f.status === 'done')?.outputPath?.replace(/[\\/][^\\/]*$/, '') ?? null)
    if (target) await window.api.openPath(target)
  }

  const stats = useMemo(() => {
    const total = files.length
    const done = files.filter((f) => f.status === 'done').length
    const errors = files.filter((f) => f.status === 'error').length
    const savedBytes = files
      .filter((f) => f.status === 'done')
      .reduce((sum, f) => sum + ((f.inputBytes ?? 0) - (f.outputBytes ?? 0)), 0)
    return { total, done, errors, savedBytes }
  }, [files])

  const canConvert = files.some((f) => f.status === 'pending' || f.status === 'error')

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 font-bold">
            M
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">MyHeic</h1>
            <p className="text-xs text-slate-400">
              Konversi HEIC ke JPG — gratis, offline, tanpa batas
            </p>
          </div>
        </div>
        <div className="text-xs text-slate-500">v0.1.0</div>
      </header>

      <main className="flex flex-1 flex-col gap-4 overflow-hidden p-6">
        <div
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className={`flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 transition-colors ${
            isDragging
              ? 'border-indigo-400 bg-indigo-500/10'
              : 'border-slate-700 bg-slate-900/50 hover:border-slate-600'
          }`}
        >
          <div className="text-base font-medium text-slate-200">
            Drag & drop file HEIC ke sini
          </div>
          <div className="text-xs text-slate-500">atau</div>
          <button
            onClick={handlePick}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            Pilih file
          </button>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2 text-xs text-slate-400">
            <div>
              {files.length === 0
                ? 'Belum ada file'
                : `${files.length} file · ${stats.done} selesai · ${stats.errors} error`}
            </div>
            {files.length > 0 && (
              <button
                onClick={handleClear}
                disabled={isConverting}
                className="text-slate-500 hover:text-slate-300 disabled:opacity-40"
              >
                Hapus semua
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {files.length === 0 ? (
              <div className="flex h-full items-center justify-center p-8 text-sm text-slate-500">
                Tambahkan file untuk mulai konversi.
              </div>
            ) : (
              <ul className="divide-y divide-slate-800">
                {files.map((f) => (
                  <li key={f.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                    <StatusBadge status={f.status} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-slate-200">{f.name}</div>
                      <div className="truncate text-xs text-slate-500">
                        {f.status === 'done'
                          ? `${formatBytes(f.inputBytes)} → ${formatBytes(f.outputBytes)}`
                          : f.status === 'error'
                            ? f.error ?? 'Gagal konversi'
                            : f.inputPath}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemove(f.id)}
                      disabled={isConverting && f.status === 'converting'}
                      className="text-xs text-slate-500 hover:text-rose-400 disabled:opacity-40"
                    >
                      Hapus
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </main>

      <footer className="flex flex-wrap items-center gap-4 border-t border-slate-800 px-6 py-4">
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400">Quality</label>
          <input
            type="range"
            min={10}
            max={100}
            step={1}
            value={quality}
            onChange={(e) => setQuality(Number(e.target.value))}
            disabled={isConverting}
            className="w-32 accent-indigo-500"
          />
          <span className="w-8 text-xs tabular-nums text-slate-300">{quality}</span>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400">Output</label>
          {outputDir ? (
            <div className="flex items-center gap-1">
              <span
                className="max-w-[260px] truncate rounded bg-slate-800 px-2 py-1 text-xs text-slate-300"
                title={outputDir}
              >
                {outputDir}
              </span>
              <button
                onClick={handleClearOutput}
                disabled={isConverting}
                className="text-xs text-slate-500 hover:text-rose-400 disabled:opacity-40"
              >
                ×
              </button>
            </div>
          ) : (
            <button
              onClick={handlePickOutput}
              disabled={isConverting}
              className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700 disabled:opacity-40"
            >
              Folder asal
            </button>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {stats.done > 0 && (
            <button
              onClick={handleOpenOutput}
              className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:border-slate-600 hover:bg-slate-800"
            >
              Buka folder
            </button>
          )}
          <button
            onClick={handleConvertAll}
            disabled={!canConvert || isConverting}
            className="rounded-md bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isConverting ? 'Converting…' : 'Convert'}
          </button>
        </div>
      </footer>
    </div>
  )
}

function StatusBadge({ status }: { status: FileStatus }): React.JSX.Element {
  const map: Record<FileStatus, { label: string; className: string }> = {
    pending: { label: 'Pending', className: 'bg-slate-700 text-slate-300' },
    converting: { label: 'Converting', className: 'bg-amber-500/20 text-amber-300' },
    done: { label: 'Done', className: 'bg-emerald-500/20 text-emerald-300' },
    error: { label: 'Error', className: 'bg-rose-500/20 text-rose-300' }
  }
  const item = map[status]
  return (
    <span
      className={`inline-flex h-6 w-20 items-center justify-center rounded-full text-[10px] font-medium uppercase tracking-wide ${item.className}`}
    >
      {item.label}
    </span>
  )
}

export default App
