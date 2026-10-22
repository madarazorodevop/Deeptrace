import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { config } from './config.js'
import analyzeRouter from './routes/analyze.js'
import healthRouter from './routes/health.js'
import { httpError } from './utils/httpError.js'

const app = express()
const allowedOrigins = new Set(config.clientOrigins)

app.disable('x-powered-by')
app.use(helmet())
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true)
        return
      }

      callback(
        httpError(
          403,
          'origin_not_allowed',
          'Origin is not allowed by CLIENT_ORIGIN',
        ),
      )
    },
  }),
)
app.use(express.json({ limit: '1mb' }))
app.use('/api', healthRouter)
app.use('/api', analyzeRouter)

app.use((req, res) => {
  res.status(404).json({
    error: {
      code: 'not_found',
      message: 'Route not found',
    },
  })
})

app.use((error, req, res, next) => {
  if (res.headersSent) {
    next(error)
    return
  }

  const status = Number.isInteger(error.status) ? error.status : 500
  const code =
    error.type === 'entity.parse.failed'
      ? 'invalid_json'
      : typeof error.code === 'string'
        ? error.code
        : 'internal_error'

  console.error(`[error] ${req.method} ${req.originalUrl} ${code}: ${error.message}`)

  res.status(status).json({
    error: {
      code,
      message: status >= 500 ? 'Unexpected server error' : error.message,
    },
  })
})

export default app
