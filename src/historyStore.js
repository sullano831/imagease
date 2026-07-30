/**
 * Local image history via IndexedDB.
 * Everything stays on the user's device — nothing is uploaded.
 */

const DB_NAME = 'imagease-history'
const DB_VERSION = 1
const STORE = 'images'
const MAX_ITEMS = 40

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('uploadedAt', 'uploadedAt', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'))
  })
}

/** Make a small JPEG thumbnail for the history grid. */
function makeThumbnail(fileOrBlob, maxSize = 320, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(fileOrBlob)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight))
      const w = Math.max(1, Math.round(img.naturalWidth * scale))
      const h = Math.max(1, Math.round(img.naturalHeight * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Thumbnail failed'))),
        'image/jpeg',
        quality
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image for thumbnail'))
    }
    img.src = url
  })
}

export async function listHistory() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).index('uploadedAt').getAll()
    req.onsuccess = () => {
      const items = (req.result || []).sort((a, b) => b.uploadedAt - a.uploadedAt)
      resolve(items)
    }
    req.onerror = () => reject(req.error)
  })
}

export async function getHistoryItem(id) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(id)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
  })
}

/**
 * Save an uploaded File to history.
 * Skips exact duplicates uploaded within a short window (same name + size).
 */
export async function saveToHistory(file) {
  if (!file || !file.type?.startsWith('image/')) return null

  const existing = await listHistory()
  const recentDup = existing.find(
    (item) =>
      item.name === file.name &&
      item.size === file.size &&
      Date.now() - item.uploadedAt < 60_000
  )
  if (recentDup) return recentDup

  const thumbnail = await makeThumbnail(file)
  const blob = file.slice(0, file.size, file.type)

  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    name: file.name || 'untitled',
    type: file.type || 'image/jpeg',
    size: file.size,
    width: 0,
    height: 0,
    uploadedAt: Date.now(),
    blob,
    thumbnail,
  }

  // Capture dimensions
  try {
    const src = URL.createObjectURL(file)
    await new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        entry.width = img.naturalWidth
        entry.height = img.naturalHeight
        URL.revokeObjectURL(src)
        resolve()
      }
      img.onerror = () => {
        URL.revokeObjectURL(src)
        resolve()
      }
      img.src = src
    })
  } catch {
    // ignore dimension errors
  }

  const db = await openDB()
  const tx = db.transaction(STORE, 'readwrite')
  tx.objectStore(STORE).put(entry)

  // Prune oldest if over limit
  const all = existing.concat(entry).sort((a, b) => b.uploadedAt - a.uploadedAt)
  if (all.length > MAX_ITEMS) {
    const toRemove = all.slice(MAX_ITEMS)
    for (const item of toRemove) {
      tx.objectStore(STORE).delete(item.id)
    }
  }

  await txDone(tx)
  return entry
}

export async function deleteHistoryItems(ids) {
  if (!ids?.length) return
  const db = await openDB()
  const tx = db.transaction(STORE, 'readwrite')
  const store = tx.objectStore(STORE)
  for (const id of ids) store.delete(id)
  await txDone(tx)
}

export async function clearHistory() {
  const db = await openDB()
  const tx = db.transaction(STORE, 'readwrite')
  tx.objectStore(STORE).clear()
  await txDone(tx)
}

/** Format uploadedAt for display. */
export function formatHistoryDate(ts) {
  const d = new Date(ts)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfYesterday = new Date(startOfToday)
  startOfYesterday.setDate(startOfYesterday.getDate() - 1)

  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  if (d >= startOfToday) return `Today · ${time}`
  if (d >= startOfYesterday) return `Yesterday · ${time}`

  return d.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  }) + ` · ${time}`
}

export function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
