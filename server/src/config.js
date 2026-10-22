import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const serverRoot = path.resolve(currentDir, '..')
const projectRoot = path.resolve(serverRoot, '..')
const serverEnvPath = path.join(serverRoot, '.env')
const rootEnvPath = path.join(projectRoot, '.env')
const envPath = fs.existsSync(serverEnvPath) ? serverEnvPath : rootEnvPath

dotenv.config({ path: envPath, quiet: true })

function readPositiveInt(name, fallback, max = Number.MAX_SAFE_INTEGER) {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback

  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${name} must be an integer between 1 and ${max}`)
  }

  return value
}

function readClientOrigins(value) {
  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  if (origins.length === 0) {
    throw new Error('CLIENT_ORIGIN must contain at least one origin')
  }

  return origins
}

function readDetectorMode(value) {
  if (value !== 'real' && value !== 'disabled') {
    throw new Error('DETECTOR_MODE must be "real" or "disabled"')
  }

  return value
}

function readLocalDetectorUrl(value) {
  let parsed
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('DETECTOR_BASE_URL must be a valid URL')
  }

  if (parsed.protocol !== 'http:') {
    throw new Error('DETECTOR_BASE_URL must use http')
  }

  if (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') {
    throw new Error('DETECTOR_BASE_URL must point to localhost or 127.0.0.1')
  }

  return parsed.origin
}

export const config = {
  port: readPositiveInt('PORT', 8080, 65535),
  clientOrigins: readClientOrigins(
    process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  ),
  maxFileMb: readPositiveInt('MAX_FILE_MB', 50),
  maxImageMb: readPositiveInt('MAX_IMAGE_MB', 20),
  maxVideoMb: readPositiveInt('MAX_VIDEO_MB', 50),
  maxAudioMb: readPositiveInt('MAX_AUDIO_MB', 50),
  maxDurationSec: readPositiveInt('MAX_DURATION_SEC', 60),
  retentionMinutes: readPositiveInt('RETENTION_MINUTES', 60),
  maxConcurrentJobs: readPositiveInt('MAX_CONCURRENT_JOBS', 2),
  detectorMode: readDetectorMode(process.env.DETECTOR_MODE ?? 'real'),
  detectorBaseUrl: readLocalDetectorUrl(
    process.env.DETECTOR_BASE_URL ?? 'http://127.0.0.1:8000',
  ),
  detectorTimeoutMs: readPositiveInt(
    'DETECTOR_TIMEOUT_MS',
    300000,
    600000,
  ),
  ffmpegPath: process.env.FFMPEG_PATH ?? 'ffmpeg',
  ffprobePath: process.env.FFPROBE_PATH ?? 'ffprobe',
}
