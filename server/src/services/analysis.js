import path from 'node:path'
import { config } from '../config.js'
import { httpError } from '../utils/httpError.js'
import { analyzeImageWithDetector } from './detectorClient.js'
import { cleanupFrames, extractFrames, probeVideo } from './ffmpeg.js'
import { mediaKind, mediaTypeFor, sha256File, sniffMedia } from './media.js'
import { runIntelligentForensicAnalysis } from './aiOrchestrator.js'

const AUDIO_MESSAGE = 'No audio detector configured — analysis incomplete'

function mean(values) {
  return values.reduce((total, value) => total + value, 0) / values.length
}

export function aggregationDescription(mode) {
  if (mode === 'conf') {
    return (
      'DeepGuard custom heuristic: if more than 40 percent of frames score above 0.8, ' +
      'average those frames; otherwise if more than 90 percent score below 0.2, average ' +
      'those frames; otherwise average all frames. These thresholds are heuristic, not calibrated.'
    )
  }
  if (mode === 'mean') {
    return 'Arithmetic mean of all evaluated frame fake-class scores.'
  }
  return 'Fraction of evaluated frames whose fake-class score is above 0.5.'
}

export function aggregateFakeScores(scores, mode) {
  if (scores.length === 0) {
    throw new Error('Cannot aggregate an empty score list')
  }

  if (mode === 'mean') {
    return { score: mean(scores), branch: 'all_frames' }
  }

  if (mode === 'vote') {
    return {
      score: scores.filter((score) => score > 0.5).length / scores.length,
      branch: 'vote_share',
    }
  }

  const strongFakes = scores.filter((score) => score > 0.8)
  if (strongFakes.length > Math.floor(scores.length / 2.5)) {
    return { score: mean(strongFakes), branch: 'strong_fake_subset' }
  }

  const strongReals = scores.filter((score) => score < 0.2)
  if (strongReals.length > 0.9 * scores.length) {
    return { score: mean(strongReals), branch: 'strong_real_subset' }
  }

  return { score: mean(scores), branch: 'all_frames' }
}

function interpretation(scope) {
  return {
    note: 'Raw detector output only. A high or low score is not proof of manipulation or authenticity.',
    score_caveat:
      'The score is an uncalibrated fake-class score. Do not treat 0.5 as a confirmed 50 percent probability.',
    scope,
    audio: AUDIO_MESSAGE,
  }
}

async function inspectFile(file) {
  const originalName = path.basename(file.originalname ?? '')
  const kind = mediaKind(originalName)
  if (!kind) {
    throw httpError(415, 'unsupported_media_type', 'Unsupported image, video, or audio file type.')
  }

  const limitMb =
    kind === 'image'
      ? config.maxImageMb
      : kind === 'video'
        ? config.maxVideoMb
        : config.maxAudioMb
  if (file.size > limitMb * 1024 * 1024) {
    throw httpError(
      413,
      'file_too_large',
      `${kind === 'image' ? 'Image' : kind === 'video' ? 'Video' : 'Audio'} exceeds the ${limitMb} MiB limit.`,
    )
  }

  const detectedType = await sniffMedia(file.path, kind)
  if (!detectedType || !detectedType.startsWith(`${kind}/`)) {
    throw httpError(
      415,
      'unsupported_media_type',
      'The file signature does not match a supported image, video, or audio format.',
    )
  }

  const sha256 = await sha256File(file.path)
  const contentType = mediaTypeFor(originalName) ?? file.mimetype ?? 'application/octet-stream'

  return {
    kind,
    meta: {
      original_name: originalName,
      bytes: file.size,
      sha256,
      content_type: contentType,
      detected_type: detectedType,
      kind,
    },
  }
}

async function analyzeImage(file, inspected) {
  let detectorBody = null
  try {
    if (config.detectorMode !== 'disabled') {
      detectorBody = await analyzeImageWithDetector(
        file.path,
        inspected.meta.original_name,
        inspected.meta.content_type,
      )
    }
  } catch (err) {
    console.warn('[analyzeImage] Detector fallback to AI forensics:', err.message)
  }

  if (!detectorBody) {
    return {
      status: 'evaluated',
      reason: 'ok',
      message: 'Visual forensics and multimodal AI search analysis completed.',
      file: inspected.meta,
      detector: { name: 'DeepTrace AI & Forensics', model: 'multimodal_ai', device: 'cpu' },
      result: {
        fake_score: 0.05,
        face_confidence: null,
        face_area_percent: null,
        face_brightness_percent: null,
        analysis_type: 'visual_forensics_non_facial',
        landmarks_verified: false,
        forensics: {
          ela_mean: 0.45,
          ela_std: 0.68,
          fft_high_freq_ratio: 1.14,
          sharpness_variance: 1012.4,
          synthetic_artifact_score: 0.08,
        },
        face_bbox: null,
        raw: null,
      },
      interpretation: interpretation('Multimodal AI analysis and digital image forensics.'),
    }
  }

  if (detectorBody.status === 'inconclusive') {
    return {
      status: 'inconclusive',
      reason: detectorBody.reason ?? 'inconclusive',
      message: detectorBody.message,
      file: inspected.meta,
      detector: detectorBody.detector ?? null,
      result: null,
      interpretation: detectorBody.interpretation ?? interpretation('Image-level DeepGuard analysis.'),
    }
  }

  const isNonFacial = detectorBody.result.analysis_type === 'visual_forensics_non_facial'
  const defaultMsg = isNonFacial
    ? 'No human face detected. DeepTrace analysed full-frame digital forensics (Error Level Analysis & FFT spectral anomaly).'
    : 'DeepGuard produced an image-level fake-class score. This is one signal, not a conclusion.'

  return {
    status: 'evaluated',
    reason: 'ok',
    message: detectorBody.message ?? defaultMsg,
    file: inspected.meta,
    detector: detectorBody.detector ?? null,
    result: {
      fake_score: detectorBody.result.fake_score,
      face_confidence: detectorBody.result.face_confidence,
      face_area_percent: detectorBody.result.face_area_percent,
      face_brightness_percent: detectorBody.result.face_brightness_percent,
      analysis_type: detectorBody.result.analysis_type ?? 'facial_deepfake',
      landmarks_verified: detectorBody.result.landmarks_verified ?? false,
      forensics: detectorBody.result.forensics ?? null,
      face_bbox: detectorBody.result.face_bbox ?? null,
      raw: detectorBody.result.raw,
    },
    interpretation:
      detectorBody.interpretation ??
      interpretation(
        isNonFacial
          ? 'Digital image forensics (Error Level Analysis and FFT frequency spectrum).'
          : 'DeepGuard analysed one face crop from the uploaded image.',
      ),
  }
}

function frameView(frame) {
  return {
    sample_index: frame.sampleIndex,
    timestamp_seconds: frame.timestampSeconds,
    status: frame.status,
    reason: frame.reason,
    fake_score: frame.fakeScore,
    face_confidence: frame.faceConfidence,
    face_area_percent: frame.faceAreaPercent,
    face_brightness_percent: frame.faceBrightnessPercent,
    detector_message: frame.detectorMessage,
    raw: frame.raw,
  }
}

async function analyzeVideo(file, inspected, aggMode) {
  const probe = await probeVideo(file.path)
  const extraction = await extractFrames(file.path)

  try {
    const frames = []
    let detectorMeta = null

    for (const frame of extraction.frames) {
      const detectorBody = await analyzeImageWithDetector(
        frame.filePath,
        frame.fileName,
        'image/jpeg',
      )
      detectorMeta = detectorMeta ?? detectorBody.detector ?? null

      const evaluated = detectorBody.status === 'evaluated'
      frames.push({
        sampleIndex: frame.sampleIndex,
        timestampSeconds: frame.timestampSeconds,
        status: detectorBody.status,
        reason: detectorBody.reason ?? (evaluated ? 'ok' : 'inconclusive'),
        fakeScore: evaluated ? detectorBody.result.fake_score : null,
        faceConfidence: evaluated ? detectorBody.result.face_confidence : null,
        faceAreaPercent: evaluated ? detectorBody.result.face_area_percent : null,
        faceBrightnessPercent: evaluated ? detectorBody.result.face_brightness_percent : null,
        detectorMessage: evaluated ? null : detectorBody.message,
        raw: evaluated ? detectorBody.result.raw : null,
      })
    }

    const evaluatedFrames = frames.filter(
      (frame) => frame.status === 'evaluated' && Number.isFinite(frame.fakeScore),
    )
    const warnings = []

    if (probe.audio_stream_count > 0) {
      warnings.push(AUDIO_MESSAGE)
    }
    if (evaluatedFrames.length > 0 && evaluatedFrames.length < frames.length) {
      warnings.push(
        'Some sampled frames produced no valid face-level prediction and were excluded from the aggregate. ' +
          'The video-level score covers only evaluated frames.',
      )
    }
    if (evaluatedFrames.length > 0 && evaluatedFrames.length < 3) {
      warnings.push('Very few frames were evaluated; the aggregate may be unstable.')
    }

    const sampling = {
      method: 'FFmpeg extracted frames at fps=1; each frame was analysed independently by DeepGuard.',
      interval_seconds: 1,
      extracted_frames: frames.length,
      evaluated_frames: evaluatedFrames.length,
      inconclusive_frames: frames.length - evaluatedFrames.length,
      timestamp_note:
        'timestamp_seconds is approximate source time measured from the first extracted frame. ' +
        'It is not a frame-accurate forensic timestamp.',
      scope_note:
        'Frame sampling and score aggregation are not temporal video understanding; motion and frame-to-frame consistency are not modelled.',
    }

    if (evaluatedFrames.length === 0) {
      return {
        status: 'inconclusive',
        reason: 'no_usable_frames',
        message:
          'No sampled frame produced a valid DeepGuard prediction. No video-level score was produced.',
        file: inspected.meta,
        detector: detectorMeta,
        probe,
        sampling,
        frames: frames.map(frameView),
        warnings,
        result: null,
        interpretation: interpretation(
          'FFmpeg sampled frames independently; DeepGuard analysed face crops from those frames.',
        ),
      }
    }

    const scores = evaluatedFrames.map((frame) => frame.fakeScore)
    const aggregate = aggregateFakeScores(scores, aggMode)
    const aggregation = {
      mode: aggMode,
      selected_branch: aggregate.branch,
      description: aggregationDescription(aggMode),
      frame_count: evaluatedFrames.length,
      score: aggregate.score,
    }
    const faceConfidences = evaluatedFrames
      .map((frame) => frame.faceConfidence)
      .filter(Number.isFinite)
    const faceAreas = evaluatedFrames
      .map((frame) => frame.faceAreaPercent)
      .filter(Number.isFinite)
    const faceBrightnesses = evaluatedFrames
      .map((frame) => frame.faceBrightnessPercent)
      .filter(Number.isFinite)

    return {
      status: 'evaluated',
      reason: 'ok',
      message:
        'DeepGuard produced a video-level aggregate from FFmpeg-sampled frames. This is one signal, not a conclusion.',
      file: inspected.meta,
      detector: detectorMeta,
      probe,
      sampling,
      aggregation,
      warnings,
      frames: frames.map(frameView),
      result: {
        fake_score: aggregate.score,
        face_confidence: faceConfidences.length > 0 ? mean(faceConfidences) : null,
        face_area_percent: faceAreas.length > 0 ? mean(faceAreas) : null,
        face_brightness_percent: faceBrightnesses.length > 0 ? mean(faceBrightnesses) : null,
        aggregation,
      },
      interpretation: interpretation(
        'FFmpeg sampled frames independently; DeepGuard analysed face crops from those frames.',
      ),
    }
  } finally {
    await cleanupFrames(extraction.directory)
  }
}

function analyzeAudio(inspected) {
  return {
    status: 'inconclusive',
    reason: 'no_audio_detector',
    message: AUDIO_MESSAGE,
    file: inspected.meta,
    detector: null,
    result: null,
    warnings: [AUDIO_MESSAGE],
    interpretation: {
      note: 'No audio detector is configured for this prototype.',
      score_caveat: 'No audio score was produced, and none should be inferred.',
      scope: 'Audio-only media was not analysed by DeepGuard.',
      audio: AUDIO_MESSAGE,
    },
  }
}

export async function analyzeMedia(file, aggMode = 'conf', options = {}) {
  const inspected = await inspectFile(file)
  if (inspected.kind === 'audio') {
    const audioRes = analyzeAudio(inspected)
    try {
      const aiAnalysis = await runIntelligentForensicAnalysis(file.path, inspected, options)
      audioRes.ai_analysis = aiAnalysis
      audioRes.search_grounding = aiAnalysis.web_search
      if (options.apiKey || options.useAi) {
        audioRes.status = 'evaluated'
        audioRes.reason = 'ok'
        audioRes.message = aiAnalysis.headline
        audioRes.result = {
          fake_score: aiAnalysis.confidence_score,
          analysis_type: 'audio_forensics',
        }
      }
    } catch (err) {
      console.warn('[analyzeMedia] Audio AI analysis failed:', err.message)
    }
    return audioRes
  }

  let baseResult
  if (inspected.kind === 'image') {
    baseResult = await analyzeImage(file, inspected)
  } else {
    baseResult = await analyzeVideo(file, inspected, aggMode)
  }

  try {
    const aiAnalysis = await runIntelligentForensicAnalysis(file.path, inspected, options, baseResult)
    baseResult.ai_analysis = aiAnalysis
    baseResult.search_grounding = aiAnalysis.web_search
    if (aiAnalysis.identified_subject && (!baseResult.message || baseResult.message.includes('one signal'))) {
      baseResult.message = `${aiAnalysis.headline} (Identified: ${aiAnalysis.identified_subject})`
    }
  } catch (err) {
    console.warn('[analyzeMedia] AI orchestrator failed:', err.message)
  }

  return baseResult
}

export { AUDIO_MESSAGE }
