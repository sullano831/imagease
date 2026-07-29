/**
 * Crops and resizes an image using object-fit: cover logic (centered crop).
 */
export function cropCover(img, targetW, targetH, mimeType = 'image/webp', quality = 0.92) {
  return cropCoverWithOffset(img, targetW, targetH, 0, 0, mimeType, quality)
}

/**
 * Crops with a custom pixel offset from the centered position.
 * offsetX/offsetY: how many px to shift the image (positive = right/down).
 * Automatically clamped so the image always fully covers the target frame.
 */
export function cropCoverWithOffset(img, targetW, targetH, offsetX, offsetY, mimeType = 'image/webp', quality = 0.92) {
  const canvas = document.createElement('canvas')
  canvas.width = targetW
  canvas.height = targetH
  const ctx = canvas.getContext('2d')

  const srcW = img.naturalWidth
  const srcH = img.naturalHeight
  const scale = Math.max(targetW / srcW, targetH / srcH)
  const scaledW = srcW * scale
  const scaledH = srcH * scale

  // Centered base position
  const centerX = (targetW - scaledW) / 2
  const centerY = (targetH - scaledH) / 2

  // Apply offset, clamped so image always fully covers the frame
  const x = Math.max(targetW - scaledW, Math.min(0, centerX + offsetX))
  const y = Math.max(targetH - scaledH, Math.min(0, centerY + offsetY))

  ctx.drawImage(img, x, y, scaledW, scaledH)
  return canvas.toDataURL(mimeType, quality)
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
 * Enhances an image using:
 *  1. Unsharp Mask  — reduces pixelation, sharpens edges
 *  2. Subtle contrast boost — adds clarity and depth
 *
 * Pure canvas pixel manipulation, no API, no AI model download needed.
 *
 * @param {string} dataURL   — input data URL
 * @param {string} mimeType  — output mime type
 * @returns {Promise<string>} enhanced data URL
 */
export function enhanceImage(dataURL, mimeType = 'image/webp') {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const w = img.width
      const h = img.height
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)

      const imageData = ctx.getImageData(0, 0, w, h)
      const src = imageData.data

      // Step 1 — Unsharp Mask
      // blurred = Gaussian-approx blur of original
      // sharpened = original + amount × (original − blurred)
      const blurred = boxBlur(src, w, h, 2)
      const amount = 1.1          // sharpening strength (0.8–1.5 is good range)
      const threshold = 4         // ignore tiny differences (reduces noise amplification)

      const sharp = new Uint8ClampedArray(src.length)
      for (let i = 0; i < src.length; i += 4) {
        for (let c = 0; c < 3; c++) {
          const diff = src[i + c] - blurred[i + c]
          sharp[i + c] = Math.max(0, Math.min(255,
            Math.abs(diff) >= threshold
              ? src[i + c] + amount * diff
              : src[i + c]
          ))
        }
        sharp[i + 3] = src[i + 3]
      }

      // Step 2 — Subtle contrast boost (S-curve approximation)
      // Maps each channel: out = clamp((val - 128) * factor + 128)
      const contrastFactor = 1.06
      const result = new Uint8ClampedArray(sharp.length)
      for (let i = 0; i < sharp.length; i += 4) {
        for (let c = 0; c < 3; c++) {
          result[i + c] = Math.max(0, Math.min(255,
            (sharp[i + c] - 128) * contrastFactor + 128
          ))
        }
        result[i + 3] = sharp[i + 3]
      }

      ctx.putImageData(new ImageData(result, w, h), 0, 0)
      resolve(canvas.toDataURL(mimeType, 0.95))
    }
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
