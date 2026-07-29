import { useState } from 'react'
import { AI_PROVIDERS, loadApiKeys, saveApiKeys } from './aiEnhance'

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
      strokeLinecap="round" width="18" height="18">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  )
}

function ExternalIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" width="12" height="12">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
      <polyline points="15 3 21 3 21 9"/>
      <line x1="10" y1="14" x2="21" y2="3"/>
    </svg>
  )
}

function EyeIcon({ show }) {
  return show ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  )
}

export default function Settings({ onClose }) {
  const [keys, setKeys] = useState(loadApiKeys)
  const [showKey, setShowKey] = useState({})
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    saveApiKeys(keys)
    setSaved(true)
    setTimeout(() => { setSaved(false); onClose() }, 900)
  }

  const toggleShow = (id) => setShowKey(p => ({ ...p, [id]: !p[id] }))

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="modal-header">
          <div>
            <h2 className="modal-title">AI Enhancement Settings</h2>
            <p className="modal-subtitle">API keys are stored only in your browser — never sent to our servers.</p>
          </div>
          <button className="modal-close" onClick={onClose}><CloseIcon /></button>
        </div>

        {/* Info box */}
        <div className="modal-info">
          <span className="info-icon">ℹ</span>
          <div>
            <strong>Why not ChatGPT, Claude, Gemini or Grok?</strong>
            <p>Those are language models — they can't enhance or upscale images without re-generating and changing the content. The services below use <strong>Real-ESRGAN</strong> and dedicated upscaling neural networks that sharpen pixels without altering your image.</p>
          </div>
        </div>

        {/* Provider rows */}
        <div className="modal-providers">
          {AI_PROVIDERS.map((p) => (
            <div key={p.id} className="provider-row">
              <div className="provider-header">
                <span className="provider-dot" style={{ background: p.color }} />
                <div>
                  <div className="provider-name">{p.label}</div>
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="provider-link"
                  >
                    {p.keyHint} <ExternalIcon />
                  </a>
                </div>
              </div>
              <div className="key-input-row">
                <input
                  className="input-field key-input"
                  type={showKey[p.id] ? 'text' : 'password'}
                  placeholder={p.keyPlaceholder}
                  value={keys[p.id] || ''}
                  onChange={e => setKeys(k => ({ ...k, [p.id]: e.target.value }))}
                  spellCheck={false}
                  autoComplete="off"
                />
                <button className="key-toggle" onClick={() => toggleShow(p.id)} title={showKey[p.id] ? 'Hide' : 'Show'}>
                  <EyeIcon show={showKey[p.id]} />
                </button>
                {keys[p.id] && (
                  <button className="key-clear" onClick={() => setKeys(k => ({ ...k, [p.id]: '' }))}>✕</button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Fallback note */}
        <div className="modal-fallback">
          <span>🔁</span>
          <span>Providers are tried in order above. If one fails or runs out of credits, the next is used automatically. If all fail, <strong>Quick Enhance</strong> (local) is used as the final fallback.</span>
        </div>

        {/* Save */}
        <div className="modal-footer">
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button className={`btn btn-primary ${saved ? 'btn-saved' : ''}`} onClick={handleSave}>
            {saved ? '✓ Saved!' : 'Save API Keys'}
          </button>
        </div>
      </div>
    </div>
  )
}
