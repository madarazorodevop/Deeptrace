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

export const config = {
  port: readPositiveInt('PORT', 8080, 65535),
  clientOrigins: readClientOrigins(
    process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  ),
  maxFileMb: readPositiveInt('MAX_FILE_MB', 50),
  maxDurationSec: readPositiveInt('MAX_DURATION_SEC', 60),
  retentionMinutes: readPositiveInt('RETENTION_MINUTES', 60),
  maxConcurrentJobs: readPositiveInt('MAX_CONCURRENT_JOBS', 2),
}
