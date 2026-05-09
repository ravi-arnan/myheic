import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import logoSrc from './assets/myheic_logo.png'
import { useTheme } from './useTheme'

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

function qualityLabel(q: number): string {
  if (q >= 95) return 'Maksimum'
  if (q >= 85) return 'Tinggi'
  if (q >= 70) return 'Disarankan'
  if (q >= 50) return 'Hemat'
  return 'Rendah'
}

function App(): React.JSX.Element {
  const [files, setFiles] = useState<FileItem[]>([])
  const [outputDir, setOutputDir] = useState<string | null>(null)
  const [quality, setQuality] = useState(80)
  const [isConverting, setIsConverting] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const dragCounter = useRef(0)
  const { theme, toggle } = useTheme()

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

  useEffect(() => {
    const onDragEnter = (e: DragEvent): void => {
      e.preventDefault()
      dragCounter.current += 1
      const types = e.dataTransfer?.types ?? []
      if (Array.from(types).includes('Files')) {
        setIsDragging(true)
      }
    }
    const onDragOver = (e: DragEvent): void => {
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    const onDragLeave = (e: DragEvent): void => {
      e.preventDefault()
      dragCounter.current -= 1
      if (dragCounter.current <= 0) {
        dragCounter.current = 0
        setIsDragging(false)
      }
    }
    const onDrop = (e: DragEvent): void => {
      e.preventDefault()
      dragCounter.current = 0
      setIsDragging(false)
      const dropped = Array.from(e.dataTransfer?.files ?? [])
      const paths = dropped
        .map((f) => {
          try {
            return window.api.getPathForFile(f)
          } catch (err) {
            console.error('[getPathForFile failed]', err)
            return ''
          }
        })
        .filter((p): p is string => Boolean(p))
      if (paths.length > 0) addFiles(paths)
    }

    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [addFiles])

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
    return { total, done, errors }
  }, [files])

  const canConvert = files.some((f) => f.status === 'pending' || f.status === 'error')

  return (
    <div className="flex h-full flex-col bg-[color:var(--color-surface)] text-[color:var(--color-ink)]">
      <header className="flex items-center justify-between border-b border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-6 py-4">
        <div className="flex items-center gap-3">
          <img src={logoSrc} alt="" className="h-9 w-9" draggable={false} />
          <div>
            <h1 className="text-base font-bold leading-tight tracking-tight">MyHeic</h1>
            <p className="text-xs text-[color:var(--color-ink-muted)]">
              Konversi HEIC ke JPG — gratis, offline, tanpa batas
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] text-[color:var(--color-ink-muted)] transition-colors hover:border-[color:var(--color-ink-soft)] hover:text-[color:var(--color-ink)]"
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
          <span className="text-xs font-medium tabular-nums text-[color:var(--color-ink-soft)]">
            v0.1.5
          </span>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-4 overflow-hidden p-6">
        <div
          className={`flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 transition-colors ${
            isDragging
              ? 'border-[color:var(--color-brand)] bg-[color:var(--color-brand-subtle)]'
              : 'border-[color:var(--color-line)] bg-[color:var(--color-surface-soft)] hover:border-[color:var(--color-ink-soft)]'
          }`}
        >
          <UploadGlyph
            className={
              isDragging
                ? 'text-[color:var(--color-brand)]'
                : 'text-[color:var(--color-ink-soft)]'
            }
          />
          <div className="text-sm font-semibold text-[color:var(--color-ink)]">
            {isDragging ? 'Lepaskan untuk upload' : 'Drag & drop file HEIC ke sini'}
          </div>
          <div className="text-xs text-[color:var(--color-ink-soft)]">atau</div>
          <button
            onClick={handlePick}
            className="rounded-xl bg-[color:var(--color-brand)] px-4 py-2 text-sm font-semibold text-white shadow-[var(--shadow-cta)] transition-colors hover:bg-[color:var(--color-brand-dark)]"
          >
            Pilih file
          </button>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] shadow-[var(--shadow-whisper)]">
          <div className="flex items-center justify-between border-b border-[color:var(--color-line)] bg-[color:var(--color-surface-soft)] px-4 py-2.5 text-xs font-medium text-[color:var(--color-ink-muted)]">
            <div>
              {files.length === 0
                ? 'Belum ada file'
                : `${files.length} file · ${stats.done} selesai${stats.errors > 0 ? ` · ${stats.errors} error` : ''}`}
            </div>
            {files.length > 0 && (
              <button
                onClick={handleClear}
                disabled={isConverting}
                className="text-[color:var(--color-ink-soft)] transition-colors hover:text-[color:var(--color-ink)] disabled:opacity-40"
              >
                Hapus semua
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {files.length === 0 ? (
              <div className="flex h-full items-center justify-center p-8 text-sm text-[color:var(--color-ink-soft)]">
                Tambahkan file untuk mulai konversi.
              </div>
            ) : (
              <ul className="divide-y divide-[color:var(--color-line)]">
                {files.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center gap-3 px-4 py-3 text-sm"
                  >
                    <StatusBadge status={f.status} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-[color:var(--color-ink)]">
                        {f.name}
                      </div>
                      <div className="truncate text-xs text-[color:var(--color-ink-soft)]">
                        {f.status === 'done'
                          ? `${formatBytes(f.inputBytes)} → ${formatBytes(f.outputBytes)}${
                              f.inputBytes && f.outputBytes
                                ? ` (${(f.outputBytes / f.inputBytes).toFixed(1)}x)`
                                : ''
                            }`
                          : f.status === 'error'
                            ? f.error ?? 'Gagal konversi'
                            : f.inputPath}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemove(f.id)}
                      disabled={isConverting && f.status === 'converting'}
                      className="text-[color:var(--color-ink-soft)] transition-colors hover:text-[color:var(--color-ink)] disabled:opacity-40"
                      aria-label="Hapus"
                    >
                      <CloseIcon />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </main>

      <footer className="flex flex-wrap items-center gap-4 border-t border-[color:var(--color-line)] bg-[color:var(--color-surface-soft)] px-6 py-4">
        <div className="flex items-center gap-2">
          <span
            className="cursor-help text-xs font-medium text-[color:var(--color-ink-muted)]"
            title="JPG selalu lebih besar dari HEIC karena kompresi HEIC (HEVC) lebih efisien. Slider ini cuma kontrol kualitas/ukuran JPG-nya, bukan untuk match ukuran HEIC asal. Disarankan 75-85 untuk balance terbaik."
          >
            Quality ⓘ
          </span>
          <input
            type="range"
            min={10}
            max={100}
            step={1}
            value={quality}
            onChange={(e) => setQuality(Number(e.target.value))}
            disabled={isConverting}
            className="w-32 accent-[color:var(--color-brand)]"
          />
          <span className="w-8 text-xs font-semibold tabular-nums text-[color:var(--color-ink)]">
            {quality}
          </span>
          <span className="text-[10px] font-medium uppercase tracking-wide text-[color:var(--color-ink-soft)]">
            {qualityLabel(quality)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-[color:var(--color-ink-muted)]">
            Output
          </label>
          {outputDir ? (
            <div className="flex items-center gap-1">
              <span
                className="max-w-[260px] truncate rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-2 py-1 text-xs text-[color:var(--color-ink)]"
                title={outputDir}
              >
                {outputDir}
              </span>
              <button
                onClick={handleClearOutput}
                disabled={isConverting}
                className="text-xs text-[color:var(--color-ink-soft)] transition-colors hover:text-[color:var(--color-ink)] disabled:opacity-40"
              >
                ×
              </button>
            </div>
          ) : (
            <button
              onClick={handlePickOutput}
              disabled={isConverting}
              className="rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-2 py-1 text-xs font-medium text-[color:var(--color-ink)] transition-colors hover:border-[color:var(--color-ink-soft)] disabled:opacity-40"
            >
              Folder asal
            </button>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {stats.done > 0 && (
            <button
              onClick={handleOpenOutput}
              className="rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-4 py-2 text-sm font-semibold text-[color:var(--color-ink)] transition-colors hover:border-[color:var(--color-ink-soft)]"
            >
              Buka folder
            </button>
          )}
          <button
            onClick={handleConvertAll}
            disabled={!canConvert || isConverting}
            className="rounded-xl bg-[color:var(--color-brand)] px-5 py-2 text-sm font-semibold text-white shadow-[var(--shadow-cta)] transition-colors hover:bg-[color:var(--color-brand-dark)] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
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
    pending: {
      label: 'Pending',
      className: 'bg-[color:var(--color-line-soft)] text-[color:var(--color-ink-muted)]'
    },
    converting: {
      label: 'Converting',
      className: 'bg-[color:var(--color-warning-bg)] text-[color:var(--color-warning-ink)]'
    },
    done: {
      label: 'Done',
      className: 'bg-[color:var(--color-success-bg)] text-[color:var(--color-success-ink)]'
    },
    error: {
      label: 'Error',
      className: 'bg-[color:var(--color-danger-bg)] text-[color:var(--color-danger-ink)]'
    }
  }
  const item = map[status]
  return (
    <span
      className={`inline-flex h-5 w-20 items-center justify-center rounded-full text-[10px] font-semibold uppercase tracking-wide ${item.className}`}
    >
      {item.label}
    </span>
  )
}

function UploadGlyph({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}

function CloseIcon(): React.JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function SunIcon(): React.JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  )
}

function MoonIcon(): React.JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

export default App
