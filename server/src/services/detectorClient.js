import { readFile } from 'node:fs/promises'
import { config } from '../config.js'
import { httpError } from '../utils/httpError.js'

export async function analyzeImageWithDetector(filePath, fileName, contentType) {
  if (config.detectorMode === 'disabled') {
    throw httpError(
      503,
      'detector_disabled',
      'The detector is disabled. Set DETECTOR_MODE=real to enable local analysis.',
    )
  }

  const form = new FormData()
  const buffer = await readFile(filePath)
  form.append('file', new Blob([buffer], { type: contentType }), fileName)

  const url = new URL('/analyze/image', config.detectorBaseUrl)
  url.searchParams.set('tta_hflip', '0')

  let response
  try {
    response = await fetch(url, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(config.detectorTimeoutMs),
    })
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      throw httpError(
        504,
        'detector_timeout',
        'The local detector did not respond within the configured timeout.',
      )
    }
    throw httpError(
      503,
      'detector_unavailable',
      'The local detector is not reachable. Start the FastAPI detector service.',
    )
  }

  let body
  try {
    body = await response.json()
  } catch {
    throw httpError(502, 'detector_invalid_response', 'The local detector returned invalid JSON.')
  }

  if (!response.ok) {
    const code = body?.error?.code ?? 'detector_request_failed'
    const message = body?.error?.message ?? 'The local detector rejected the request.'
    throw httpError(response.status >= 500 ? 502 : response.status, code.toLowerCase(), message)
  }

  if (body?.status !== 'evaluated' && body?.status !== 'inconclusive') {
    throw httpError(502, 'detector_invalid_response', 'The local detector returned an unexpected status.')
  }

  return body
}
