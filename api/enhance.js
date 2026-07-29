/**
 * Vercel serverless function — CORS proxy for AI image enhancement APIs.
 * Receives base64 image + provider choice, returns enhanced base64 image.
 * API keys are passed in request headers (never stored server-side).
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { imageBase64, mimeType = 'image/webp', provider } = req.body
  const apiKey = req.headers['x-api-key']

  if (!imageBase64) return res.status(400).json({ error: 'Missing imageBase64' })
  if (!apiKey) return res.status(400).json({ error: 'Missing API key' })

  try {
    let enhanced

    if (provider === 'replicate') {
      enhanced = await enhanceReplicate(imageBase64, mimeType, apiKey)
    } else if (provider === 'stability') {
      enhanced = await enhanceStability(imageBase64, mimeType, apiKey)
    } else if (provider === 'deepai') {
      enhanced = await enhanceDeepAI(imageBase64, mimeType, apiKey)
    } else {
      return res.status(400).json({ error: `Unknown provider: ${provider}` })
    }

    res.status(200).json({ enhanced })
  } catch (err) {
    res.status(500).json({ error: err.message || 'Enhancement failed' })
  }
}

// ── Replicate (Real-ESRGAN) ──────────────────────────────────────

async function enhanceReplicate(imageBase64, mimeType, apiKey) {
  const dataURI = `data:${mimeType};base64,${imageBase64}`

  // Create prediction
  const createRes = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version: 'f121d640bd286e1fdc67f9799164c1d5be36ff74576ee11c803ae5b665dd46aa',
      input: { image: dataURI, scale: 2, face_enhance: false },
    }),
  })

  if (!createRes.ok) {
    const err = await createRes.json()
    throw new Error(`Replicate: ${err.detail || createRes.statusText}`)
  }

  const prediction = await createRes.json()

  // Poll until complete
  const outputURL = await pollReplicate(prediction.id, apiKey)

  // Fetch the output image and convert to base64
  const imgRes = await fetch(outputURL)
  if (!imgRes.ok) throw new Error('Replicate: failed to fetch output image')
  const arrayBuffer = await imgRes.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString('base64')
  const outMime = imgRes.headers.get('content-type') || mimeType
  return `data:${outMime};base64,${base64}`
}

async function pollReplicate(predictionId, apiKey, maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(2000)
    const res = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: { Authorization: `Token ${apiKey}` },
    })
    const pred = await res.json()
    if (pred.status === 'succeeded') return pred.output
    if (pred.status === 'failed' || pred.status === 'canceled') {
      throw new Error(`Replicate prediction ${pred.status}: ${pred.error || ''}`)
    }
  }
  throw new Error('Replicate: timed out waiting for prediction')
}

// ── Stability AI (Conservative Upscaler) ────────────────────────

async function enhanceStability(imageBase64, mimeType, apiKey) {
  const buffer = Buffer.from(imageBase64, 'base64')
  const ext = mimeType.split('/')[1] || 'png'

  const form = new FormData()
  const blob = new Blob([buffer], { type: mimeType })
  form.append('image', blob, `image.${ext}`)
  form.append('output_format', 'webp')

  const res = await fetch('https://api.stability.ai/v2beta/stable-image/upscale/conservative', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
    body: form,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Stability AI: ${err.message || res.statusText}`)
  }

  const json = await res.json()
  if (json.image) return `data:image/webp;base64,${json.image}`

  // If async (generation_id returned), poll for result
  if (json.id) {
    return await pollStability(json.id, apiKey)
  }

  throw new Error('Stability AI: unexpected response format')
}

async function pollStability(generationId, apiKey, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(3000)
    const res = await fetch(
      `https://api.stability.ai/v2beta/stable-image/upscale/conservative/result/${generationId}`,
      {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      }
    )
    if (res.status === 202) continue
    if (res.ok) {
      const json = await res.json()
      if (json.image) return `data:image/webp;base64,${json.image}`
    }
    throw new Error('Stability AI: polling failed')
  }
  throw new Error('Stability AI: timed out')
}

// ── Deep AI (SRGAN) ──────────────────────────────────────────────

async function enhanceDeepAI(imageBase64, mimeType, apiKey) {
  const buffer = Buffer.from(imageBase64, 'base64')
  const ext = mimeType.split('/')[1] || 'png'

  const form = new FormData()
  form.append('image', new Blob([buffer], { type: mimeType }), `image.${ext}`)

  const res = await fetch('https://api.deepai.org/api/torch-srgan', {
    method: 'POST',
    headers: { 'api-key': apiKey },
    body: form,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Deep AI: ${err.err || res.statusText}`)
  }

  const json = await res.json()
  if (!json.output_url) throw new Error('Deep AI: no output URL returned')

  // Fetch output image
  const imgRes = await fetch(json.output_url)
  if (!imgRes.ok) throw new Error('Deep AI: failed to fetch output image')
  const arrayBuffer = await imgRes.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString('base64')
  const outMime = imgRes.headers.get('content-type') || 'image/jpeg'
  return `data:${outMime};base64,${base64}`
}

// ── Helpers ──────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
