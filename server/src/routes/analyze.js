import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Router } from 'express'
import multer from 'multer'
import { config } from '../config.js'
import { analyzeMedia } from '../services/analysis.js'
import { isSupportedUpload } from '../services/media.js'
import { httpError } from '../utils/httpError.js'

const router = Router()
const currentDir = path.dirname(fileURLToPath(import.meta.url))
const tmpDir = path.resolve(currentDir, '..', '..', 'tmp')
mkdirSync(tmpDir, { recursive: true })

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, callback) => callback(null, tmpDir),
    filename: (req, file, callback) => {
      const extension = path.extname(file.originalname ?? '').toLowerCase()
      callback(null, `${randomUUID()}${extension}`)
    },
  }),
  limits: {
    fileSize: config.maxFileMb * 1024 * 1024,
    files: 1,
    fields: 8,
  },
  fileFilter: (req, file, callback) => {
    if (!isSupportedUpload(file.originalname, file.mimetype)) {
      callback(
        httpError(
          415,
          'unsupported_media_type',
          'Unsupported image, video, or audio file type.',
        ),
      )
      return
    }

    callback(null, true)
  },
})

function mapUploadError(error) {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return httpError(
        413,
        'file_too_large',
        `File exceeds the ${config.maxFileMb} MiB upload limit.`,
      )
    }
    return httpError(400, 'invalid_upload', 'The upload could not be accepted.')
  }

  return error
}

function uploadSingle(req, res, next) {
  upload.single('media')(req, res, (error) => {
    if (error) {
      next(mapUploadError(error))
      return
    }
    next()
  })
}

function readAggregationMode(value) {
  const mode = typeof value === 'string' ? value : 'conf'
  if (mode !== 'conf' && mode !== 'mean' && mode !== 'vote') {
    throw httpError(
      400,
      'invalid_aggregation_mode',
      'aggMode must be one of: conf, mean, vote.',
    )
  }
  return mode
}

router.post('/analyze', uploadSingle, async (req, res, next) => {
  if (!req.file) {
    next(
      httpError(
        400,
        'missing_media',
        'Attach an image, video, or audio file in the "media" field.',
      ),
    )
    return
  }

  try {
    const aggMode = readAggregationMode(req.query.aggMode)
    const result = await analyzeMedia(req.file, aggMode)
    res.status(200).json(result)
  } catch (error) {
    next(error)
  } finally {
    await rm(req.file.path, { force: true }).catch(() => {})
  }
})

const samplesDir = path.resolve(currentDir, '..', '..', 'samples')

const SAMPLES = [
  { id: 'portrait_real.jpg', label: 'Real Portrait', desc: 'Grace Hopper photo', type: 'image' },
  { id: 'face_sample.jpg', label: 'Face Scene', desc: 'Zidane sports portrait', type: 'image' },
  { id: 'nature_sample.jpg', label: 'Non-Facial Image', desc: 'Macro flower photography', type: 'image' },
  { id: 'video_sample.mp4', label: 'Sample Video', desc: '2-second video clip', type: 'video' },
]

router.get('/samples', (req, res) => {
  res.json({ samples: SAMPLES })
})

router.get('/samples/:id', (req, res, next) => {
  const sample = SAMPLES.find((s) => s.id === req.params.id)
  if (!sample) {
    next(httpError(404, 'sample_not_found', 'Sample not found'))
    return
  }
  const filePath = path.join(samplesDir, sample.id)
  res.sendFile(filePath)
})

export default router
