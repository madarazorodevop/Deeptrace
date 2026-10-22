import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { open } from 'node:fs/promises'
import path from 'node:path'

export const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp'])
export const VIDEO_EXTENSIONS = new Set([
  '.mp4',
  '.m4v',
  '.mov',
  '.avi',
  '.mkv',
  '.webm',
])
export const AUDIO_EXTENSIONS = new Set([
  '.wav',
  '.mp3',
  '.m4a',
  '.aac',
  '.flac',
  '.ogg',
  '.opus',
])

const EXTENSION_TYPES = new Map([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
  ['.mp4', 'video/mp4'],
  ['.m4v', 'video/x-m4v'],
  ['.mov', 'video/quicktime'],
  ['.avi', 'video/x-msvideo'],
  ['.mkv', 'video/x-matroska'],
  ['.webm', 'video/webm'],
  ['.wav', 'audio/wav'],
  ['.mp3', 'audio/mpeg'],
  ['.m4a', 'audio/mp4'],
  ['.aac', 'audio/aac'],
  ['.flac', 'audio/flac'],
  ['.ogg', 'audio/ogg'],
  ['.opus', 'audio/opus'],
])

export function mediaKind(fileName) {
  const extension = path.extname(fileName ?? '').toLowerCase()
  if (IMAGE_EXTENSIONS.has(extension)) return 'image'
  if (VIDEO_EXTENSIONS.has(extension)) return 'video'
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio'
  return null
}

export function mediaTypeFor(fileName) {
  return EXTENSION_TYPES.get(path.extname(fileName ?? '').toLowerCase())
}

export function isSupportedUpload(fileName, mimeType) {
  const kind = mediaKind(fileName)
  if (!kind) return false
  if (!mimeType || mimeType === 'application/octet-stream') return true

  return mimeType.startsWith(`${kind}/`)
}

export async function sniffMedia(filePath, kind = null) {
  const handle = await open(filePath, 'r')
  const header = Buffer.alloc(32)

  try {
    await handle.read(header, 0, header.length, 0)
  } finally {
    await handle.close()
  }

  if (header.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    return 'image/jpeg'
  }
  if (header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png'
  }
  if (
    header.subarray(0, 4).toString('ascii') === 'RIFF' &&
    header.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp'
  }
  if (
    header.subarray(0, 4).toString('ascii') === 'RIFF' &&
    header.subarray(8, 12).toString('ascii') === 'WAVE'
  ) {
    return 'audio/wav'
  }
  if (header.subarray(0, 4).toString('ascii') === 'OggS') {
    return 'audio/ogg'
  }
  if (header.subarray(0, 4).toString('ascii') === 'fLaC') {
    return 'audio/flac'
  }
  if (
    header.subarray(0, 3).toString('ascii') === 'ID3' ||
    (header[0] === 0xff && (header[1] & 0xe0) === 0xe0)
  ) {
    return 'audio/mpeg'
  }
  if (header.length >= 12 && header.subarray(4, 8).toString('ascii') === 'ftyp') {
    return kind === 'audio' ? 'audio/mp4' : 'video/mp4'
  }
  if (
    header.subarray(0, 4).toString('ascii') === 'RIFF' &&
    header.subarray(8, 12).toString('ascii') === 'AVI '
  ) {
    return 'video/x-msvideo'
  }
  if (header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) {
    return 'video/webm'
  }

  return null
}

export async function sha256File(filePath) {
  const hash = createHash('sha256')

  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', resolve)
    stream.on('error', reject)
  })

  return hash.digest('hex')
}
