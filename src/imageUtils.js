/** Lowest quality step that still aims for ~10 KB output (jpeg/webp). */
export const MIN_EXPORT_QUALITY = 0.05
export const MAX_EXPORT_QUALITY = 1
export const DEFAULT_EXPORT_QUALITY = 0.92
/** Soft floor for the lowest quality setting (~10 KB). */
export const MIN_TARGET_BYTES = 10 * 1024

/** Approximate decoded byte size of a data URL (what you download). */
export function dataURLSizeBytes(dataURL) {
  if (!dataURL || typeof dataURL !== 'string') return 0
  const comma = dataURL.indexOf(',')
  if (comma < 0) return 0
  const header = dataURL.slice(0, comma)
  const data = dataURL.slice(comma + 1)
  if (header.includes(';base64')) {
    const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0
    return Math.max(0, Math.floor((data.length * 3) / 4) - padding)
  }
  try {
    return new TextEncoder().encode(decodeURIComponent(data)).length
  } catch {
    return data.length
  }
}

/** Format bytes for UI with precise KB decimals (matches downloaded file size). */
export function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

/**
 * Encode a canvas to a data URL.
 * At the minimum quality setting for jpeg/webp, binary-searches toward ~10 KB.
 * PNG ignores quality.
 */
export function encodeCanvas(canvas, mimeType = 'image/webp', quality = DEFAULT_EXPORT_QUALITY) {
  if (mimeType === 'image/png') return canvas.toDataURL(mimeType)

  const q = Math.max(MIN_EXPORT_QUALITY, Math.min(MAX_EXPORT_QUALITY, Number(quality) || DEFAULT_EXPORT_QUALITY))

  // Lowest setting: get as close as possible to ~10 KB (without going much lower when avoidable)
  if (q <= MIN_EXPORT_QUALITY + 0.001) {
    let lo = 0.01
    let hi = 0.92
    let best = canvas.toDataURL(mimeType, lo)
    let bestDiff = Math.abs(dataURLSizeBytes(best) - MIN_TARGET_BYTES)

    for (let i = 0; i < 10; i++) {
      const mid = (lo + hi) / 2
      const url = canvas.toDataURL(mimeType, mid)
      const size = dataURLSizeBytes(url)
      const diff = Math.abs(size - MIN_TARGET_BYTES)
      if (diff < bestDiff) {
        best = url
        bestDiff = diff
      }
      if (size > MIN_TARGET_BYTES) hi = mid
      else lo = mid
    }
    return best
  }

  return canvas.toDataURL(mimeType, q)
}

/**
 * Crops and resizes an image using object-fit: cover logic (centered crop).
 */
export function cropCover(img, targetW, targetH, mimeType = 'image/webp', quality = DEFAULT_EXPORT_QUALITY) {
  return cropCoverWithOffset(img, targetW, targetH, 0, 0, mimeType, quality)
}

/**
 * Crops with a custom pixel offset from the centered position.
 * offsetX/offsetY: how many px to shift the image (positive = right/down).
 * zoom: 1 = cover fit; >1 zooms in (still clamped so the frame stays covered).
 * Automatically clamped so the image always fully covers the target frame.
 */
export function cropCoverWithOffset(
  img,
  targetW,
  targetH,
  offsetX,
  offsetY,
  mimeType = 'image/webp',
  quality = DEFAULT_EXPORT_QUALITY,
  zoom = 1,
) {
  const canvas = document.createElement('canvas')
  canvas.width = targetW
  canvas.height = targetH
  const ctx = canvas.getContext('2d')

  const srcW = img.naturalWidth
  const srcH = img.naturalHeight
  const z = Math.max(1, Math.min(3, Number(zoom) || 1))
  const scale = Math.max(targetW / srcW, targetH / srcH) * z
  const scaledW = srcW * scale
  const scaledH = srcH * scale

  // Centered base position
  const centerX = (targetW - scaledW) / 2
  const centerY = (targetH - scaledH) / 2

  // Apply offset, clamped so image always fully covers the frame
  const x = Math.max(targetW - scaledW, Math.min(0, centerX + offsetX))
  const y = Math.max(targetH - scaledH, Math.min(0, centerY + offsetY))

  ctx.drawImage(img, x, y, scaledW, scaledH)
  return encodeCanvas(canvas, mimeType, quality)
}

// ── Enhancement helpers ──────────────────────────────────────────

/** 2-pass separable box blur — approximates Gaussian blur */
function boxBlur(data, w, h, radius) {
  const buf = new Float32Array(data.length)

  // Horizontal pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, n = 0
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = Math.max(0, Math.min(w - 1, x + dx))
        const i = (y * w + nx) * 4
        r += data[i]; g += data[i + 1]; b += data[i + 2]; n++
      }
      const i = (y * w + x) * 4
      buf[i] = r / n; buf[i + 1] = g / n; buf[i + 2] = b / n; buf[i + 3] = data[i + 3]
    }
  }

  const out = new Float32Array(buf.length)

  // Vertical pass
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let r = 0, g = 0, b = 0, n = 0
      for (let dy = -radius; dy <= radius; dy++) {
        const ny = Math.max(0, Math.min(h - 1, y + dy))
        const i = (ny * w + x) * 4
        r += buf[i]; g += buf[i + 1]; b += buf[i + 2]; n++
      }
      const i = (y * w + x) * 4
      out[i] = r / n; out[i + 1] = g / n; out[i + 2] = b / n; out[i + 3] = buf[i + 3]
    }
  }

  return out
}

/**
 * Enhances an image using a gentler pipeline:
 *  1. Light denoise   — reduces grain before sharpening
 *  2. Soft unsharp mask — cleans edges without crunchy halos
 *  3. Subtle contrast  — adds mild depth without amplifying texture
 *
 * Pure canvas pixel manipulation — no external API needed.
 *
 * @param {string} dataURL   — input data URL
 * @param {string} mimeType  — output mime type
 * @param {number} quality   — encoder quality (jpeg/webp); ignored by PNG
 * @returns {Promise<string>} enhanced data URL
 */
export function enhanceImage(dataURL, mimeType = 'image/webp', quality = DEFAULT_EXPORT_QUALITY) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      // Yield so React can paint the loading spinner before heavy work
      setTimeout(() => {
        try {
          const w = img.width
          const h = img.height
          const canvas = document.createElement('canvas')
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0)

          const imageData = ctx.getImageData(0, 0, w, h)
          const src = imageData.data

          // Step 1 — Light denoise (blend original with a mild blur)
          const denoisedBlur = boxBlur(src, w, h, 1)
          const denoiseMix = 0.22 // enough to cut grain, keep detail
          const smoothed = new Float32Array(src.length)
          for (let i = 0; i < src.length; i += 4) {
            for (let c = 0; c < 3; c++) {
              smoothed[i + c] = src[i + c] * (1 - denoiseMix) + denoisedBlur[i + c] * denoiseMix
            }
            smoothed[i + 3] = src[i + 3]
          }

          // Step 2 — Balanced unsharp mask (visible, not crunchy)
          const edgeBlur = boxBlur(smoothed, w, h, 1)
          const amount = 0.72
          const threshold = 8

          const sharp = new Uint8ClampedArray(src.length)
          for (let i = 0; i < src.length; i += 4) {
            for (let c = 0; c < 3; c++) {
              const diff = smoothed[i + c] - edgeBlur[i + c]
              const value = Math.abs(diff) >= threshold
                ? smoothed[i + c] + amount * diff
                : smoothed[i + c]
              sharp[i + c] = Math.max(0, Math.min(255, value))
            }
            sharp[i + 3] = src[i + 3]
          }

          // Step 3 — Soft contrast + slight midtone clarity
          const contrastFactor = 1.035
          const midtoneLift = 2.5
          const result = new Uint8ClampedArray(sharp.length)
          for (let i = 0; i < sharp.length; i += 4) {
            for (let c = 0; c < 3; c++) {
              let value = (sharp[i + c] - 128) * contrastFactor + 128
              // Gentle midtone lift for clearer faces without washing highlights
              const t = value / 255
              const mid = 4 * t * (1 - t) // peaks around midtones
              value += midtoneLift * mid
              result[i + c] = Math.max(0, Math.min(255, value))
            }
            result[i + 3] = sharp[i + 3]
          }

          ctx.putImageData(new ImageData(result, w, h), 0, 0)
          resolve(encodeCanvas(canvas, mimeType, quality))
        } catch (err) {
          reject(err)
        }
      }, 0)
    }
    img.onerror = () => reject(new Error('Failed to load image for enhancement'))
    img.src = dataURL
  })
}

/** Converts a data URL to a Blob. */
export function dataURLtoBlob(dataURL) {
  const [header, data] = dataURL.split(',')
  const mime = header.match(/:(.*?);/)[1]
  const binary = atob(data)
  const array = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i)
  return new Blob([array], { type: mime })
}

/** Loads a File into an HTMLImageElement. */
export function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = reject
    img.src = url
  })
}

/** Triggers a browser download for a data URL. */
export function downloadDataURL(dataURL, filename) {
  const a = document.createElement('a')
  a.href = dataURL
  a.download = filename
  a.click()
}

export const MIME_MAP = {
  webp: 'image/webp',
  png: 'image/png',
  jpeg: 'image/jpeg',
}

export const EXT_MAP = {
  webp: 'webp',
  png: 'png',
  jpeg: 'jpg',
}
