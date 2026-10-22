import { execFile } from 'node:child_process'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { config } from '../config.js'
import { httpError } from '../utils/httpError.js'

const execFileAsync = promisify(execFile)

async function runMediaCommand(command, args, timeout, label) {
  try {
    return await execFileAsync(command, args, {
      timeout,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
    })
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw httpError(
        503,
        'media_tool_unavailable',
        `${label} is not installed or not on PATH.`,
      )
    }
    if (error.killed || error.signal) {
      throw httpError(504, 'media_tool_timeout', `${label} did not finish in time.`)
    }
    throw httpError(422, 'media_unreadable', `${label} could not read the uploaded media.`)
  }
}

export async function probeVideo(filePath) {
  const { stdout } = await runMediaCommand(
    config.ffprobePath,
    [
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      filePath,
    ],
    15000,
    'ffprobe',
  )

  let probe
  try {
    probe = JSON.parse(stdout)
  } catch {
    throw httpError(502, 'media_probe_failed', 'ffprobe returned an unreadable response.')
  }

  const streams = Array.isArray(probe.streams) ? probe.streams : []
  const videoStreams = streams.filter((stream) => stream.codec_type === 'video')
  if (videoStreams.length === 0) {
    throw httpError(422, 'no_video_stream', 'The uploaded file contains no video stream.')
  }

  const durationValue = probe.format?.duration ?? videoStreams[0].duration
  const duration = Number(durationValue)
  if (!Number.isFinite(duration) || duration <= 0) {
    throw httpError(
      422,
      'video_duration_unknown',
      'The video duration could not be determined; analysis was not started.',
    )
  }

  if (duration > config.maxDurationSec) {
    throw httpError(
      413,
      'video_too_long',
      `Video duration exceeds the ${config.maxDurationSec} second limit.`,
    )
  }

  const primary = videoStreams[0]
  return {
    duration_seconds: duration,
    video_stream_count: videoStreams.length,
    audio_stream_count: streams.filter((stream) => stream.codec_type === 'audio').length,
    width: primary.width ?? null,
    height: primary.height ?? null,
    codec: primary.codec_name ?? null,
    format_name: probe.format?.format_name ?? null,
  }
}

export async function extractFrames(filePath) {
  const frameDirectory = await mkdtemp(path.join(os.tmpdir(), 'deeptrace-frames-'))
  const outputPattern = path.join(frameDirectory, 'frame-%04d.jpg')

  try {
    await runMediaCommand(
      config.ffmpegPath,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        filePath,
        '-vf',
        'fps=1',
        '-q:v',
        '2',
        '-start_number',
        '0',
        outputPattern,
      ],
      Math.max(120000, config.maxDurationSec * 3000),
      'ffmpeg',
    )

    const fileNames = (await readdir(frameDirectory))
      .filter((name) => /^frame-\d+\.jpg$/.test(name))
      .sort()

    if (fileNames.length === 0) {
      throw httpError(422, 'frame_extraction_failed', 'No frames could be extracted from the video.')
    }

    const frameNumbers = fileNames.map((name) => Number(name.match(/(\d+)/)[1]))
    const firstNumber = Math.min(...frameNumbers)

    return {
      directory: frameDirectory,
      frames: fileNames.map((name, index) => ({
        filePath: path.join(frameDirectory, name),
        fileName: name,
        sampleIndex: index,
        timestampSeconds: frameNumbers[index] - firstNumber,
      })),
    }
  } catch (error) {
    await rm(frameDirectory, { recursive: true, force: true }).catch(() => {})
    throw error
  }
}

export async function cleanupFrames(directory) {
  if (directory) {
    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }
}
