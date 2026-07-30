import { useState, useCallback, useRef, useEffect } from 'react'
import JSZip from 'jszip'
import { cropCoverWithOffset, loadImage, downloadDataURL, dataURLtoBlob, enhanceImage, MIME_MAP, EXT_MAP } from './imageUtils'
import { saveToHistory, listHistory } from './historyStore'
import { searchLocations, geotagImage, geotaggedFilename } from './geotag'
import History from './History'
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

function PinIcon({ size = 13 }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}

function HistoryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15 14" />
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

function ImageCard({ result, format, mime, sourceImg, sourceImgSrc, onEnhanced, onCropApplied, geoLocation, onGeotagDownload }) {
  const [enhancing, setEnhancing] = useState(false)
  const [showEnhanced, setShowEnhanced] = useState(Boolean(result.enhancedURL))
  const [showOriginal, setShowOriginal] = useState(false)
  const [showCropEditor, setShowCropEditor] = useState(false)
  const [geoBusy, setGeoBusy] = useState(false)

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

  const handleGeotagDownload = async () => {
    if (!geoLocation || !onGeotagDownload) return
    setGeoBusy(true)
    try {
      await onGeotagDownload(activeURL, result.name)
    } finally {
      setGeoBusy(false)
    }
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
            <div className="card-action-group">
              <button
                className={`btn btn-enhance btn-sm ${isEnhanced ? 'btn-active-mode' : ''}`}
                onClick={handleEnhance}
                disabled={enhancing}
                title="Sharpen & enhance"
              >
                {enhancing ? <><span className="mini-spinner" />…</> : <><SparkleIcon />Enhance</>}
              </button>
              {isEnhanced && (
                <button className="btn btn-ghost btn-sm btn-reset" onClick={() => setShowEnhanced(false)} title="Reset enhance">
                  ↩
                </button>
              )}
            </div>
            <button
              className="btn btn-ghost btn-sm btn-download"
              onClick={() => downloadDataURL(activeURL, filename)}
              title="Download"
            >
              <DownloadIcon /> Download
            </button>
            {geoLocation && (
              <button
                className="btn btn-geo btn-sm"
                onClick={handleGeotagDownload}
                disabled={geoBusy}
                title={`Download geotagged ${format.toUpperCase()}`}
              >
                {geoBusy ? <><span className="mini-spinner" />…</> : <><PinIcon /> Geo</>}
              </button>
            )}
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
  const [view, setView] = useState('home') // 'home' | 'history'
  const [historyCount, setHistoryCount] = useState(0)
  const [geoQuery, setGeoQuery] = useState('')
  const [geoResults, setGeoResults] = useState([])
  const [geoSelected, setGeoSelected] = useState(null)
  const [geoSearching, setGeoSearching] = useState(false)
  const [geoError, setGeoError] = useState('')
  const [geoZipBusy, setGeoZipBusy] = useState(false)
  const [showGeotag, setShowGeotag] = useState(false)
  const fileInputRef = useRef(null)
  const geoSearchTimer = useRef(null)

  const mime = MIME_MAP[format]

  const refreshHistoryCount = useCallback(async () => {
    try {
      const list = await listHistory()
      setHistoryCount(list.length)
    } catch {
      setHistoryCount(0)
    }
  }, [])

  useEffect(() => { refreshHistoryCount() }, [refreshHistoryCount])

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

  const startWithFile = useCallback(async (file, { saveHistory = true } = {}) => {
    if (!file || !file.type?.startsWith('image/')) return
    setProcessing(true)
    setView('home')
    try {
      const img = await loadImage(file)
      const src = URL.createObjectURL(file)
      setSourceImage({ file, img, src })
      setResults(runProcess(img, buildSizes(customSizes), MIME_MAP[format]))
      if (saveHistory) {
        try {
          await saveToHistory(file)
          await refreshHistoryCount()
        } catch (err) {
          console.warn('Could not save to history:', err)
        }
      }
    } finally {
      setProcessing(false)
    }
  }, [customSizes, format, buildSizes, runProcess, refreshHistoryCount])

  const handleFile = useCallback(async (file) => {
    await startWithFile(file, { saveHistory: true })
  }, [startWithFile])

  const handleReuseHistory = useCallback(async (item) => {
    if (!item?.blob) return
    const file = new File([item.blob], item.name || 'history-image', { type: item.type || 'image/jpeg' })
    await startWithFile(file, { saveHistory: false })
  }, [startWithFile])

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

  const runGeoSearch = useCallback(async (query) => {
    const q = query.trim()
    if (q.length < 3) {
      setGeoResults([])
      setGeoError('')
      return
    }
    setGeoSearching(true)
    setGeoError('')
    try {
      const results = await searchLocations(q)
      setGeoResults(results)
      if (!results.length) setGeoError('No places found. Try a more specific address.')
    } catch (err) {
      setGeoResults([])
      setGeoError(err.message || 'Search failed. Please try again.')
    } finally {
      setGeoSearching(false)
    }
  }, [])

  const onGeoQueryChange = (value) => {
    setGeoQuery(value)
    setGeoSelected(null)
    if (geoSearchTimer.current) clearTimeout(geoSearchTimer.current)
    geoSearchTimer.current = setTimeout(() => runGeoSearch(value), 550)
  }

  const handleGeotagDownload = useCallback(async (dataURL, baseName) => {
    if (!geoSelected) return
    const tagged = await geotagImage(dataURL, {
      lat: geoSelected.lat,
      lng: geoSelected.lng,
      label: geoSelected.label,
      format,
    })
    downloadDataURL(tagged, geotaggedFilename(baseName, format))
  }, [geoSelected, format])

  const downloadAllGeotagged = async () => {
    if (!results.length || !geoSelected) return
    setGeoZipBusy(true)
    try {
      const zip = new JSZip()
      for (const r of results) {
        const source = r.enhancedURL || r.dataURL
        const tagged = await geotagImage(source, {
          lat: geoSelected.lat,
          lng: geoSelected.lng,
          label: geoSelected.label,
          format,
        })
        zip.file(geotaggedFilename(r.name, format), dataURLtoBlob(tagged))
      }
      const content = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(content)
      const a = document.createElement('a')
      a.href = url
      a.download = 'images-geotagged.zip'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setGeoError(err.message || 'Geotagged download failed.')
    } finally {
      setGeoZipBusy(false)
    }
  }

  const addCustomSize = () => setCustomSizes(p => [...p, { id: Date.now(), name: '', width: '', height: '' }])
  const removeCustomSize = (id) => setCustomSizes(p => p.filter(s => s.id !== id))
  const updateCustomSize = (id, field, value) => setCustomSizes(p => p.map(s => s.id === id ? { ...s, [field]: value } : s))
  const resetApp = () => {
    setSourceImage(null)
    setResults([])
    setGeoSelected(null)
    setGeoResults([])
    setGeoQuery('')
    setGeoError('')
    setShowGeotag(false)
  }

  return (
    <div className={`app ${darkMode ? 'dark' : ''}`}>
      <div className="orb orb1" /><div className="orb orb2" /><div className="orb orb3" />

      {/* Header */}
      <header className="app-header">
        <div className="header-inner">
          <button
            type="button"
            className="logo"
            onClick={() => { setView('home'); refreshHistoryCount() }}
            title="Home"
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="4"/>
              <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            ImagEase <span className="logo-dot" />
          </button>
          <div className="header-actions">
            <button
              className={`btn btn-ghost btn-sm history-nav-btn ${view === 'history' ? 'active' : ''}`}
              onClick={() => setView(view === 'history' ? 'home' : 'history')}
              title="Upload history"
            >
              <HistoryIcon />
              History
              {historyCount > 0 && <span className="history-count">{historyCount}</span>}
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

        {view === 'history' ? (
          <History
            onBack={() => { setView('home'); refreshHistoryCount() }}
            onReuse={handleReuseHistory}
          />
        ) : (
          <>
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
                        <input
                          className="input-field custom-label"
                          placeholder="Label (optional)"
                          value={s.name}
                          onChange={e => updateCustomSize(s.id, 'name', e.target.value)}
                        />
                        <div className="custom-dims">
                          <input
                            className="input-field input-num"
                            placeholder="W"
                            type="number"
                            min="1"
                            value={s.width}
                            onChange={e => updateCustomSize(s.id, 'width', e.target.value)}
                          />
                          <span className="dim-sep">×</span>
                          <input
                            className="input-field input-num"
                            placeholder="H"
                            type="number"
                            min="1"
                            value={s.height}
                            onChange={e => updateCustomSize(s.id, 'height', e.target.value)}
                          />
                        </div>
                        {customSizes.length > 1 ? (
                          <button className="btn-remove" onClick={() => removeCustomSize(s.id)} aria-label="Remove size">✕</button>
                        ) : (
                          <span className="btn-remove-spacer" aria-hidden="true" />
                        )}
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
                {results.length > 0 && geoSelected && (
                  <button className="btn btn-geo" onClick={downloadAllGeotagged} disabled={geoZipBusy}>
                    {geoZipBusy
                      ? <><span className="mini-spinner" /> Geotagging…</>
                      : <><PinIcon size={14} /> Download All Geotagged</>}
                  </button>
                )}
              </div>
            </div>

            {/* Geotag + Custom sizes toggles */}
            <div className="side-toggles">
            {results.length > 0 && (
              <div className="geotag-panel">
                <button
                  className={`btn btn-ghost btn-sm geotag-toggle side-toggle ${showGeotag ? 'active' : ''}`}
                  onClick={() => setShowGeotag(v => !v)}
                >
                  <PinIcon /> Geotag
                </button>

                {showGeotag && (
                  <div className="geotag-box">
                    <p className="geotag-help">
                      Optional. Location search uses a free service, so not every place may appear.
                    </p>
                    <div className="geotag-search-row">
                      <input
                        className="input-field geotag-input"
                        placeholder="Paste address or place name…"
                        value={geoQuery}
                        onChange={(e) => onGeoQueryChange(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            if (geoSearchTimer.current) clearTimeout(geoSearchTimer.current)
                            runGeoSearch(geoQuery)
                          }
                        }}
                      />
                      <button
                        className="btn btn-sm"
                        onClick={() => runGeoSearch(geoQuery)}
                        disabled={geoSearching || geoQuery.trim().length < 3}
                      >
                        {geoSearching ? 'Searching…' : 'Search'}
                      </button>
                    </div>

                    {geoError && <p className="geotag-error">{geoError}</p>}

                    {geoResults.length > 0 && !geoSelected && (
                      <div className="geotag-results">
                        {geoResults.map((place) => (
                          <button
                            key={place.id}
                            type="button"
                            className="geotag-result"
                            onClick={() => {
                              setGeoSelected(place)
                              setGeoQuery(place.label)
                              setGeoResults([])
                              setGeoError('')
                            }}
                          >
                            <PinIcon size={14} />
                            <span className="geotag-result-text">
                              <span className="geotag-result-title">{place.title || place.label}</span>
                              {place.detail && (
                                <span className="geotag-result-detail">{place.detail}</span>
                              )}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    {geoSelected && (
                      <div className="geotag-selected">
                        <div className="geotag-selected-info">
                          <PinIcon size={14} />
                          <div>
                            <div className="geotag-selected-label">Selected location</div>
                            <div className="geotag-selected-place">
                              {geoSelected.title || geoSelected.label}
                            </div>
                            {(geoSelected.detail || geoSelected.label) && (
                              <div className="geotag-selected-detail">
                                {geoSelected.detail || geoSelected.label}
                              </div>
                            )}
                            <div className="geotag-selected-coords">
                              {geoSelected.lat.toFixed(5)}, {geoSelected.lng.toFixed(5)}
                              {geoSelected.postcode ? ` · ${geoSelected.postcode}` : ''}
                            </div>
                          </div>
                        </div>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => {
                            setGeoSelected(null)
                            setGeoResults([])
                          }}
                        >
                          Clear
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="customize-section">
              <button
                className={`btn btn-ghost btn-sm side-toggle ${showCustom ? 'active' : ''}`}
                onClick={() => setShowCustom(v => !v)}
              >
                {showCustom ? '▾' : '▸'}&nbsp; Custom Sizes
              </button>
              {showCustom && (
                <div className="custom-sizes-box">
                  {customSizes.map(s => (
                    <div key={s.id} className="custom-row">
                      <input
                        className="input-field custom-label"
                        placeholder="Label (optional)"
                        value={s.name}
                        onChange={e => updateCustomSize(s.id, 'name', e.target.value)}
                      />
                      <div className="custom-dims">
                        <input
                          className="input-field input-num"
                          placeholder="W"
                          type="number"
                          min="1"
                          value={s.width}
                          onChange={e => updateCustomSize(s.id, 'width', e.target.value)}
                        />
                        <span className="dim-sep">×</span>
                        <input
                          className="input-field input-num"
                          placeholder="H"
                          type="number"
                          min="1"
                          value={s.height}
                          onChange={e => updateCustomSize(s.id, 'height', e.target.value)}
                        />
                      </div>
                      {customSizes.length > 1 ? (
                        <button className="btn-remove" onClick={() => removeCustomSize(s.id)} aria-label="Remove size">✕</button>
                      ) : (
                        <span className="btn-remove-spacer" aria-hidden="true" />
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
                    geoLocation={geoSelected}
                    onGeotagDownload={handleGeotagDownload}
                  />
                ))}
              </div>
            )}
          </section>
        )}
          </>
        )}
      </main>

      <footer className="app-footer">
        <span className="footer-brand">ImagEase</span>
        <span className="footer-credit">Made by Angelica Sullano</span>
      </footer>
    </div>
  )
}
