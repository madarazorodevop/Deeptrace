import app from './app.js'
import { config } from './config.js'

const server = app.listen(config.port, () => {
  console.log(`DeepTrace API listening on http://localhost:${config.port}`)
})

function shutdown(signal) {
  console.log(`${signal} received, closing HTTP server`)

  server.close((error) => {
    if (error) {
      console.error('[fatal] Failed to close HTTP server:', error.message)
      process.exitCode = 1
      return
    }

    process.exitCode = 0
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
