/**
 * Optional geotag helpers:
 * - Place search via Photon (OpenStreetMap data, works from the browser)
 * - Embed GPS EXIF into JPEG / WebP / PNG (keeps the selected output format)
 */

/** Convert decimal degrees to EXIF GPS rational format [d, m, s]. */
function degToDmsRational(deg) {
  const d = Math.floor(deg)
  const minFloat = (deg - d) * 60
  const m = Math.floor(minFloat)
  const s = Math.round((minFloat - m) * 60 * 100)
  return [
    [d, 1],
    [m, 1],
    [s, 100],
  ]
}

function encodeAscii(str) {
  const bytes = []
  for (let i = 0; i < str.length; i++) bytes.push(str.charCodeAt(i) & 0xff)
  bytes.push(0)
  return bytes
}

/**
 * Build little-endian TIFF EXIF body with GPS (+ optional description).
 */
function buildGpsExifTiff({ lat, lng, label }) {
  const latRef = lat >= 0 ? 'N' : 'S'
  const lngRef = lng >= 0 ? 'E' : 'W'
  const absLat = degToDmsRational(Math.abs(lat))
  const absLng = degToDmsRational(Math.abs(lng))

  const software = encodeAscii('ImagEase')
  const description = label
    ? encodeAscii(`Geotagged: ${String(label).slice(0, 180)}`)
    : null

  const ifd0Count = description ? 3 : 2
  const ifd0Size = 2 + ifd0Count * 12 + 4
  const ifd0Start = 8

  const gpsCount = 5
  const gpsIfdSize = 2 + gpsCount * 12 + 4
  const gpsIfdStart = ifd0Start + ifd0Size

  let dataPos = gpsIfdStart + gpsIfdSize

  const softwareOffset = dataPos
  dataPos += software.length

  let descriptionOffset = 0
  if (description) {
    descriptionOffset = dataPos
    dataPos += description.length
  }

  const latOffset = dataPos
  dataPos += 24

  const lngOffset = dataPos
  dataPos += 24

  const body = new Uint8Array(dataPos)
  const view = new DataView(body.buffer)
  const writeU16 = (offset, value) => view.setUint16(offset, value, true)
  const writeU32 = (offset, value) => view.setUint32(offset, value, true)

  body[0] = 0x49
  body[1] = 0x49
  writeU16(2, 42)
  writeU32(4, ifd0Start)

  writeU16(ifd0Start, ifd0Count)
  let e = ifd0Start + 2

  writeU16(e, 0x0131)
  writeU16(e + 2, 2)
  writeU32(e + 4, software.length)
  writeU32(e + 8, softwareOffset)
  e += 12

  if (description) {
    writeU16(e, 0x010e)
    writeU16(e + 2, 2)
    writeU32(e + 4, description.length)
    writeU32(e + 8, descriptionOffset)
    e += 12
  }

  writeU16(e, 0x8825)
  writeU16(e + 2, 4)
  writeU32(e + 4, 1)
  writeU32(e + 8, gpsIfdStart)
  e += 12
  writeU32(e, 0)

  writeU16(gpsIfdStart, gpsCount)
  e = gpsIfdStart + 2

  writeU16(e, 0x0000)
  writeU16(e + 2, 1)
  writeU32(e + 4, 4)
  body[e + 8] = 2
  body[e + 9] = 3
  body[e + 10] = 0
  body[e + 11] = 0
  e += 12

  writeU16(e, 0x0001)
  writeU16(e + 2, 2)
  writeU32(e + 4, 2)
  body[e + 8] = latRef.charCodeAt(0)
  body[e + 9] = 0
  e += 12

  writeU16(e, 0x0002)
  writeU16(e + 2, 5)
  writeU32(e + 4, 3)
  writeU32(e + 8, latOffset)
  e += 12

  writeU16(e, 0x0003)
  writeU16(e + 2, 2)
  writeU32(e + 4, 2)
  body[e + 8] = lngRef.charCodeAt(0)
  body[e + 9] = 0
  e += 12

  writeU16(e, 0x0004)
  writeU16(e + 2, 5)
  writeU32(e + 4, 3)
  writeU32(e + 8, lngOffset)
  e += 12
  writeU32(e, 0)

  for (let i = 0; i < software.length; i++) body[softwareOffset + i] = software[i]
  if (description) {
    for (let i = 0; i < description.length; i++) {
      body[descriptionOffset + i] = description[i]
    }
  }

  let pos = latOffset
  for (const [n, d] of absLat) {
    writeU32(pos, n)
    writeU32(pos + 4, d)
    pos += 8
  }
  pos = lngOffset
  for (const [n, d] of absLng) {
    writeU32(pos, n)
    writeU32(pos + 4, d)
    pos += 8
  }

  return body
}

/** JPEG APP1 segment: FF E1 | length | Exif\\0\\0 | TIFF */
function buildGpsExifApp1(meta) {
  const tiff = buildGpsExifTiff(meta)
  const exifHeader = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]
  const payloadLength = exifHeader.length + tiff.length
  const app1 = new Uint8Array(2 + 2 + payloadLength)
  const view = new DataView(app1.buffer)
  app1[0] = 0xff
  app1[1] = 0xe1
  view.setUint16(2, payloadLength + 2, false)
  app1.set(exifHeader, 4)
  app1.set(tiff, 4 + exifHeader.length)
  return app1
}

/** WebP EXIF chunk payload: Exif\\0\\0 + TIFF */
function buildWebpExifPayload(meta) {
  const tiff = buildGpsExifTiff(meta)
  const payload = new Uint8Array(6 + tiff.length)
  payload.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00], 0)
  payload.set(tiff, 6)
  return payload
}

function insertExifApp1(jpegBytes, app1) {
  if (jpegBytes[0] !== 0xff || jpegBytes[1] !== 0xd8) {
    throw new Error('Invalid JPEG for geotagging.')
  }

  const out = [0xff, 0xd8]
  for (let j = 0; j < app1.length; j++) out.push(app1[j])

  let i = 2
  while (i + 3 < jpegBytes.length) {
    if (jpegBytes[i] !== 0xff) {
      for (let j = i; j < jpegBytes.length; j++) out.push(jpegBytes[j])
      break
    }

    const marker = jpegBytes[i + 1]
    if (marker === 0xda || marker === 0xd9) {
      for (let j = i; j < jpegBytes.length; j++) out.push(jpegBytes[j])
      break
    }

    const size = (jpegBytes[i + 2] << 8) | jpegBytes[i + 3]
    const next = i + 2 + size
    if (marker !== 0xe1) {
      for (let j = i; j < next && j < jpegBytes.length; j++) out.push(jpegBytes[j])
    }
    i = next
  }

  return Uint8Array.from(out)
}

function fourCC(bytes, offset) {
  return String.fromCharCode(
    bytes[offset],
    bytes[offset + 1],
    bytes[offset + 2],
    bytes[offset + 3],
  )
}

function writeFourCC(bytes, offset, str) {
  bytes[offset] = str.charCodeAt(0)
  bytes[offset + 1] = str.charCodeAt(1)
  bytes[offset + 2] = str.charCodeAt(2)
  bytes[offset + 3] = str.charCodeAt(3)
}

function readU24LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16)
}

function writeU24LE(bytes, offset, value) {
  bytes[offset] = value & 0xff
  bytes[offset + 1] = (value >> 8) & 0xff
  bytes[offset + 2] = (value >> 16) & 0xff
}

function parseWebPChunks(bytes) {
  if (fourCC(bytes, 0) !== 'RIFF' || fourCC(bytes, 8) !== 'WEBP') {
    throw new Error('Invalid WebP for geotagging.')
  }

  const chunks = []
  let i = 12
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  while (i + 8 <= bytes.length) {
    const type = fourCC(bytes, i)
    const size = view.getUint32(i + 4, true)
    const dataStart = i + 8
    const dataEnd = dataStart + size
    if (dataEnd > bytes.length) break
    chunks.push({ type, data: bytes.slice(dataStart, dataEnd) })
    i = dataEnd + (size % 2)
  }
  return chunks
}

function vp8Dimensions(data) {
  if (data.length < 10) return null
  if (data[3] !== 0x9d || data[4] !== 0x01 || data[5] !== 0x2a) return null
  const width = (data[6] | (data[7] << 8)) & 0x3fff
  const height = (data[8] | (data[9] << 8)) & 0x3fff
  return { width, height }
}

function vp8LDimensions(data) {
  if (data.length < 5 || data[0] !== 0x2f) return null
  const bits = data[1] | (data[2] << 8) | (data[3] << 16) | ((data[4] & 0x0f) << 24)
  return {
    width: (bits & 0x3fff) + 1,
    height: ((bits >> 14) & 0x3fff) + 1,
  }
}

function getWebPCanvasSize(chunks) {
  for (const c of chunks) {
    if (c.type === 'VP8X' && c.data.length >= 10) {
      return {
        width: readU24LE(c.data, 4) + 1,
        height: readU24LE(c.data, 7) + 1,
      }
    }
  }
  for (const c of chunks) {
    if (c.type === 'VP8') {
      const d = vp8Dimensions(c.data)
      if (d) return d
    }
    if (c.type === 'VP8L') {
      const d = vp8LDimensions(c.data)
      if (d) return d
    }
  }
  throw new Error('Could not read WebP dimensions for geotagging.')
}

function encodeWebP(chunks) {
  let payloadSize = 4 // WEBP
  for (const c of chunks) {
    payloadSize += 8 + c.data.length + (c.data.length % 2)
  }

  const out = new Uint8Array(8 + payloadSize)
  const view = new DataView(out.buffer)
  writeFourCC(out, 0, 'RIFF')
  view.setUint32(4, payloadSize, true)
  writeFourCC(out, 8, 'WEBP')

  let offset = 12
  for (const c of chunks) {
    writeFourCC(out, offset, c.type)
    view.setUint32(offset + 4, c.data.length, true)
    out.set(c.data, offset + 8)
    offset += 8 + c.data.length
    if (c.data.length % 2) {
      out[offset] = 0
      offset += 1
    }
  }
  return out
}

function insertExifWebP(webpBytes, exifPayload) {
  const chunks = parseWebPChunks(webpBytes)
  const { width, height } = getWebPCanvasSize(chunks)

  // VP8X feature flags (libwebp): bit1 ANIM(0x02), bit2 XMP(0x04), bit3 EXIF(0x08), bit4 Alpha(0x10), bit5 ICC(0x20)
  let flags = 0
  let hadVp8x = false
  const kept = []
  for (const c of chunks) {
    if (c.type === 'EXIF') continue
    if (c.type === 'VP8X') {
      hadVp8x = true
      flags = c.data[0]
      continue
    }
    kept.push(c)
  }

  if (!hadVp8x) {
    flags = 0
    if (kept.some((c) => c.type === 'ALPH' || c.type === 'VP8L')) flags |= 0x10
  }
  flags |= 0x08 // EXIF present

  const vp8x = new Uint8Array(10)
  vp8x[0] = flags
  writeU24LE(vp8x, 4, width - 1)
  writeU24LE(vp8x, 7, height - 1)

  return encodeWebP([
    { type: 'VP8X', data: vp8x },
    ...kept,
    { type: 'EXIF', data: exifPayload },
  ])
}

/* ── PNG eXIf (optional format preserve) ─────────────────────── */

const PNG_CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function pngCrc(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c = PNG_CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

function insertExifPng(pngBytes, tiff) {
  if (
    pngBytes[0] !== 0x89 ||
    pngBytes[1] !== 0x50 ||
    pngBytes[2] !== 0x4e ||
    pngBytes[3] !== 0x47
  ) {
    throw new Error('Invalid PNG for geotagging.')
  }

  const view = new DataView(pngBytes.buffer, pngBytes.byteOffset, pngBytes.byteLength)
  const chunks = []
  let i = 8
  while (i + 12 <= pngBytes.length) {
    const length = view.getUint32(i, false)
    const type = fourCC(pngBytes, i + 4)
    const dataStart = i + 8
    const dataEnd = dataStart + length
    if (dataEnd + 4 > pngBytes.length) break
    chunks.push({ type, data: pngBytes.slice(dataStart, dataEnd) })
    i = dataEnd + 4
  }

  const filtered = chunks.filter((c) => c.type !== 'eXIf')
  const ihdrIdx = filtered.findIndex((c) => c.type === 'IHDR')
  const insertAt = ihdrIdx >= 0 ? ihdrIdx + 1 : 0
  filtered.splice(insertAt, 0, { type: 'eXIf', data: tiff })

  let total = 8
  for (const c of filtered) total += 12 + c.data.length
  const out = new Uint8Array(total)
  out.set(pngBytes.subarray(0, 8), 0)
  const outView = new DataView(out.buffer)
  let offset = 8
  for (const c of filtered) {
    outView.setUint32(offset, c.data.length, false)
    writeFourCC(out, offset + 4, c.type)
    out.set(c.data, offset + 8)
    const crcBuf = new Uint8Array(4 + c.data.length)
    writeFourCC(crcBuf, 0, c.type)
    crcBuf.set(c.data, 4)
    outView.setUint32(offset + 8 + c.data.length, pngCrc(crcBuf), false)
    offset += 12 + c.data.length
  }
  return out
}

function dataURLToBytes(dataURL) {
  const base64 = dataURL.split(',')[1]
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function bytesToDataURL(bytes, mime) {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return `data:${mime};base64,${btoa(binary)}`
}

function detectFormat(dataURL, formatHint) {
  const hint = String(formatHint || '').toLowerCase()
  if (hint === 'webp' || hint === 'png' || hint === 'jpeg' || hint === 'jpg') {
    return hint === 'jpg' ? 'jpeg' : hint
  }
  if (dataURL.startsWith('data:image/webp')) return 'webp'
  if (dataURL.startsWith('data:image/png')) return 'png'
  return 'jpeg'
}

/**
 * Build a Fast GeoTagger–style title + detail line from Photon properties.
 * Includes postcode / neighborhood / county when OSM provides them.
 */
function formatPhotonPlace(properties = {}, index = 0) {
  const p = properties
  const city = p.city || p.town || p.village || p.municipality || ''
  const neighborhood = p.district || p.locality || p.suburb || ''
  const postcode = p.postcode || p.postalcode || ''
  const street = p.street || ''
  const housenumber = p.housenumber || ''
  const name = p.name || ''

  // Primary line: house number, or place name, or street
  let title = housenumber || name || street || city || `Result ${index + 1}`

  const detailParts = []
  const pushUnique = (value) => {
    const v = String(value || '').trim()
    if (!v) return
    if (detailParts.some((part) => part.toLowerCase() === v.toLowerCase())) return
    if (v.toLowerCase() === String(title).toLowerCase()) return
    detailParts.push(v)
  }

  // Prefer "Street, Neighborhood, City…" under the house number
  if (housenumber) {
    pushUnique(street)
    if (name && name !== street && name !== housenumber) pushUnique(name)
  } else if (name && street && name !== street) {
    pushUnique(street)
  } else if (!housenumber && !name) {
    pushUnique(street)
  }

  pushUnique(neighborhood)
  pushUnique(city)
  pushUnique(p.county)
  pushUnique(p.state)
  pushUnique(postcode)
  pushUnique(p.country)

  const detail = detailParts.join(', ')
  const label = detail ? `${title}, ${detail}` : title

  return { title, detail, label, postcode }
}

/**
 * Search places by pasted address / location text.
 */
export async function searchLocations(query) {
  const q = query?.trim()
  if (!q || q.length < 2) return []

  const url = new URL('https://photon.komoot.io/api/')
  url.searchParams.set('q', q)
  url.searchParams.set('limit', '8')
  url.searchParams.set('lang', 'en')

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error('Location search failed. Please try again in a moment.')

  const data = await res.json()
  const features = data?.features || []

  const seen = new Set()
  return features
    .map((f, i) => {
      const p = f.properties || {}
      const [lng, lat] = f.geometry?.coordinates || []
      const formatted = formatPhotonPlace(p, i)
      return {
        id: String(p.osm_id != null ? `${p.osm_type || 'n'}-${p.osm_id}` : i),
        title: formatted.title,
        detail: formatted.detail,
        label: formatted.label,
        postcode: formatted.postcode,
        lat: Number(lat),
        lng: Number(lng),
      }
    })
    .filter((item) => {
      if (Number.isNaN(item.lat) || Number.isNaN(item.lng)) return false
      const key = `${item.lat.toFixed(5)},${item.lng.toFixed(5)},${item.label}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

/** Validate and clamp latitude / longitude into usable GPS numbers. */
export function normalizeCoords(lat, lng) {
  const latitude = Number(lat)
  const longitude = Number(lng)
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
    return { ok: false, error: 'Enter valid numbers for latitude and longitude.' }
  }
  if (latitude < -90 || latitude > 90) {
    return { ok: false, error: 'Latitude must be between -90 and 90.' }
  }
  if (longitude < -180 || longitude > 180) {
    return { ok: false, error: 'Longitude must be between -180 and 180.' }
  }
  return {
    ok: true,
    lat: latitude,
    lng: longitude,
    label: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
  }
}

/**
 * Best-effort reverse geocode for a map/manual pin.
 * Falls back to coordinate label if Photon has nothing.
 */
export async function reverseGeocode(lat, lng) {
  const normalized = normalizeCoords(lat, lng)
  if (!normalized.ok) return null

  try {
    const url = new URL('https://photon.komoot.io/reverse')
    url.searchParams.set('lat', String(normalized.lat))
    url.searchParams.set('lon', String(normalized.lng))
    url.searchParams.set('limit', '1')
    url.searchParams.set('lang', 'en')

    const res = await fetch(url.toString())
    if (!res.ok) {
      return {
        id: `manual-${normalized.lat.toFixed(5)}-${normalized.lng.toFixed(5)}`,
        title: 'Pinned location',
        detail: normalized.label,
        label: normalized.label,
        postcode: '',
        lat: normalized.lat,
        lng: normalized.lng,
        source: 'manual',
      }
    }

    const data = await res.json()
    const feature = data?.features?.[0]
    if (!feature) {
      return {
        id: `manual-${normalized.lat.toFixed(5)}-${normalized.lng.toFixed(5)}`,
        title: 'Pinned location',
        detail: normalized.label,
        label: normalized.label,
        postcode: '',
        lat: normalized.lat,
        lng: normalized.lng,
        source: 'manual',
      }
    }

    const p = feature.properties || {}
    const formatted = formatPhotonPlace(p, 0)
    return {
      id: String(p.osm_id != null ? `${p.osm_type || 'n'}-${p.osm_id}` : `rev-${normalized.lat}-${normalized.lng}`),
      title: formatted.title,
      detail: formatted.detail,
      label: formatted.label,
      postcode: formatted.postcode,
      lat: normalized.lat,
      lng: normalized.lng,
      source: 'reverse',
    }
  } catch {
    return {
      id: `manual-${normalized.lat.toFixed(5)}-${normalized.lng.toFixed(5)}`,
      title: 'Pinned location',
      detail: normalized.label,
      label: normalized.label,
      postcode: '',
      lat: normalized.lat,
      lng: normalized.lng,
      source: 'manual',
    }
  }
}

function toJpegDataURL(dataURL, quality = 0.92) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => reject(new Error('Failed to prepare image for geotagging'))
    img.src = dataURL
  })
}

/**
 * Embed GPS into the image while preserving format when possible.
 * @param {string} dataURL
 * @param {{ lat: number, lng: number, label?: string, format?: string }} options
 */
export async function geotagImage(dataURL, { lat, lng, label = '', format } = {}) {
  if (
    typeof lat !== 'number' ||
    typeof lng !== 'number' ||
    Number.isNaN(lat) ||
    Number.isNaN(lng)
  ) {
    throw new Error('Please select a valid location first.')
  }

  const meta = { lat, lng, label }
  const fmt = detectFormat(dataURL, format)

  if (fmt === 'webp') {
    const bytes = dataURLToBytes(dataURL)
    const tagged = insertExifWebP(bytes, buildWebpExifPayload(meta))
    return bytesToDataURL(tagged, 'image/webp')
  }

  if (fmt === 'png') {
    const bytes = dataURLToBytes(dataURL)
    const tagged = insertExifPng(bytes, buildGpsExifTiff(meta))
    return bytesToDataURL(tagged, 'image/png')
  }

  const jpegDataURL = dataURL.startsWith('data:image/jpeg')
    ? dataURL
    : await toJpegDataURL(dataURL)
  const jpegBytes = dataURLToBytes(jpegDataURL)
  const tagged = insertExifApp1(jpegBytes, buildGpsExifApp1(meta))
  return bytesToDataURL(tagged, 'image/jpeg')
}

/** Filename with -geotagged suffix, matching output format. */
export function geotaggedFilename(baseName, format = 'jpeg') {
  const cleaned = String(baseName || 'image').replace(/\.[^.]+$/, '')
  const fmt = String(format || 'jpeg').toLowerCase()
  const ext = fmt === 'webp' ? 'webp' : fmt === 'png' ? 'png' : 'jpg'
  return `${cleaned}-geotagged.${ext}`
}
