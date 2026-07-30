import { useState, useCallback, useRef, useEffect } from 'react'
import JSZip from 'jszip'
import { cropCoverWithOffset, loadImage, downloadDataURL, dataURLtoBlob, enhanceImage, MIME_MAP, EXT_MAP } from './imageUtils'
import './App.css'

const PRESET_SIZES = [
  { name: 'hero-image-desktop', width: 1440, height: 800 },
  { name: 'hero-image-mobile', width: 375, height: 720 },
  { name: 'program-image', width: 375, height: 470 },
  { name: 'amenities-image', width: 342, height: 428 },
  { name: 'community-image', width: 300, height: 300 },
]

const THUMB_MAX = 250
const EDITOR_MAX = 300

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

function CropIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="13" height="13">
      <polyline points="6 2 6 8 2 8"/><polyline points="18 22 18 16 22 16"/>
      <rect x="6" y="8" width="12" height="8" rx="1"/>
    </svg>
  )
}

// ── Crop Editor ──────────────────────────────────────────────────

function CropEditor({ sourceImg, sourceImgSrc, targetW, targetH, mimeType, currentOffset, onApply, onCancel }) {
  const displayScale = Math.min(EDITOR_MAX / targetW, EDITOR_MAX / targetH, 1)
  const frameW = Math.round(targetW * displayScale)
  const frameH = Math.round(targetH * displayScale)

  const coverScale = Math.max(targetW / sourceImg.naturalWidth, targetH / sourceImg.naturalHeight)
  const imgW = Math.round(sourceImg.naturalWidth * coverScale * displayScale)
  const imgH = Math.round(sourceImg.naturalHeight * coverScale * displayScale)

  const [offset, setOffset] = useState({
    x: Math.max(frameW - imgW, Math.min(0, (currentOffset.x / targetW) * frameW)),
    y: Math.max(frameH - imgH, Math.min(0, (currentOffset.y / targetH) * frameH)),
  })

  const clamp = (val, min, max) => Math.max(min, Math.min(max, val))
  const dragging = useRef(null)

  const startDrag = (clientX, clientY) => {
    dragging.current = { startX: clientX - offset.x, startY: clientY - offset.y }
  }
  const moveDrag = (clientX, clientY) => {
    if (!dragging.current) return
    setOffset({
      x: clamp(clientX - dragging.current.startX, frameW - imgW, 0),
      y: clamp(clientY - dragging.current.startY, frameH - imgH, 0),
    })
  }
  const endDrag = () => { dragging.current = null }

  const onMouseDown = (e) => { e.preventDefault(); startDrag(e.clientX, e.clientY) }
  const onMouseMove = (e) => moveDrag(e.clientX, e.clientY)
  const onTouchStart = (e) => { const t = e.touches[0]; startDrag(t.clientX, t.clientY) }
  const onTouchMove = (e) => { e.preventDefault(); const t = e.touches[0]; moveDrag(t.clientX, t.clientY) }

  const handleApply = () => {
    const realOffsetX = offset.x / displayScale
    const realOffsetY = offset.y / displayScale
    const centerX = (targetW - sourceImg.naturalWidth * coverScale) / 2
    const centerY = (targetH - sourceImg.naturalHeight * coverScale) / 2
    const deltaX = realOffsetX - centerX
    const deltaY = realOffsetY - centerY
    const dataURL = cropCoverWithOffset(sourceImg, targetW, targetH, deltaX, deltaY, mimeType)
    onApply(dataURL, { x: deltaX, y: deltaY })
  }

  const handleReset = () => setOffset({ x: (frameW - imgW) / 2, y: (frameH - imgH) / 2 })

  return (
    <div className="crop-editor">
      <p className="crop-hint">Drag to reposition · frame = output size</p>
      <div
        className="crop-frame"
        style={{ width: frameW, height: frameH }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={endDrag}
      >
        <img
          src={sourceImgSrc || sourceImg.src}
          alt="crop preview"
          draggable={false}
          style={{ position: 'absolute', width: imgW, height: imgH, left: offset.x, top: offset.y, userSelect: 'none', pointerEvents: 'none' }}
        />
        <svg className="crop-grid" width={frameW} height={frameH} viewBox={`0 0 ${frameW} ${frameH}`}>
          <line x1={frameW / 3} y1="0" x2={frameW / 3} y2={frameH} />
          <line x1={(frameW / 3) * 2} y1="0" x2={(frameW / 3) * 2} y2={frameH} />
          <line x1="0" y1={frameH / 3} x2={frameW} y2={frameH / 3} />
          <line x1="0" y1={(frameH / 3) * 2} x2={frameW} y2={(frameH / 3) * 2} />
          <circle cx={frameW / 2} cy={frameH / 2} r="3" />
        </svg>
        <div className="crop-corner tl" /><div className="crop-corner tr" />
        <div className="crop-corner bl" /><div className="crop-corner br" />
      </div>
      <div className="crop-dims-label">{targetW} × {targetH} px</div>
      <div className="crop-actions">
        <button className="btn btn-ghost btn-sm" onClick={handleReset}>↺ Center</button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
        <button className="btn btn-sm" onClick={handleApply}>Apply Crop</button>
      </div>
    </div>
  )
}

// ── Image Card ───────────────────────────────────────────────────

function ImageCard({ result, format, mime, sourceImg, sourceImgSrc, onEnhanced, onCropApplied }) {
  const [enhancing, setEnhancing] = useState(false)
  const [showEnhanced, setShowEnhanced] = useState(Boolean(result.enhancedURL))
  const [showOriginal, setShowOriginal] = useState(false)
  const [showCropEditor, setShowCropEditor] = useState(false)

  // Keep in sync when Enhance All (or crop reset) updates parent state
  useEffect(() => {
    setShowEnhanced(Boolean(result.enhancedURL))
  }, [result.enhancedURL])

  const isEnhanced = Boolean(result.enhancedURL) && showEnhanced
  const { tw, th } = thumbDimensions(result.width, result.height)
  const activeURL = isEnhanced && !showOriginal ? result.enhancedURL : result.dataURL
  const filename = `${result.name}${isEnhanced ? '-enhanced' : ''}.${EXT_MAP[format]}`

  const handleEnhance = async () => {
    if (result.enhancedURL) {
      setShowEnhanced(true)
      return
    }
    setEnhancing(true)
    try {
      const enhanced = await enhanceImage(result.dataURL, mime)
      onEnhanced(result.name, enhanced)
      setShowEnhanced(true)
    } finally {
      setEnhancing(false)
    }
  }

  const handleCropApply = (newDataURL, newOffset) => {
    onCropApplied(result.name, newDataURL, newOffset)
    setShowEnhanced(false)
    setShowCropEditor(false)
  }

  return (
    <div className={`image-card ${isEnhanced ? 'card-enhanced' : ''} ${showCropEditor ? 'card-editing' : ''}`}
      style={isEnhanced ? { '--card-glow': '#7c3aed' } : {}}>

      {isEnhanced && !showCropEditor && (
        <div className="enhanced-badge" style={{ background: '#7c3aed' }}>
          <SparkleIcon /> Enhanced
        </div>
      )}

      {!showCropEditor && (
        <>
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

          <div className="card-actions">
            <button className="btn btn-crop btn-sm" onClick={() => setShowCropEditor(true)} title="Adjust crop position">
              <CropIcon /> Adjust
            </button>
            <button
              className={`btn btn-enhance btn-sm ${isEnhanced ? 'btn-active-mode' : ''}`}
              onClick={handleEnhance}
              disabled={enhancing}
              title="Sharpen & enhance"
            >
              {enhancing ? <><span className="mini-spinner" />Enhancing…</> : <><SparkleIcon />Enhance</>}
            </button>
            {isEnhanced && (
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setShowEnhanced(false)} title="Reset">↩</button>
            )}
            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => downloadDataURL(activeURL, filename)} title="Download">
              <DownloadIcon />
            </button>
          </div>
        </>
      )}

      {showCropEditor && sourceImg && (
        <CropEditor
          sourceImg={sourceImg}
          sourceImgSrc={sourceImgSrc}
          targetW={result.width}
          targetH={result.height}
          mimeType={mime}
          currentOffset={result.cropOffset || { x: 0, y: 0 }}
          onApply={handleCropApply}
          onCancel={() => setShowCropEditor(false)}
        />
      )}
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
  const [showCustom, setShowCustom] = useState(false)
  const fileInputRef = useRef(null)

  const mime = MIME_MAP[format]

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
      dataURL: cropCoverWithOffset(img, size.width, size.height, 0, 0, m),
      cropOffset: { x: 0, y: 0 },
      enhancedURL: null,
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

  const handleCropApplied = (name, newDataURL, newOffset) =>
    setResults(prev => prev.map(r =>
      r.name === name ? { ...r, dataURL: newDataURL, cropOffset: newOffset, enhancedURL: null } : r
    ))

  const handleEnhanceAll = async () => {
    setEnhancingAll(true)
    try {
      // Process one-by-one so the UI can update and large images don't freeze the tab
      for (const r of results) {
        if (r.enhancedURL) continue
        const enhancedURL = await enhanceImage(r.dataURL, mime)
        setResults(prev => prev.map(item =>
          item.name === r.name ? { ...item, enhancedURL } : item
        ))
        // Yield to the browser so badges/spinners can paint between images
        await new Promise(resolve => setTimeout(resolve, 0))
      }
    } finally {
      setEnhancingAll(false)
    }
  }

  const handleUndoAll = () => {
    setResults(prev => prev.map(r => ({ ...r, enhancedURL: null })))
  }

  const anyEnhanced = results.some(r => r.enhancedURL)

  const downloadAll = async () => {
    if (!results.length) return
    const zip = new JSZip()
    const ext = EXT_MAP[format]
    results.forEach(r => zip.file(`${r.name}.${ext}`, dataURLtoBlob(r.enhancedURL || r.dataURL)))
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

      {/* Header */}
      <header className="app-header">
        <div className="header-inner">
          <div className="logo">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="4"/>
              <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            ImagEase <span className="logo-dot" />
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
            <div className="hero-copy">
              <h1 className="hero-title">Resize, Crop &amp;<br /><span>Enhance Images</span></h1>
              <p className="hero-sub">Made with care, just for you — drop in one photo, and we’ll gently shape every size you need.</p>
            </div>

            <div className="hero-panel">
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
                <div className="upload-copy">
                  <p className="upload-label">Drop your image or <span className="upload-link">browse</span></p>
                  <p className="upload-hint">JPG · PNG · WEBP</p>
                </div>
              </div>

              <div className="presets-panel">
                <div className="presets-panel-header">
                  <span className="presets-panel-title">Output sizes</span>
                  <span className="presets-panel-count">{PRESET_SIZES.length} presets</span>
                </div>
                <div className="presets-list">
                  {PRESET_SIZES.map(s => (
                    <div key={s.name} className="preset-row">
                      <span className="preset-row-name">{s.name}</span>
                      <span className="preset-row-dim">{s.width} × {s.height}</span>
                    </div>
                  ))}
                </div>

                <div className="presets-panel-footer">
                  <button
                    className={`btn btn-ghost btn-sm customize-toggle ${showCustom ? 'active' : ''}`}
                    onClick={() => setShowCustom(v => !v)}
                  >
                    {showCustom ? '▾ Hide custom sizes' : '▸ Customize sizes'}
                  </button>
                </div>

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
                  enhancingAll ? (
                    <button className="btn btn-enhance" disabled>
                      <span className="mini-spinner" /> Enhancing…
                    </button>
                  ) : anyEnhanced ? (
                    <button className="btn btn-ghost" onClick={handleUndoAll}>
                      ↩ Undo All
                    </button>
                  ) : (
                    <button className="btn btn-enhance" onClick={handleEnhanceAll}>
                      <SparkleIcon size={14} /> Enhance All
                    </button>
                  )
                )}
                {results.length > 0 && (
                  <button className="btn btn-primary" onClick={downloadAll}>
                    <DownloadIcon /> Download All (ZIP)
                  </button>
                )}
              </div>
            </div>

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
                    sourceImg={sourceImage?.img}
                    sourceImgSrc={sourceImage?.src}
                    onEnhanced={handleEnhanced}
                    onCropApplied={handleCropApplied}
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      <footer className="app-footer">
        <span className="footer-brand">ImagEase</span>
        <span className="footer-credit">Made by Angelica Sullano</span>
      </footer>
    </div>
  )
}
