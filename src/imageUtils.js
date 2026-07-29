/**
 * Crops and resizes an image using object-fit: cover logic (centered crop).
 * @param {HTMLImageElement} img
 * @param {number} targetW
 * @param {number} targetH
 * @param {'image/webp'|'image/png'|'image/jpeg'} mimeType
 * @param {number} quality  0–1 for jpeg/webp
 * @returns {Promise<string>} data URL
 */
export function cropCover(img, targetW, targetH, mimeType = 'image/webp', quality = 0.92) {
  const canvas = document.createElement('canvas')
  canvas.width = targetW
  canvas.height = targetH
  const ctx = canvas.getContext('2d')

  const srcW = img.naturalWidth
  const srcH = img.naturalHeight

  // Scale factor so the image covers the target (same as object-fit: cover)
  const scale = Math.max(targetW / srcW, targetH / srcH)

  const scaledW = srcW * scale
  const scaledH = srcH * scale

  // Centered offset
  const offsetX = (targetW - scaledW) / 2
  const offsetY = (targetH - scaledH) / 2

  ctx.drawImage(img, offsetX, offsetY, scaledW, scaledH)

  return canvas.toDataURL(mimeType, quality)
}

/**
 * Converts a data URL blob to a Blob object.
 */
export function dataURLtoBlob(dataURL) {
  const [header, data] = dataURL.split(',')
  const mime = header.match(/:(.*?);/)[1]
  const binary = atob(data)
  const array = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i)
  return new Blob([array], { type: mime })
}

/**
 * Loads a File into an HTMLImageElement.
 */
export function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = reject
    img.src = url
  })
}

/**
 * Triggers a browser download for a data URL.
 */
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
