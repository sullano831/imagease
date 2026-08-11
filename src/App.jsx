import { useState, useCallback, useRef, useEffect } from 'react'
import JSZip from 'jszip'
import {
  cropCoverWithOffset,
  loadImage,
  downloadDataURL,
  dataURLtoBlob,
  enhanceImage,
  dataURLSizeBytes,
  formatFileSize,
  MIME_MAP,
  EXT_MAP,
  MIN_EXPORT_QUALITY,
  MAX_EXPORT_QUALITY,
  DEFAULT_EXPORT_QUALITY,
} from './imageUtils'
import { saveToHistory, listHistory } from './historyStore'
import { searchLocations, geotagImage, geotaggedFilename, reverseGeocode } from './geotag'
import History from './History'
import GeoMapPicker, { ManualCoordsModal } from './GeoMapPicker'
import './App.css'

const DEFAULT_PRESETS = [
  { id: 'header-image', name: 'header-image', width: 1920, height: 1080 },
  { id: 'header-image-mobile', name: 'header-image-mobile', width: 480, height: 720 },
  { id: 'amenities-image', name: 'amenities-image', width: 480, height: 720 },
  { id: 'top-program-image', name: 'top-program-image', width: 480, height: 720 },
  { id: 'community-image', name: 'community-image', width: 510, height: 620 },
  { id: 'about-us-image', name: 'about-us-image', width: 510, height: 620 },
]

const THUMB_MAX = 250
const EDITOR_MAX = 300

/** Safe filename / folder name for downloads. */
function sanitizeFilename(name, fallback = 'image') {
  const cleaned = String(name || '')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^\.+|\.+$/g, '')
  return cleaned || fallback
}

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

const MIN_CROP_ZOOM = 1
const MAX_CROP_ZOOM = 3

function CropEditor({ sourceImg, sourceImgSrc, targetW, targetH, mimeType, quality = DEFAULT_EXPORT_QUALITY, currentOffset, currentZoom = 1, onApply, onCancel }) {
  const displayScale = Math.min(EDITOR_MAX / targetW, EDITOR_MAX / targetH, 1)
  const frameW = Math.round(targetW * displayScale)
  const frameH = Math.round(targetH * displayScale)

  const baseCover = Math.max(targetW / sourceImg.naturalWidth, targetH / sourceImg.naturalHeight)
  const clamp = (val, min, max) => Math.max(min, Math.min(max, val))
  const clampZoom = (z) => clamp(Number(z) || 1, MIN_CROP_ZOOM, MAX_CROP_ZOOM)

  const sizeForZoom = (z) => {
    const zoom = clampZoom(z)
    return {
      imgW: Math.round(sourceImg.naturalWidth * baseCover * zoom * displayScale),
      imgH: Math.round(sourceImg.naturalHeight * baseCover * zoom * displayScale),
    }
  }

  const [zoom, setZoom] = useState(() => clampZoom(currentZoom))
  const { imgW, imgH } = sizeForZoom(zoom)

  const [offset, setOffset] = useState(() => {
    const z = clampZoom(currentZoom)
    const { imgW: iw, imgH: ih } = sizeForZoom(z)
    const centerX = (frameW - iw) / 2
    const centerY = (frameH - ih) / 2
    const ox = currentOffset?.x || 0
    const oy = currentOffset?.y || 0
    return {
      x: clamp(centerX + ox * displayScale, frameW - iw, 0),
      y: clamp(centerY + oy * displayScale, frameH - ih, 0),
    }
  })

  const dragging = useRef(null)
  const frameRef = useRef(null)
  const zoomRef = useRef(zoom)
  const sizeRef = useRef({ imgW, imgH })
  zoomRef.current = zoom
  sizeRef.current = { imgW, imgH }

  const applyZoom = (nextZoom) => {
    const z = clampZoom(nextZoom)
    const { imgW: nextW, imgH: nextH } = sizeForZoom(z)
    const { imgW: curW, imgH: curH } = sizeRef.current
    setOffset((prev) => {
      const cx = prev.x + curW / 2
      const cy = prev.y + curH / 2
      return {
        x: clamp(cx - nextW / 2, frameW - nextW, 0),
        y: clamp(cy - nextH / 2, frameH - nextH, 0),
      }
    })
    setZoom(z)
  }

  useEffect(() => {
    const el = frameRef.current
    if (!el) return undefined
    const onWheel = (e) => {
      e.preventDefault()
      const step = e.deltaY > 0 ? -0.1 : 0.1
      applyZoom(zoomRef.current + step)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [frameW, frameH, baseCover, displayScale])

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
    const coverScale = baseCover * zoom
    const realOffsetX = offset.x / displayScale
    const realOffsetY = offset.y / displayScale
    const centerX = (targetW - sourceImg.naturalWidth * coverScale) / 2
    const centerY = (targetH - sourceImg.naturalHeight * coverScale) / 2
    const deltaX = realOffsetX - centerX
    const deltaY = realOffsetY - centerY
    const dataURL = cropCoverWithOffset(sourceImg, targetW, targetH, deltaX, deltaY, mimeType, quality, zoom)
    onApply(dataURL, { x: deltaX, y: deltaY }, zoom)
  }

  const handleReset = () => {
    const { imgW: iw, imgH: ih } = sizeForZoom(1)
    setZoom(1)
    setOffset({ x: (frameW - iw) / 2, y: (frameH - ih) / 2 })
  }

  return (
    <div className="crop-editor">
      <p className="crop-hint">Drag to reposition · scroll or use controls to zoom</p>
      <div
        ref={frameRef}
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
      <div className="crop-zoom">
        <button
          type="button"
          className="btn btn-ghost btn-sm crop-zoom-btn"
          onClick={() => applyZoom(zoom - 0.1)}
          disabled={zoom <= MIN_CROP_ZOOM}
          title="Zoom out"
        >
          −
        </button>
        <input
          className="crop-zoom-slider"
          type="range"
          min={MIN_CROP_ZOOM}
          max={MAX_CROP_ZOOM}
          step="0.05"
          value={zoom}
          onChange={(e) => applyZoom(e.target.value)}
          aria-label="Zoom"
        />
        <button
          type="button"
          className="btn btn-ghost btn-sm crop-zoom-btn"
          onClick={() => applyZoom(zoom + 0.1)}
          disabled={zoom >= MAX_CROP_ZOOM}
          title="Zoom in"
        >
          +
        </button>
        <span className="crop-zoom-value">{Math.round(zoom * 100)}%</span>
      </div>
      <div className="crop-actions">
        <button className="btn btn-ghost btn-sm" onClick={handleReset}>↺ Reset</button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
        <button className="btn btn-sm" onClick={handleApply}>Apply Crop</button>
      </div>
    </div>
  )
}

// ── Image Card ───────────────────────────────────────────────────

function ImageCard({ result, format, mime, quality, sourceImg, sourceImgSrc, onEnhanced, onCropApplied, onRename, geoLocation, onGeotagDownload }) {
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
  const fileBytes = dataURLSizeBytes(activeURL)
  const fileSizeLabel = formatFileSize(fileBytes)
  const safeName = sanitizeFilename(result.name, result.id)
  const filename = `${safeName}${isEnhanced ? '-enhanced' : ''}.${EXT_MAP[format]}`

  const handleEnhance = async () => {
    if (result.enhancedURL) {
      setShowEnhanced(true)
      return
    }
    setEnhancing(true)
    try {
      const enhanced = await enhanceImage(result.dataURL, mime, quality)
      onEnhanced(result.id, enhanced)
      setShowEnhanced(true)
    } finally {
      setEnhancing(false)
    }
  }

  const handleCropApply = (newDataURL, newOffset, newZoom = 1) => {
    onCropApplied(result.id, newDataURL, newOffset, newZoom)
    setShowEnhanced(false)
    setShowCropEditor(false)
  }

  const handleGeotagDownload = async () => {
    if (!geoLocation || !onGeotagDownload) return
    setGeoBusy(true)
    try {
      await onGeotagDownload(activeURL, safeName)
    } finally {
      setGeoBusy(false)
    }
  }

  return (
    <div className={`image-card ${isEnhanced ? 'card-enhanced' : ''} ${showCropEditor ? 'card-editing' : ''}`}
      style={isEnhanced ? { '--card-glow': 'var(--accent)' } : {}}>

      {isEnhanced && !showCropEditor && (
        <div className="enhanced-badge">
          <SparkleIcon /> Enhanced
        </div>
      )}

      {!showCropEditor && (
        <>
          <div className="thumb-wrapper" style={{ width: tw, height: th }}>
            <img src={activeURL} alt={safeName} style={{ width: tw, height: th, display: 'block' }} />
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
            <input
              className="card-name-input"
              value={result.name}
              onChange={(e) => onRename?.(result.id, e.target.value)}
              aria-label="Rename file"
              title="Rename file"
            />
            <span className="card-dims">{result.width} × {result.height} px</span>
            {fileSizeLabel && (
              <span
                className="card-size"
                title={`${fileBytes.toLocaleString()} bytes`}
              >
                {fileSizeLabel}
              </span>
            )}
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
              title={fileSizeLabel ? `Download (${fileSizeLabel})` : 'Download'}
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
          quality={quality}
          currentOffset={result.cropOffset || { x: 0, y: 0 }}
          currentZoom={result.cropZoom || 1}
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
  const [presets, setPresets] = useState(() => DEFAULT_PRESETS.map((p) => ({ ...p })))
  const [customSizes, setCustomSizes] = useState([{ id: Date.now(), name: '', width: '', height: '' }])
  const [format, setFormat] = useState('webp')
  const [quality, setQuality] = useState(DEFAULT_EXPORT_QUALITY)
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
  const [showManualCoords, setShowManualCoords] = useState(false)
  const [manualCoordsBusy, setManualCoordsBusy] = useState(false)
  const [zipModal, setZipModal] = useState(null) // null | { mode: 'all' | 'geotagged' }
  const [zipFolderName, setZipFolderName] = useState('')
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

  const buildSizes = useCallback((customs, presetList = presets) => {
    const valid = customs.filter(s => s.width && s.height)
    return [
      ...presetList.map((p) => ({
        id: p.id,
        name: sanitizeFilename(p.name, p.id),
        width: p.width,
        height: p.height,
      })),
      ...valid.map(s => ({
        id: `custom-${s.id}`,
        name: sanitizeFilename(s.name, `custom-${s.width}x${s.height}`),
        width: Number(s.width),
        height: Number(s.height),
      })),
    ]
  }, [presets])

  const runProcess = useCallback((img, sizes, m, q = DEFAULT_EXPORT_QUALITY) =>
    sizes.map(size => ({
      id: size.id || size.name,
      name: size.name,
      width: size.width,
      height: size.height,
      dataURL: cropCoverWithOffset(img, size.width, size.height, 0, 0, m, q, 1),
      cropOffset: { x: 0, y: 0 },
      cropZoom: 1,
      enhancedURL: null,
    })), [])

  const updatePresetName = (id, name) => {
    setPresets((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)))
    setResults((prev) => prev.map((r) => (r.id === id ? { ...r, name } : r)))
  }

  const renameResult = (id, name) => {
    setResults((prev) => prev.map((r) => (r.id === id ? { ...r, name } : r)))
    setPresets((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)))
    setCustomSizes((prev) => prev.map((s) => (
      `custom-${s.id}` === id ? { ...s, name } : s
    )))
  }

  const startWithFile = useCallback(async (file, { saveHistory = true } = {}) => {
    if (!file || !file.type?.startsWith('image/')) return
    setProcessing(true)
    setView('home')
    try {
      const img = await loadImage(file)
      const src = URL.createObjectURL(file)
      setSourceImage({ file, img, src })
      setResults(runProcess(img, buildSizes(customSizes), MIME_MAP[format], quality))
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
  }, [customSizes, format, quality, buildSizes, runProcess, refreshHistoryCount])

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
    setResults(runProcess(sourceImage.img, buildSizes(customSizes), mime, quality))
    setProcessing(false)
  }

  const handleFormatChange = (newFmt) => {
    setFormat(newFmt)
    if (!sourceImage) return
    setProcessing(true)
    setResults(runProcess(sourceImage.img, buildSizes(customSizes), MIME_MAP[newFmt], quality))
    setProcessing(false)
  }

  const handleQualityChange = (nextQuality) => {
    const q = Math.max(MIN_EXPORT_QUALITY, Math.min(MAX_EXPORT_QUALITY, Number(nextQuality) || DEFAULT_EXPORT_QUALITY))
    setQuality(q)
    if (!sourceImage) return
    setProcessing(true)
    setResults(runProcess(sourceImage.img, buildSizes(customSizes), mime, q))
    setProcessing(false)
  }

  const handleEnhanced = (id, enhancedURL) =>
    setResults(prev => prev.map(r => r.id === id ? { ...r, enhancedURL } : r))

  const handleCropApplied = (id, newDataURL, newOffset, newZoom = 1) =>
    setResults(prev => prev.map(r =>
      r.id === id
        ? { ...r, dataURL: newDataURL, cropOffset: newOffset, cropZoom: newZoom, enhancedURL: null }
        : r
    ))

  const handleEnhanceAll = async () => {
    setEnhancingAll(true)
    try {
      // Process one-by-one so the UI can update and large images don't freeze the tab
      for (const r of results) {
        if (r.enhancedURL) continue
        const enhancedURL = await enhanceImage(r.dataURL, mime, quality)
        setResults(prev => prev.map(item =>
          item.id === r.id ? { ...item, enhancedURL } : item
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

  const openZipModal = (mode) => {
    setZipFolderName(mode === 'geotagged' ? 'images-geotagged' : `images-${format}`)
    setZipModal({ mode })
  }

  const closeZipModal = () => {
    if (geoZipBusy) return
    setZipModal(null)
  }

  const confirmZipDownload = async () => {
    if (!zipModal || !results.length) return
    const fallback = zipModal.mode === 'geotagged' ? 'images-geotagged' : `images-${format}`
    const folderName = sanitizeFilename(zipFolderName, fallback)
    const ext = EXT_MAP[format]

    if (zipModal.mode === 'all') {
      const zip = new JSZip()
      const folder = zip.folder(folderName)
      results.forEach((r) => {
        const base = sanitizeFilename(r.name, r.id)
        const fileName = `${base}${r.enhancedURL ? '-enhanced' : ''}.${ext}`
        folder.file(fileName, dataURLtoBlob(r.enhancedURL || r.dataURL))
      })
      const content = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(content)
      const a = document.createElement('a')
      a.href = url
      a.download = `${folderName}.zip`
      a.click()
      URL.revokeObjectURL(url)
      setZipModal(null)
      return
    }

    if (!geoSelected) return
    setGeoZipBusy(true)
    try {
      const zip = new JSZip()
      const folder = zip.folder(folderName)
      for (const r of results) {
        const source = r.enhancedURL || r.dataURL
        const tagged = await geotagImage(source, {
          lat: geoSelected.lat,
          lng: geoSelected.lng,
          label: geoSelected.label,
          format,
        })
        folder.file(
          geotaggedFilename(sanitizeFilename(r.name, r.id), format),
          dataURLtoBlob(tagged),
        )
      }
      const content = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(content)
      const a = document.createElement('a')
      a.href = url
      a.download = `${folderName}.zip`
      a.click()
      URL.revokeObjectURL(url)
      setZipModal(null)
    } catch (err) {
      setGeoError(err.message || 'Geotagged download failed.')
    } finally {
      setGeoZipBusy(false)
    }
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

  const applyGeoPlace = useCallback((place) => {
    if (!place) return
    setGeoSelected(place)
    setGeoQuery(place.label || `${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}`)
    setGeoResults([])
    setGeoError('')
  }, [])

  const handleManualCoordsConfirm = useCallback(async (lat, lng) => {
    setManualCoordsBusy(true)
    try {
      const place = await reverseGeocode(lat, lng)
      if (place) applyGeoPlace(place)
      setShowManualCoords(false)
    } catch (err) {
      setGeoError(err.message || 'Could not set those coordinates.')
    } finally {
      setManualCoordsBusy(false)
    }
  }, [applyGeoPlace])

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
    setShowManualCoords(false)
  }

  return (
    <div className={`app ${darkMode ? 'dark' : ''}`}>
      <div className="atelier-bg" aria-hidden="true">
        <div className="atelier-aurora atelier-aurora-a" />
        <div className="atelier-aurora atelier-aurora-b" />
        <div className="atelier-aurora atelier-aurora-c" />
        <div className="atelier-sheen" />
        <div className="atelier-grain" />
      </div>

      {/* Header */}
      <header className="app-header">
        <div className="header-inner">
          <button
            type="button"
            className="logo"
            onClick={() => { setView('home'); refreshHistoryCount() }}
            title="Home"
          >
            <span className="logo-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="4"/>
                <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
            </span>
            <span className="logo-word">ImagEase</span>
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
          <>
          <section className="hero-section">
            <div className="hero-copy">
              <h1 className="hero-title">
                Let one photo
                <span className="hero-title-line">become many</span>
              </h1>
              <p className="hero-sub">
                Bring your image here. We’ll tend to it gently — cropped, sized, and quietly ready for wherever it needs to go.
              </p>
            </div>

            <div
              className={`upload-zone upload-plane ${isDragging ? 'dragging' : ''}`}
              onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp"
                style={{ display: 'none' }} onChange={onFileChange} />

              <div className="upload-stage-art" aria-hidden="true">
                <span className="upload-frame upload-frame-wide" />
                <span className="upload-frame upload-frame-portrait" />
                <span className="upload-frame upload-frame-square" />
              </div>

              <div className="upload-content">
                <div className="upload-icon-wrap"><UploadIcon /></div>
                <div className="upload-copy">
                  <p className="upload-label">Rest your image here</p>
                  <p className="upload-hint">JPG · PNG · WEBP</p>
                </div>
                <span className="upload-browse">Choose a photo</span>
              </div>
            </div>
          </section>

          <section className="sizes-section">
            <div className="sizes-section-header">
              <div>
                <h2 className="sizes-section-title">Sizes you’ll need</h2>
                <p className="sizes-section-sub">Rename any frame so it feels like yours when you download.</p>
              </div>
              <span className="presets-panel-count">{presets.length} presets</span>
            </div>

            <div className="presets-panel">
              <div className="presets-list">
                {presets.map(s => (
                  <div key={s.id} className="preset-row">
                    <input
                      className="preset-row-name-input"
                      value={s.name}
                      onChange={(e) => updatePresetName(s.id, e.target.value)}
                      aria-label={`Rename ${s.id}`}
                      title="Rename output filename"
                    />
                    <span className="preset-row-dim">{s.width} × {s.height}</span>
                  </div>
                ))}
              </div>

              <div className="presets-panel-footer">
                <button
                  className={`btn btn-ghost btn-sm customize-toggle ${showCustom ? 'active' : ''}`}
                  onClick={() => setShowCustom(v => !v)}
                >
                  {showCustom ? 'Hide custom sizes' : 'Customize sizes'}
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
          </section>
          </>
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
              <div className="controls-left">
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

                <div className={`quality-selector ${format === 'png' ? 'is-disabled' : ''}`}>
                  <label className="ctrl-label" htmlFor="quality-slider">
                    Quality
                    <span className="quality-value">
                      {format === 'png'
                        ? 'N/A (PNG)'
                        : quality <= MIN_EXPORT_QUALITY + 0.001
                          ? '0%'
                          : `${Math.round(quality * 100)}%`}
                    </span>
                  </label>
                  <div className="quality-row">
                    <span className="quality-hint">Low</span>
                    <input
                      id="quality-slider"
                      className="quality-slider"
                      type="range"
                      min={MIN_EXPORT_QUALITY}
                      max={MAX_EXPORT_QUALITY}
                      step="0.01"
                      value={quality}
                      disabled={format === 'png'}
                      onChange={(e) => handleQualityChange(e.target.value)}
                      aria-label="Output quality"
                      title={format === 'png' ? 'PNG is lossless — quality does not apply' : 'Lower quality reduces file size. Lowest aims for ~10 KB.'}
                    />
                    <span className="quality-hint">High</span>
                  </div>
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
                  <button className="btn btn-primary" onClick={() => openZipModal('all')}>
                    <DownloadIcon /> Download All (ZIP)
                  </button>
                )}
                {results.length > 0 && geoSelected && (
                  <button className="btn btn-geo" onClick={() => openZipModal('geotagged')} disabled={geoZipBusy}>
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
                      Search a place, click the map, or enter coordinates manually if the place can’t be found.
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
                            onClick={() => applyGeoPlace(place)}
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

                    <GeoMapPicker
                      selected={geoSelected}
                      onSelect={applyGeoPlace}
                      onManualOpen={() => setShowManualCoords(true)}
                    />

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
                    key={r.id}
                    result={r}
                    format={format}
                    mime={mime}
                    quality={quality}
                    sourceImg={sourceImage?.img}
                    sourceImgSrc={sourceImage?.src}
                    onEnhanced={handleEnhanced}
                    onCropApplied={handleCropApplied}
                    onRename={renameResult}
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

      {showManualCoords && (
        <ManualCoordsModal
          initialLat={geoSelected?.lat ?? ''}
          initialLng={geoSelected?.lng ?? ''}
          onClose={() => !manualCoordsBusy && setShowManualCoords(false)}
          onConfirm={handleManualCoordsConfirm}
          busy={manualCoordsBusy}
        />
      )}

      {zipModal && (
        <div className="modal-backdrop" onClick={closeZipModal}>
          <div
            className={`confirm-modal zip-name-modal ${geoZipBusy ? 'is-busy' : ''}`}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="zip-name-title"
          >
            <h3 id="zip-name-title" className="confirm-modal-title">
              {zipModal.mode === 'geotagged' ? 'Download geotagged ZIP' : 'Download All ZIP'}
            </h3>
            <p className="confirm-modal-message">
              Name the folder (or keep the default). Files will be saved inside this folder in the ZIP.
            </p>
            <label className="zip-name-label" htmlFor="zip-folder-name">Folder name</label>
            <input
              id="zip-folder-name"
              className="input-field zip-name-input"
              value={zipFolderName}
              onChange={(e) => setZipFolderName(e.target.value)}
              placeholder={zipModal.mode === 'geotagged' ? 'images-geotagged' : `images-${format}`}
              autoFocus
              disabled={geoZipBusy}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !geoZipBusy) {
                  e.preventDefault()
                  confirmZipDownload()
                }
              }}
            />
            <div className="confirm-modal-actions">
              <button className="btn btn-ghost" onClick={closeZipModal} disabled={geoZipBusy}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={confirmZipDownload} disabled={geoZipBusy}>
                {geoZipBusy
                  ? <><span className="mini-spinner" /> Preparing…</>
                  : <><DownloadIcon /> Download</>}
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="app-footer">
        <span className="footer-brand">ImagEase</span>
        <span className="footer-credit">Made by Angelica Sullano</span>
      </footer>
    </div>
  )
}
