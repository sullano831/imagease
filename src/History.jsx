import { useEffect, useMemo, useState } from 'react'
import {
  listHistory,
  deleteHistoryItems,
  clearHistory,
  formatHistoryDate,
  formatFileSize,
} from './historyStore'

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" width="18" height="18">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}

function thumbUrl(item) {
  if (!item?.thumbnail && !item?.blob) return ''
  return URL.createObjectURL(item.thumbnail || item.blob)
}

function HistoryThumb({ item }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    const url = thumbUrl(item)
    setSrc(url)
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [item.id]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!src) return <div className="history-thumb placeholder" />
  return <img className="history-thumb" src={src} alt={item.name} loading="lazy" />
}

function ReuseModal({ item, onReuse, onClose, reusing }) {
  const [preview, setPreview] = useState('')

  useEffect(() => {
    if (!item?.blob) return
    const url = URL.createObjectURL(item.blob)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [item])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="history-modal" onClick={(e) => e.stopPropagation()}>
        <div className="history-modal-header">
          <div>
            <h2 className="history-modal-title">{item.name}</h2>
            <p className="history-modal-meta">
              {formatHistoryDate(item.uploadedAt)}
              {item.width ? ` · ${item.width} × ${item.height}` : ''}
              {item.size ? ` · ${formatFileSize(item.size)}` : ''}
            </p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close"><CloseIcon /></button>
        </div>

        <div className="history-modal-preview">
          {preview && <img src={preview} alt={item.name} />}
        </div>

        <div className="history-modal-actions">
          <button className="btn btn-ghost" onClick={onClose} disabled={reusing}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onReuse(item)} disabled={reusing}>
            {reusing ? 'Opening…' : 'Reuse image'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ConfirmDeleteModal({ title, message, confirmLabel = 'Delete', onConfirm, onClose, busy }) {
  return (
    <div className="modal-backdrop" onClick={() => !busy && onClose()}>
      <div className="confirm-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="confirm-modal-icon">
          <TrashIcon />
        </div>
        <h2 className="confirm-modal-title">{title}</h2>
        <p className="confirm-modal-message">{message}</p>
        <div className="confirm-modal-actions">
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-delete-confirm" onClick={onConfirm} disabled={busy}>
            {busy ? 'Deleting…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function History({ onReuse, onBack }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(() => new Set())
  const [previewItem, setPreviewItem] = useState(null)
  const [reusing, setReusing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null) // { type: 'selected' | 'all' }

  const refresh = async () => {
    setLoading(true)
    try {
      const list = await listHistory()
      setItems(list)
      setSelected(new Set())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  const allSelected = items.length > 0 && selected.size === items.length
  const someSelected = selected.size > 0

  const grouped = useMemo(() => {
    const groups = []
    for (const item of items) {
      const dayKey = new Date(item.uploadedAt).toDateString()
      let group = groups.find((g) => g.dayKey === dayKey)
      if (!group) {
        group = { dayKey, items: [] }
        groups.push(group)
      }
      group.items.push(item)
    }
    return groups.map((g) => {
      const d = new Date(g.dayKey)
      const today = new Date()
      const yesterday = new Date()
      yesterday.setDate(today.getDate() - 1)
      let title = d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })
      if (d.toDateString() === today.toDateString()) title = 'Today'
      else if (d.toDateString() === yesterday.toDateString()) title = 'Yesterday'
      return { ...g, title }
    })
  }, [items])

  const toggleOne = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(items.map((i) => i.id)))
  }

  const openDeleteSelected = () => {
    if (!someSelected) return
    setConfirmDelete({ type: 'selected' })
  }

  const openDeleteAll = () => {
    if (!items.length) return
    setConfirmDelete({ type: 'all' })
  }

  const runConfirmedDelete = async () => {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      if (confirmDelete.type === 'all') {
        await clearHistory()
      } else {
        await deleteHistoryItems([...selected])
      }
      setConfirmDelete(null)
      await refresh()
    } finally {
      setDeleting(false)
    }
  }

  const handleReuse = async (item) => {
    setReusing(true)
    try {
      await onReuse(item)
    } finally {
      setReusing(false)
      setPreviewItem(null)
    }
  }

  const selectedCount = selected.size
  const confirmTitle = confirmDelete?.type === 'all'
    ? 'Delete all history?'
    : `Delete ${selectedCount} image${selectedCount === 1 ? '' : 's'}?`
  const confirmMessage = confirmDelete?.type === 'all'
    ? 'This will permanently remove every uploaded image from your history on this device. This cannot be undone.'
    : `The selected image${selectedCount === 1 ? '' : 's'} will be permanently removed from history on this device. This cannot be undone.`

  return (
    <section className="history-section">
      <div className="history-topbar">
        <div>
          <h1 className="history-title">Upload history</h1>
          <p className="history-sub">Saved only on this device — reuse any photo anytime.</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onBack}>← Back</button>
      </div>

      {items.length > 0 && (
        <div className="history-toolbar">
          <label className="history-check-all">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
            <span>{allSelected ? 'Unselect all' : 'Select all'}</span>
          </label>

          <div className="history-toolbar-actions">
            <button
              className="btn btn-ghost btn-sm"
              disabled={!someSelected || deleting}
              onClick={openDeleteSelected}
            >
              <TrashIcon /> Delete selected ({selected.size})
            </button>
            <button
              className="btn btn-ghost btn-sm btn-danger"
              disabled={deleting}
              onClick={openDeleteAll}
            >
              Delete all
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="processing-state"><div className="spinner" /><p>Loading history…</p></div>
      ) : items.length === 0 ? (
        <div className="history-empty">
          <p className="history-empty-title">No uploads yet</p>
          <p className="history-empty-sub">Images you upload will appear here so you can reuse them later.</p>
          <button className="btn btn-primary" onClick={onBack}>Upload an image</button>
        </div>
      ) : (
        <div className="history-groups">
          {grouped.map((group) => (
            <div key={group.dayKey} className="history-group">
              <h2 className="history-group-title">{group.title}</h2>
              <div className="history-grid">
                {group.items.map((item) => {
                  const isChecked = selected.has(item.id)
                  return (
                    <div key={item.id} className={`history-card ${isChecked ? 'selected' : ''}`}>
                      <label className="history-card-check" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleOne(item.id)}
                        />
                      </label>
                      <button
                        type="button"
                        className="history-card-btn"
                        onClick={() => setPreviewItem(item)}
                      >
                        <HistoryThumb item={item} />
                        <div className="history-card-info">
                          <span className="history-card-name" title={item.name}>{item.name}</span>
                          <span className="history-card-date">{formatHistoryDate(item.uploadedAt)}</span>
                          <span className="history-card-meta">
                            {item.width && item.height ? `${item.width} × ${item.height}` : 'Image'}
                            {item.size ? ` · ${formatFileSize(item.size)}` : ''}
                          </span>
                        </div>
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {previewItem && (
        <ReuseModal
          item={previewItem}
          onReuse={handleReuse}
          onClose={() => !reusing && setPreviewItem(null)}
          reusing={reusing}
        />
      )}

      {confirmDelete && (
        <ConfirmDeleteModal
          title={confirmTitle}
          message={confirmMessage}
          confirmLabel={confirmDelete.type === 'all' ? 'Delete all' : 'Delete'}
          onConfirm={runConfirmedDelete}
          onClose={() => !deleting && setConfirmDelete(null)}
          busy={deleting}
        />
      )}
    </section>
  )
}
