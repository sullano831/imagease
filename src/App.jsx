import { useState, useCallback, useRef } from 'react'
import JSZip from 'jszip'
import { cropCover, loadImage, downloadDataURL, dataURLtoBlob, MIME_MAP, EXT_MAP } from './imageUtils'
import './App.css'

const PRESET_SIZES = [
  { name: 'hero-image-desktop', width: 1440, height: 800 },
  { name: 'hero-image-mobile', width: 375, height: 720 },
  { name: 'program-image', width: 375, height: 470 },
  { name: 'amenities-image', width: 342, height: 428 },
  { name: 'community-image', width: 300, height: 300 },
]

const THUMB_MAX = 250

function thumbDimensions(w, h) {
  const ratio = w / h
  if (w <= THUMB_MAX) return { tw: w, th: h }
  return { tw: THUMB_MAX, th: Math.round(THUMB_MAX / ratio) }
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
      <circle cx="12" cy="12" r="4.5"/>
      <line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  )
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" width="30" height="30">
      <polyline points="16 16 12 12 8 16"/>
      <line x1="12" y1="12" x2="12" y2="21"/>
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  )
}

function ImageCard({ result, format }) {
  const { tw, th } = thumbDimensions(result.width, result.height)
  const filename = `${result.name}.${EXT_MAP[format]}`

  return (
    <div className="image-card">
      <div className="thumb-wrapper" style={{ width: tw, height: th }}>
        <img src={result.dataURL} alt={result.name} style={{ width: tw, height: th, display: 'block' }} />
      </div>
      <div className="card-info">
        <span className="card-name">{result.name}</span>
        <span className="card-dims">{result.width} × {result.height} px</span>
      </div>
      <button className="btn btn-ghost btn-sm" onClick={() => downloadDataURL(result.dataURL, filename)}>
        <DownloadIcon /> Download
      </button>
    </div>
  )
}

export default function App() {
  const [darkMode, setDarkMode] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [sourceImage, setSourceImage] = useState(null)
  const [results, setResults] = useState([])
  const [customSizes, setCustomSizes] = useState([{ id: Date.now(), name: '', width: '', height: '' }])
  const [format, setFormat] = useState('webp')
  const [processing, setProcessing] = useState(false)
  const [showCustom, setShowCustom] = useState(false)
  const fileInputRef = useRef(null)

  const buildSizes = useCallback((customs) => {
    const validCustom = customs.filter(s => s.width && s.height)
    return [
      ...PRESET_SIZES,
      ...validCustom.map(s => ({
        name: s.name || `custom-${s.width}x${s.height}`,
        width: Number(s.width),
        height: Number(s.height),
      })),
    ]
  }, [])

  const runProcess = useCallback((img, sizes, mime) => {
    return sizes.map(size => ({
      name: size.name,
      width: size.width,
      height: size.height,
      dataURL: cropCover(img, size.width, size.height, mime),
    }))
  }, [])

  const handleFile = useCallback(async (file) => {
    if (!file || !file.type.startsWith('image/')) return
    setProcessing(true)
    const img = await loadImage(file)
    const src = URL.createObjectURL(file)
    setSourceImage({ file, img, src })
    const sizes = buildSizes(customSizes)
    const processed = runProcess(img, sizes, MIME_MAP[format])
    setResults(processed)
    setProcessing(false)
  }, [customSizes, format, buildSizes, runProcess])

  const onFileChange = (e) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  const onDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    handleFile(e.dataTransfer.files?.[0])
  }

  const reprocess = () => {
    if (!sourceImage) return
    setProcessing(true)
    const sizes = buildSizes(customSizes)
    const processed = runProcess(sourceImage.img, sizes, MIME_MAP[format])
    setResults(processed)
    setProcessing(false)
  }

  const handleFormatChange = (newFmt) => {
    setFormat(newFmt)
    if (!sourceImage) return
    setProcessing(true)
    const sizes = buildSizes(customSizes)
    const processed = runProcess(sourceImage.img, sizes, MIME_MAP[newFmt])
    setResults(processed)
    setProcessing(false)
  }

  const downloadAll = async () => {
    if (!results.length) return
    const zip = new JSZip()
    const ext = EXT_MAP[format]
    results.forEach(r => zip.file(`${r.name}.${ext}`, dataURLtoBlob(r.dataURL)))
    const content = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(content)
    const a = document.createElement('a')
    a.href = url; a.download = `images-${format}.zip`; a.click()
    URL.revokeObjectURL(url)
  }

  const addCustomSize = () => setCustomSizes(p => [...p, { id: Date.now(), name: '', width: '', height: '' }])
  const removeCustomSize = (id) => setCustomSizes(p => p.filter(s => s.id !== id))
  const updateCustomSize = (id, field, value) => setCustomSizes(p => p.map(s => s.id === id ? { ...s, [field]: value } : s))

  const resetApp = () => { setSourceImage(null); setResults([]) }

  return (
    <div className={`app ${darkMode ? 'dark' : ''}`}>
      <div className="orb orb1" />
      <div className="orb orb2" />
      <div className="orb orb3" />

      {/* Header */}
      <header className="app-header">
        <div className="header-inner">
          <div className="logo">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="4"/>
              <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            ImageSizer
            <span className="logo-dot" />
          </div>
          <button className="theme-toggle" onClick={() => setDarkMode(d => !d)} aria-label="Toggle theme">
            <span className={`icon-wrap ${darkMode ? 'rotate' : ''}`}>
              {darkMode ? <SunIcon /> : <MoonIcon />}
            </span>
          </button>
        </div>
      </header>

      <main className="main">

        {/* ── Upload screen ── */}
        {!sourceImage && (
          <section className="hero-section">

            <h1 className="hero-title">
              Resize &amp; Crop<br />
              <span>Images Instantly</span>
            </h1>

            <p className="hero-sub">
              Upload once. Get perfectly cropped versions for every slot — centered cover crop, zero distortion.
            </p>

            {/* Drop zone */}
            <div
              className={`upload-zone ${isDragging ? 'dragging' : ''}`}
              onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp"
                style={{ display: 'none' }} onChange={onFileChange} />
              <div className="upload-icon-wrap"><UploadIcon /></div>
              <p className="upload-label">Drop your image or <span className="upload-link">browse</span></p>
              <p className="upload-hint">JPG · PNG · WEBP</p>
            </div>

            {/* Preset chips */}
            <div className="presets-grid-hero">
              {PRESET_SIZES.map(s => (
                <div key={s.name} className="preset-chip">
                  <span className="preset-chip-name">{s.name}</span>
                  <span className="preset-chip-dim">{s.width}×{s.height}</span>
                </div>
              ))}
            </div>

            {/* Custom sizes toggle */}
            <div className="customize-section">
              <button className={`btn btn-ghost btn-sm ${showCustom ? 'active' : ''}`} onClick={() => setShowCustom(v => !v)}>
                {showCustom ? '▾' : '▸'}&nbsp; Customize Sizes
              </button>
              {showCustom && (
                <div className="custom-sizes-box">
                  {customSizes.map(s => (
                    <div key={s.id} className="custom-row">
                      <input className="input-field" placeholder="Label (optional)" value={s.name}
                        onChange={e => updateCustomSize(s.id, 'name', e.target.value)} />
                      <input className="input-field input-num" placeholder="W" type="number" min="1" value={s.width}
                        onChange={e => updateCustomSize(s.id, 'width', e.target.value)} />
                      <span className="dim-sep">×</span>
                      <input className="input-field input-num" placeholder="H" type="number" min="1" value={s.height}
                        onChange={e => updateCustomSize(s.id, 'height', e.target.value)} />
                      {customSizes.length > 1 && (
                        <button className="btn-remove" onClick={() => removeCustomSize(s.id)}>✕</button>
                      )}
                    </div>
                  ))}
                  <button className="btn btn-ghost btn-sm" onClick={addCustomSize}>+ Add another size</button>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── Results screen ── */}
        {sourceImage && (
          <section className="results-section">

            {/* Top bar */}
            <div className="results-topbar">
              <div className="source-info">
                <img src={sourceImage.src} className="source-thumb" alt="Source" />
                <div>
                  <div className="source-name">{sourceImage.file.name}</div>
                  <div className="source-dims">{sourceImage.img.naturalWidth} × {sourceImage.img.naturalHeight} px</div>
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={resetApp}>← New image</button>
            </div>

            {/* Controls */}
            <div className="controls-bar">
              <div className="format-selector">
                <label className="ctrl-label">Output format</label>
                <div className="format-pills">
                  {['webp', 'png', 'jpeg'].map(f => (
                    <button key={f} className={`format-pill ${format === f ? 'active' : ''}`}
                      onClick={() => handleFormatChange(f)}>
                      {f.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              {results.length > 0 && (
                <button className="btn btn-primary" onClick={downloadAll}>
                  <DownloadIcon /> Download All (ZIP)
                </button>
              )}
            </div>

            {/* Custom sizes panel */}
            <div className="customize-section">
              <button className={`btn btn-ghost btn-sm ${showCustom ? 'active' : ''}`} onClick={() => setShowCustom(v => !v)}>
                {showCustom ? '▾' : '▸'}&nbsp; Custom Sizes
              </button>
              {showCustom && (
                <div className="custom-sizes-box">
                  {customSizes.map(s => (
                    <div key={s.id} className="custom-row">
                      <input className="input-field" placeholder="Label (optional)" value={s.name}
                        onChange={e => updateCustomSize(s.id, 'name', e.target.value)} />
                      <input className="input-field input-num" placeholder="W" type="number" min="1" value={s.width}
                        onChange={e => updateCustomSize(s.id, 'width', e.target.value)} />
                      <span className="dim-sep">×</span>
                      <input className="input-field input-num" placeholder="H" type="number" min="1" value={s.height}
                        onChange={e => updateCustomSize(s.id, 'height', e.target.value)} />
                      {customSizes.length > 1 && (
                        <button className="btn-remove" onClick={() => removeCustomSize(s.id)}>✕</button>
                      )}
                    </div>
                  ))}
                  <div className="custom-actions">
                    <button className="btn btn-ghost btn-sm" onClick={addCustomSize}>+ Add another size</button>
                    <button className="btn btn-sm" onClick={reprocess}>Apply & Re-process</button>
                  </div>
                </div>
              )}
            </div>

            <div className="section-divider" />

            {/* Grid */}
            {processing ? (
              <div className="processing-state">
                <div className="spinner" />
                <p>Processing images…</p>
              </div>
            ) : (
              <div className="results-grid">
                {results.map(r => <ImageCard key={r.name} result={r} format={format} />)}
              </div>
            )}
          </section>
        )}
      </main>

      <footer className="app-footer">
        All processing happens in your browser — your images never leave your device.
      </footer>
    </div>
  )
}
