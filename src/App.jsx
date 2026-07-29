import { useState, useCallback, useRef } from 'react'
import JSZip from 'jszip'
import { cropCover, loadImage, downloadDataURL, dataURLtoBlob, enhanceImage, MIME_MAP, EXT_MAP } from './imageUtils'
import { aiEnhance, loadApiKeys } from './aiEnhance'
import Settings from './Settings'
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

// ── Icons ────────────────────────────────────────────────────────

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
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" width="13" height="13">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  )
}

function SparkleIcon({ size = 13 }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
      <path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5z"/>
      <path d="M5 3l.8 2.2L8 6l-2.2.8L5 9l-.8-2.2L2 6l2.2-.8z" strokeWidth="1.5"/>
      <path d="M19 15l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" strokeWidth="1.5"/>
    </svg>
  )
}

function BrainIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="13" height="13">
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-1.66z"/>
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-1.66z"/>
    </svg>
  )
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="17" height="17">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  )
}

// ── Image Card ───────────────────────────────────────────────────

function ImageCard({ result, format, mime, onEnhanced, onAiEnhanced }) {
  const [localEnhancing, setLocalEnhancing] = useState(false)
  const [aiEnhancing, setAiEnhancing] = useState(false)
  const [aiStatus, setAiStatus] = useState(null)
  const [mode, setMode] = useState('original') // 'original' | 'enhanced' | 'ai'
  const [showOriginal, setShowOriginal] = useState(false)

  const { tw, th } = thumbDimensions(result.width, result.height)

  const activeURL =
    mode === 'ai' && result.aiURL && !showOriginal ? result.aiURL
    : mode === 'enhanced' && result.enhancedURL && !showOriginal ? result.enhancedURL
    : result.dataURL

  const isEnhanced = mode !== 'original'
  const filename = `${result.name}${mode === 'ai' ? '-ai-enhanced' : mode === 'enhanced' ? '-enhanced' : ''}.${EXT_MAP[format]}`

  const handleLocalEnhance = async () => {
    if (result.enhancedURL) { setMode('enhanced'); return }
    setLocalEnhancing(true)
    const enhanced = await enhanceImage(result.dataURL, mime)
    onEnhanced(result.name, enhanced)
    setMode('enhanced')
    setLocalEnhancing(false)
  }

  const handleAiEnhance = async () => {
    const apiKeys = loadApiKeys()
    const hasKeys = Object.values(apiKeys).some(v => v?.trim())
    if (!hasKeys) {
      onAiEnhanced(result.name, null, 'NO_KEYS')
      return
    }
    if (result.aiURL) { setMode('ai'); return }
    setAiEnhancing(true)
    try {
      const { dataURL: enhanced, provider } = await aiEnhance(result.dataURL, mime, apiKeys, setAiStatus)
      onAiEnhanced(result.name, enhanced, null, provider)
      setMode('ai')
    } catch (err) {
      onAiEnhanced(result.name, null, err.message)
    }
    setAiStatus(null)
    setAiEnhancing(false)
  }

  const badge = mode === 'ai' ? { label: 'AI Enhanced', color: '#0071e3' }
    : mode === 'enhanced' ? { label: 'Enhanced', color: '#7c3aed' }
    : null

  return (
    <div className={`image-card ${isEnhanced ? 'card-enhanced' : ''}`}
      style={isEnhanced ? { '--card-glow': badge?.color } : {}}>

      {badge && (
        <div className="enhanced-badge" style={{ background: badge.color }}>
          <SparkleIcon /> {badge.label}
        </div>
      )}

      <div className="thumb-wrapper" style={{ width: tw, height: th }}>
        <img src={activeURL} alt={result.name} style={{ width: tw, height: th, display: 'block' }} />
        {isEnhanced && (
          <button
            className="compare-btn"
            onMouseDown={() => setShowOriginal(true)}
            onMouseUp={() => setShowOriginal(false)}
            onMouseLeave={() => setShowOriginal(false)}
            onTouchStart={() => setShowOriginal(true)}
            onTouchEnd={() => setShowOriginal(false)}
          >
            {showOriginal ? 'Original' : 'Hold to compare'}
          </button>
        )}
      </div>

      <div className="card-info">
        <span className="card-name">{result.name}</span>
        <span className="card-dims">{result.width} × {result.height} px</span>
      </div>

      {/* AI status while processing */}
      {aiStatus && <div className="card-ai-status"><span className="mini-spinner" />{aiStatus}</div>}

      <div className="card-actions">
        {/* Quick Enhance */}
        <button
          className={`btn btn-enhance btn-sm ${mode === 'enhanced' ? 'btn-active-mode' : ''}`}
          onClick={handleLocalEnhance}
          disabled={localEnhancing || aiEnhancing}
          title="Unsharp Mask — instant, no API"
        >
          {localEnhancing
            ? <><span className="mini-spinner" />Enhancing…</>
            : <><SparkleIcon />Quick</>}
        </button>

        {/* AI Enhance */}
        <button
          className={`btn btn-ai-enhance btn-sm ${mode === 'ai' ? 'btn-active-mode' : ''}`}
          onClick={handleAiEnhance}
          disabled={localEnhancing || aiEnhancing}
          title="Real-ESRGAN AI — requires API key"
        >
          {aiEnhancing
            ? <><span className="mini-spinner" />AI…</>
            : <><BrainIcon />AI</>}
        </button>

        {/* Reset if enhanced */}
        {isEnhanced && (
          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setMode('original')} title="Reset to original">
            ↩
          </button>
        )}

        {/* Download */}
        <button className="btn btn-ghost btn-sm" onClick={() => downloadDataURL(activeURL, filename)}>
          <DownloadIcon />
        </button>
      </div>
    </div>
  )
}

// ── Toast ────────────────────────────────────────────────────────

function Toast({ message, type = 'info', onClose }) {
  return (
    <div className={`toast toast-${type}`} onClick={onClose}>
      <span>{message}</span>
      <button className="toast-close">✕</button>
    </div>
  )
}

// ── App ──────────────────────────────────────────────────────────

export default function App() {
  const [darkMode, setDarkMode] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [sourceImage, setSourceImage] = useState(null)
  const [results, setResults] = useState([])
  const [customSizes, setCustomSizes] = useState([{ id: Date.now(), name: '', width: '', height: '' }])
  const [format, setFormat] = useState('webp')
  const [processing, setProcessing] = useState(false)
  const [enhancingAll, setEnhancingAll] = useState(false)
  const [aiEnhancingAll, setAiEnhancingAll] = useState(false)
  const [aiAllStatus, setAiAllStatus] = useState(null)
  const [showCustom, setShowCustom] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [toast, setToast] = useState(null)
  const fileInputRef = useRef(null)

  const mime = MIME_MAP[format]

  const showToast = (message, type = 'info') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }

  const buildSizes = useCallback((customs) => {
    const valid = customs.filter(s => s.width && s.height)
    return [
      ...PRESET_SIZES,
      ...valid.map(s => ({
        name: s.name || `custom-${s.width}x${s.height}`,
        width: Number(s.width),
        height: Number(s.height),
      })),
    ]
  }, [])

  const runProcess = useCallback((img, sizes, m) =>
    sizes.map(size => ({
      name: size.name,
      width: size.width,
      height: size.height,
      dataURL: cropCover(img, size.width, size.height, m),
      enhancedURL: null,
      aiURL: null,
    })), [])

  const handleFile = useCallback(async (file) => {
    if (!file || !file.type.startsWith('image/')) return
    setProcessing(true)
    const img = await loadImage(file)
    const src = URL.createObjectURL(file)
    setSourceImage({ file, img, src })
    setResults(runProcess(img, buildSizes(customSizes), MIME_MAP[format]))
    setProcessing(false)
  }, [customSizes, format, buildSizes, runProcess])

  const onFileChange = (e) => { handleFile(e.target.files?.[0]); e.target.value = '' }
  const onDrop = (e) => { e.preventDefault(); setIsDragging(false); handleFile(e.dataTransfer.files?.[0]) }

  const reprocess = () => {
    if (!sourceImage) return
    setProcessing(true)
    setResults(runProcess(sourceImage.img, buildSizes(customSizes), mime))
    setProcessing(false)
  }

  const handleFormatChange = (newFmt) => {
    setFormat(newFmt)
    if (!sourceImage) return
    setProcessing(true)
    setResults(runProcess(sourceImage.img, buildSizes(customSizes), MIME_MAP[newFmt]))
    setProcessing(false)
  }

  const handleEnhanced = (name, enhancedURL) =>
    setResults(prev => prev.map(r => r.name === name ? { ...r, enhancedURL } : r))

  const handleAiEnhanced = (name, aiURL, error, provider) => {
    if (error === 'NO_KEYS') {
      setShowSettings(true)
      showToast('Add at least one API key to use AI Enhancement.', 'warn')
      return
    }
    if (error === 'ALL_FAILED') {
      showToast('All AI providers failed. Falling back to Quick Enhance.', 'error')
      return
    }
    if (error) {
      showToast(`AI error: ${error}`, 'error')
      return
    }
    if (provider) showToast(`Enhanced with ${provider} ✓`, 'success')
    setResults(prev => prev.map(r => r.name === name ? { ...r, aiURL } : r))
  }

  const handleEnhanceAll = async () => {
    setEnhancingAll(true)
    const updated = await Promise.all(
      results.map(async r => {
        if (r.enhancedURL) return r
        return { ...r, enhancedURL: await enhanceImage(r.dataURL, mime) }
      })
    )
    setResults(updated)
    setEnhancingAll(false)
    showToast('All images enhanced with Quick Enhance ✓', 'success')
  }

  const handleAiEnhanceAll = async () => {
    const apiKeys = loadApiKeys()
    const hasKeys = Object.values(apiKeys).some(v => v?.trim())
    if (!hasKeys) { setShowSettings(true); showToast('Add at least one API key first.', 'warn'); return }

    setAiEnhancingAll(true)
    let successCount = 0
    const updated = [...results]

    for (let i = 0; i < updated.length; i++) {
      if (updated[i].aiURL) { successCount++; continue }
      setAiAllStatus(`Processing ${i + 1}/${updated.length}…`)
      try {
        const { dataURL: aiURL, provider } = await aiEnhance(updated[i].dataURL, mime, apiKeys, () => {})
        updated[i] = { ...updated[i], aiURL }
        successCount++
      } catch {
        // skip and move on
      }
    }

    setResults(updated)
    setAiEnhancingAll(false)
    setAiAllStatus(null)
    showToast(`AI enhanced ${successCount}/${updated.length} images ✓`, 'success')
  }

  const downloadAll = async () => {
    if (!results.length) return
    const zip = new JSZip()
    const ext = EXT_MAP[format]
    results.forEach(r => {
      const url = r.aiURL || r.enhancedURL || r.dataURL
      zip.file(`${r.name}.${ext}`, dataURLtoBlob(url))
    })
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
      <div className="orb orb1" /><div className="orb orb2" /><div className="orb orb3" />

      {/* Settings Modal */}
      {showSettings && <Settings onClose={() => setShowSettings(false)} />}

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <header className="app-header">
        <div className="header-inner">
          <div className="logo">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="4"/>
              <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            ImageSizer <span className="logo-dot" />
          </div>
          <div className="header-actions">
            <button className="btn btn-ghost btn-sm" onClick={() => setShowSettings(true)} title="AI API Settings">
              <GearIcon /> AI Keys
            </button>
            <button className="theme-toggle" onClick={() => setDarkMode(d => !d)} aria-label="Toggle theme">
              <span className={`icon-wrap ${darkMode ? 'rotate' : ''}`}>
                {darkMode ? <SunIcon /> : <MoonIcon />}
              </span>
            </button>
          </div>
        </div>
      </header>

      <main className="main">

        {/* ── Upload screen ── */}
        {!sourceImage && (
          <section className="hero-section">

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

            <div className="presets-grid-hero">
              {PRESET_SIZES.map(s => (
                <div key={s.name} className="preset-chip">
                  <span className="preset-chip-name">{s.name}</span>
                  <span className="preset-chip-dim">{s.width}×{s.height}</span>
                </div>
              ))}
            </div>

            <div className="customize-section">
              <button className={`btn btn-ghost btn-sm ${showCustom ? 'active' : ''}`} onClick={() => setShowCustom(v => !v)}>
                {showCustom ? '▾' : '▸'}&nbsp; Customize Sizes
              </button>
              {showCustom && (
                <div className="custom-sizes-box">
                  {customSizes.map(s => (
                    <div key={s.id} className="custom-row">
                      <input className="input-field" placeholder="Label (optional)" value={s.name} onChange={e => updateCustomSize(s.id, 'name', e.target.value)} />
                      <input className="input-field input-num" placeholder="W" type="number" min="1" value={s.width} onChange={e => updateCustomSize(s.id, 'width', e.target.value)} />
                      <span className="dim-sep">×</span>
                      <input className="input-field input-num" placeholder="H" type="number" min="1" value={s.height} onChange={e => updateCustomSize(s.id, 'height', e.target.value)} />
                      {customSizes.length > 1 && <button className="btn-remove" onClick={() => removeCustomSize(s.id)}>✕</button>}
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
                    <button key={f} className={`format-pill ${format === f ? 'active' : ''}`} onClick={() => handleFormatChange(f)}>
                      {f.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div className="controls-right">
                {results.length > 0 && (
                  <>
                    <button className="btn btn-enhance" onClick={handleEnhanceAll} disabled={enhancingAll || aiEnhancingAll}>
                      {enhancingAll ? <><span className="mini-spinner" />Enhancing…</> : <><SparkleIcon size={14} />Quick Enhance All</>}
                    </button>
                    <button className="btn btn-ai-enhance" onClick={handleAiEnhanceAll} disabled={enhancingAll || aiEnhancingAll}>
                      {aiEnhancingAll
                        ? <><span className="mini-spinner" />{aiAllStatus || 'AI Enhancing…'}</>
                        : <><BrainIcon />AI Enhance All</>}
                    </button>
                    <button className="btn btn-primary" onClick={downloadAll}>
                      <DownloadIcon /> Download All (ZIP)
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Enhance legend */}
            {results.length > 0 && !processing && (
              <div className="enhance-legend">
                <div className="legend-item">
                  <span className="legend-dot" style={{ background: '#7c3aed' }} />
                  <span><strong>Quick Enhance</strong> — Unsharp Mask + Contrast. Instant, no API, works offline.</span>
                </div>
                <div className="legend-item">
                  <span className="legend-dot" style={{ background: '#0071e3' }} />
                  <span><strong>AI Enhance</strong> — Real-ESRGAN neural network via Replicate / Stability AI / Deep AI. Needs API key. Auto-fallback if one runs out of credits.</span>
                  <button className="legend-setup" onClick={() => setShowSettings(true)}><GearIcon /> Setup keys</button>
                </div>
              </div>
            )}

            {/* Custom sizes */}
            <div className="customize-section">
              <button className={`btn btn-ghost btn-sm ${showCustom ? 'active' : ''}`} onClick={() => setShowCustom(v => !v)}>
                {showCustom ? '▾' : '▸'}&nbsp; Custom Sizes
              </button>
              {showCustom && (
                <div className="custom-sizes-box">
                  {customSizes.map(s => (
                    <div key={s.id} className="custom-row">
                      <input className="input-field" placeholder="Label (optional)" value={s.name} onChange={e => updateCustomSize(s.id, 'name', e.target.value)} />
                      <input className="input-field input-num" placeholder="W" type="number" min="1" value={s.width} onChange={e => updateCustomSize(s.id, 'width', e.target.value)} />
                      <span className="dim-sep">×</span>
                      <input className="input-field input-num" placeholder="H" type="number" min="1" value={s.height} onChange={e => updateCustomSize(s.id, 'height', e.target.value)} />
                      {customSizes.length > 1 && <button className="btn-remove" onClick={() => removeCustomSize(s.id)}>✕</button>}
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

            {processing ? (
              <div className="processing-state"><div className="spinner" /><p>Processing images…</p></div>
            ) : (
              <div className="results-grid">
                {results.map(r => (
                  <ImageCard
                    key={r.name}
                    result={r}
                    format={format}
                    mime={mime}
                    onEnhanced={handleEnhanced}
                    onAiEnhanced={handleAiEnhanced}
                  />
                ))}
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
