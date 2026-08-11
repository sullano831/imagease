import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import { normalizeCoords, reverseGeocode } from './geotag'

// Fix Vite + Leaflet default marker asset paths
const DefaultIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})
L.Marker.prototype.options.icon = DefaultIcon

const DEFAULT_CENTER = [20, 0]
const DEFAULT_ZOOM = 2
const SELECTED_ZOOM = 14

/**
 * Leaflet map for geotag: click to pin, syncs with selected location.
 */
export default function GeoMapPicker({ selected, onSelect, onManualOpen }) {
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const markerRef = useRef(null)
  const onSelectRef = useRef(onSelect)
  const [resolving, setResolving] = useState(false)

  onSelectRef.current = onSelect

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return undefined

    const map = L.map(mapRef.current, {
      center: selected ? [selected.lat, selected.lng] : DEFAULT_CENTER,
      zoom: selected ? SELECTED_ZOOM : DEFAULT_ZOOM,
      scrollWheelZoom: true,
      attributionControl: true,
    })

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      maxZoom: 19,
      subdomains: 'abcd',
    }).addTo(map)

    map.on('click', async (e) => {
      const { lat, lng } = e.latlng
      const normalized = normalizeCoords(lat, lng)
      if (!normalized.ok) return

      setResolving(true)
      try {
        const place = await reverseGeocode(normalized.lat, normalized.lng)
        if (place) onSelectRef.current?.(place)
      } finally {
        setResolving(false)
      }
    })

    mapInstance.current = map

    // Leaflet needs a size pass after mount in flex layouts
    requestAnimationFrame(() => map.invalidateSize())

    return () => {
      map.remove()
      mapInstance.current = null
      markerRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapInstance.current
    if (!map) return

    if (!selected || Number.isNaN(selected.lat) || Number.isNaN(selected.lng)) {
      if (markerRef.current) {
        map.removeLayer(markerRef.current)
        markerRef.current = null
      }
      return
    }

    const latLng = [selected.lat, selected.lng]
    if (!markerRef.current) {
      markerRef.current = L.marker(latLng, { draggable: true }).addTo(map)
      markerRef.current.on('dragend', async (e) => {
        const pos = e.target.getLatLng()
        setResolving(true)
        try {
          const place = await reverseGeocode(pos.lat, pos.lng)
          if (place) onSelectRef.current?.(place)
        } finally {
          setResolving(false)
        }
      })
    } else {
      markerRef.current.setLatLng(latLng)
    }

    const currentZoom = map.getZoom()
    map.setView(latLng, Math.max(currentZoom, SELECTED_ZOOM), { animate: true })
    requestAnimationFrame(() => map.invalidateSize())
  }, [selected?.lat, selected?.lng, selected?.id])

  return (
    <div className="geo-map-block">
      <div className="geo-map-toolbar">
        <span className="geo-map-hint">
          {resolving ? 'Finding place name…' : 'Click the map or drag the pin to set a location'}
        </span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onManualOpen}>
          Manually set coordinates
        </button>
      </div>
      <div ref={mapRef} className="geo-map" role="application" aria-label="Location map" />
    </div>
  )
}

/**
 * Modal for typing exact latitude / longitude.
 */
export function ManualCoordsModal({ initialLat = '', initialLng = '', onClose, onConfirm, busy }) {
  const [lat, setLat] = useState(
    initialLat === '' || initialLat == null ? '' : String(initialLat)
  )
  const [lng, setLng] = useState(
    initialLng === '' || initialLng == null ? '' : String(initialLng)
  )
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    const normalized = normalizeCoords(lat, lng)
    if (!normalized.ok) {
      setError(normalized.error)
      return
    }
    setError('')
    await onConfirm(normalized.lat, normalized.lng)
  }

  return (
    <div className="modal-backdrop" onClick={() => !busy && onClose()}>
      <div
        className="confirm-modal manual-coords-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="manual-coords-title"
      >
        <div className="manual-coords-header">
          <h2 id="manual-coords-title" className="confirm-modal-title">Manually set coordinates</h2>
          <button type="button" className="modal-close" onClick={onClose} disabled={busy} aria-label="Close">
            ×
          </button>
        </div>

        <label className="manual-coords-label" htmlFor="manual-lat">
          Latitude (−90 to 90)
        </label>
        <input
          id="manual-lat"
          className="input-field manual-coords-input"
          type="number"
          step="any"
          min="-90"
          max="90"
          value={lat}
          onChange={(e) => setLat(e.target.value)}
          disabled={busy}
          autoFocus
        />

        <label className="manual-coords-label" htmlFor="manual-lng">
          Longitude (−180 to 180)
        </label>
        <input
          id="manual-lng"
          className="input-field manual-coords-input"
          type="number"
          step="any"
          min="-180"
          max="180"
          value={lng}
          onChange={(e) => setLng(e.target.value)}
          disabled={busy}
        />

        {error && <p className="geotag-error">{error}</p>}

        <div className="confirm-modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={busy}>
            {busy ? 'Setting…' : 'Set location'}
          </button>
        </div>
      </div>
    </div>
  )
}
