/**
 * AI-based image enhancement — calls /api/enhance with automatic provider fallback.
 * Providers tried in order: Replicate → Stability AI → Deep AI → local Unsharp Mask.
 */

export const AI_PROVIDERS = [
  {
    id: 'replicate',
    name: 'Replicate',
    label: 'Real-ESRGAN via Replicate',
    url: 'https://replicate.com',
    keyPlaceholder: 'r8_xxxxxxxxxxxxxxxxxxxx',
    keyHint: 'Get free key → replicate.com/account/api-tokens',
    color: '#0571e3',
  },
  {
    id: 'stability',
    name: 'Stability AI',
    label: 'Conservative Upscaler via Stability AI',
    url: 'https://platform.stability.ai',
    keyPlaceholder: 'sk-xxxxxxxxxxxxxxxxxxxx',
    keyHint: 'Get key → platform.stability.ai/account/keys',
    color: '#7c3aed',
  },
  {
    id: 'deepai',
    name: 'Deep AI',
    label: 'SRGAN via Deep AI',
    url: 'https://deepai.org',
    keyPlaceholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    keyHint: 'Get free key → deepai.org/dashboard',
    color: '#059669',
  },
]

/**
 * Converts a dataURL to a base64 string (strips the header).
 */
function dataURLtoBase64(dataURL) {
  return dataURL.split(',')[1]
}

/**
 * Tries AI providers in order. Falls back to the next when one fails.
 * @param {string} dataURL         - input image dataURL
 * @param {string} mimeType        - output mime type
 * @param {Object} apiKeys         - { replicate, stability, deepai }
 * @param {Function} onStatus      - callback(message: string | null)
 * @returns {Promise<{dataURL: string, provider: string}>}
 */
export async function aiEnhance(dataURL, mimeType, apiKeys, onStatus) {
  const imageBase64 = dataURLtoBase64(dataURL)
  const enabledProviders = AI_PROVIDERS.filter((p) => apiKeys[p.id]?.trim())

  if (enabledProviders.length === 0) {
    throw new Error('NO_KEYS')
  }

  for (const provider of enabledProviders) {
    try {
      onStatus?.(`Trying ${provider.name}…`)
      const res = await fetch('/api/enhance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKeys[provider.id].trim(),
        },
        body: JSON.stringify({ imageBase64, mimeType, provider: provider.id }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const msg = err.error || `HTTP ${res.status}`
        // If it's a credit / quota error, try the next provider
        if (isQuotaError(msg)) {
          onStatus?.(`${provider.name} credits exhausted — trying next…`)
          continue
        }
        throw new Error(msg)
      }

      const json = await res.json()
      if (!json.enhanced) throw new Error('Empty response from server')

      onStatus?.(null)
      return { dataURL: json.enhanced, provider: provider.name }
    } catch (err) {
      if (err.message === 'Failed to fetch') {
        // Network / CORS issue — skip silently in dev, show in prod
        onStatus?.(`${provider.name} unreachable — trying next…`)
        continue
      }
      if (isQuotaError(err.message)) {
        onStatus?.(`${provider.name} credits exhausted — trying next…`)
        continue
      }
      // Non-quota error — re-throw so caller can decide
      throw err
    }
  }

  throw new Error('ALL_FAILED')
}

function isQuotaError(msg = '') {
  const m = msg.toLowerCase()
  return (
    m.includes('quota') ||
    m.includes('rate limit') ||
    m.includes('exceeded') ||
    m.includes('402') ||
    m.includes('429') ||
    m.includes('credit') ||
    m.includes('billing')
  )
}

/** Load API keys from localStorage */
export function loadApiKeys() {
  try {
    return JSON.parse(localStorage.getItem('imagesizer_api_keys') || '{}')
  } catch {
    return {}
  }
}

/** Save API keys to localStorage */
export function saveApiKeys(keys) {
  localStorage.setItem('imagesizer_api_keys', JSON.stringify(keys))
}
