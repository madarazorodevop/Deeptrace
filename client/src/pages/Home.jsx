import { useEffect, useMemo, useRef, useState } from 'react'
import { AiGroundingPanel } from '../components/AiGroundingPanel.jsx'
import { AiSettingsModal } from '../components/AiSettingsModal.jsx'
import { LiveCameraStudio } from '../components/LiveCameraStudio.jsx'

const AUDIO_MESSAGE = 'No audio detector configured — analysis incomplete'
const ACCEPTED_MEDIA =
  '.jpg,.jpeg,.png,.webp,.mp4,.mov,.m4v,.avi,.mkv,.webm,.wav,.mp3,.m4a,.aac,.flac,.ogg,.opus'

const aggregationOptions = [
  {
    value: 'conf',
    label: 'DeepGuard conf heuristic',
    badge: 'Recommended',
    description:
      'Uses strong-fake (>0.8) or strong-real (<0.2) frame subsets when heuristic conditions are met; otherwise averages all frames.',
  },
  {
    value: 'mean',
    label: 'Mean of frame scores',
    badge: 'Linear',
    description: 'Averages every evaluated frame score uniformly.',
  },
  {
    value: 'vote',
    label: 'Vote share above 0.5',
    badge: 'Threshold',
    description: 'Reports the percentage of evaluated frames scoring above 0.5.',
  },
]

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return 'Unknown'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`
}

function formatScore(score) {
  return Number.isFinite(score) ? score.toFixed(4) : 'No score'
}

function formatPercent(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)}%` : 'Unknown'
}

function mediaKind(file) {
  if (!file) return null
  const name = file.name.toLowerCase()
  if (/\.(mp4|mov|m4v|avi|mkv|webm)$/.test(name)) return 'video'
  if (/\.(jpg|jpeg|png|webp)$/.test(name)) return 'image'
  if (/\.(wav|mp3|m4a|aac|flac|ogg|opus)$/.test(name)) return 'audio'
  return null
}

function StatusPill({ status, analysisType }) {
  const evaluated = status === 'evaluated'
  const isForensics = analysisType === 'visual_forensics_non_facial'

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold tracking-wide ${
          evaluated
            ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200'
            : 'border-amber-400/40 bg-amber-400/10 text-amber-200'
        }`}
      >
        <span
          className={`h-2 w-2 rounded-full ${
            evaluated ? 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]' : 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]'
          }`}
        />
        {evaluated ? 'Evaluated — Score Ready' : 'Inconclusive — Preliminary Review'}
      </span>
      {isForensics ? (
        <span className="rounded-full border border-indigo-400/30 bg-indigo-500/10 px-2.5 py-1 text-xs font-medium text-indigo-200">
          Visual Forensics (Full Frame)
        </span>
      ) : evaluated ? (
        <span className="rounded-full border border-purple-400/30 bg-purple-500/10 px-2.5 py-1 text-xs font-medium text-purple-200">
          Facial Deepfake (GCViT)
        </span>
      ) : null}
    </div>
  )
}

function Metric({ label, value, note, highlight }) {
  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4 transition-all hover:border-slate-700 hover:shadow-lg">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
        {label}
      </p>
      <p className={`mt-2 text-lg font-extrabold ${highlight ? 'text-cyan-300' : 'text-slate-100'}`}>
        {value}
      </p>
      {note ? <p className="mt-1 text-xs leading-relaxed text-slate-400">{note}</p> : null}
    </div>
  )
}

function ScorePanel({ result, kind }) {
  const score = result.result?.fake_score
  const hasScore = Number.isFinite(score)
  const width = hasScore ? Math.min(100, Math.max(0, score * 100)) : 0
  const isVideo = kind === 'video'
  const isAudio = kind === 'audio'
  const analysisType = result.result?.analysis_type
  const isForensics = analysisType === 'visual_forensics_non_facial'

  // Semantic tier calculation
  let labelNote = 'Consistent with natural photographic capture'
  let tierBadge = 'Authentic Baseline'
  let badgeClasses = 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300'
  let barGradient = 'from-emerald-400 to-cyan-400'
  let gaugeGradient = ['#10b981', '#06b6d4']
  let glowColor = 'rgba(6,182,212,0.35)'

  if (hasScore) {
    if (score >= 0.65) {
      labelNote = 'High fake / synthetic anomaly indicators'
      tierBadge = 'Manipulated / Synthetic'
      badgeClasses = 'border-rose-400/40 bg-rose-500/10 text-rose-300'
      barGradient = 'from-amber-400 via-rose-500 to-red-500'
      gaugeGradient = ['#f59e0b', '#f43f5e']
      glowColor = 'rgba(244,63,94,0.4)'
    } else if (score >= 0.35) {
      labelNote = 'Intermediate / inconclusive range'
      tierBadge = 'Ambiguous / Inconclusive'
      badgeClasses = 'border-amber-400/40 bg-amber-500/10 text-amber-300'
      barGradient = 'from-cyan-400 via-teal-300 to-amber-400'
      gaugeGradient = ['#06b6d4', '#f59e0b']
      glowColor = 'rgba(245,158,11,0.35)'
    }
  }

  // Extract extra forensic details
  const faceConf = result.result?.face_confidence
  const faceArea = result.result?.face_area_percent
  const faceBrightness = result.result?.face_brightness_percent
  const landmarksVerified = result.result?.landmarks_verified
  const faceBbox = result.result?.face_bbox
  const detectorModel = result.detector?.model || 'GCViT Transformer'
  const detectorDevice =
    result.detector?.device === 'cpu'
      ? 'CPU Engine'
      : result.detector?.device || 'CUDA GPU'
  const marginRatio = result.detector?.margin_ratio
  const ttaHflip = result.result?.tta_hflip

  // Format bbox if available
  let bboxLabel = null
  if (Array.isArray(faceBbox) && faceBbox.length === 4) {
    const [x1, y1, x2, y2] = faceBbox.map(Math.round)
    bboxLabel = `${x2 - x1}×${y2 - y1} px [${x1},${y1}]`
  }

  return (
    <section className="relative overflow-hidden rounded-3xl border border-slate-800/90 bg-gradient-to-b from-slate-900/90 via-slate-950/95 to-slate-950 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
      {/* Subtle futuristic background ambient glow */}
      <div
        className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full opacity-20 blur-3xl"
        style={{ background: gaugeGradient[0] }}
      />
      <div
        className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full opacity-15 blur-3xl"
        style={{ background: gaugeGradient[1] }}
      />

      {/* Header */}
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-cyan-400/90">
              Observation Model Result
            </p>
          </div>
          <h2 className="mt-1.5 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
            Deepfake Score
          </h2>
        </div>
        <StatusPill status={result.status} analysisType={analysisType} />
      </div>

      {/* Hero Score & Spectrum Section */}
      <div className="relative mt-6 rounded-2xl border border-slate-800/80 bg-slate-950/70 p-6 shadow-inner">
        <div className="grid gap-6 lg:grid-cols-[250px_1fr] lg:items-center">
          {/* Left: Clean Primary Score */}
          <div className="space-y-2 lg:border-r lg:border-slate-800/80 lg:pr-6">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badgeClasses}`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current shadow-[0_0_6px_currentColor]" />
                {tierBadge}
              </span>
              {hasScore && (
                <span className="rounded-md border border-slate-800 bg-slate-900/80 px-2 py-0.5 font-mono text-[11px] text-slate-400">
                  {isVideo
                    ? 'Video'
                    : isAudio
                      ? 'Audio'
                      : isForensics
                        ? 'Full Frame'
                        : 'Face Crop'}
                </span>
              )}
            </div>

            <div className="flex items-baseline gap-2.5 pt-1">
              <span className="font-mono text-5xl font-black tracking-tight text-white">
                {hasScore ? score.toFixed(4) : '—'}
              </span>
              {hasScore && (
                <span className="font-mono text-sm font-semibold text-slate-400">
                  ({(score * 100).toFixed(1)}%)
                </span>
              )}
            </div>

            <p className="text-xs font-medium text-slate-400">
              {hasScore ? labelNote : 'No probability score evaluated'}
            </p>
          </div>

          {/* Right: Clean Calibration Spectrum Bar */}
          <div className="space-y-3.5 lg:pl-2">
            {isAudio && !result.ai_analysis ? (
              <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm leading-relaxed text-amber-200">
                {AUDIO_MESSAGE}
              </p>
            ) : (
              <>
                {/* Scale Markers */}
                <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    0.0 (Authentic baseline)
                  </span>
                  <span className="font-bold text-slate-300">
                    0.5 (Threshold)
                  </span>
                  <span className="flex items-center gap-1.5 text-rose-400">
                    1.0 (Manipulated / Synthetic)
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                  </span>
                </div>

                {/* Smooth Progress Track */}
                <div className="relative h-4 w-full overflow-hidden rounded-full bg-slate-900 border border-slate-800/90 shadow-inner">
                  {/* Subtle 0.5 Decision Boundary Marker */}
                  <div className="absolute top-0 bottom-0 left-1/2 w-0.5 -translate-x-1/2 bg-slate-600/60 z-10" />

                  {/* Luminous Fill Bar */}
                  <div
                    className={`relative h-full rounded-full bg-gradient-to-r ${barGradient} shadow-md transition-all duration-700 ease-out`}
                    style={{ width: `${width}%` }}
                  />
                </div>

                {/* Subtext & Delta Margin */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                  <p className="leading-relaxed">
                    {isAudio
                      ? 'Acoustic speech frequency and vocoder artifact score.'
                      : 'Sigmoid fake-class probability output. Observation signal for forensic analyst review.'}
                  </p>
                  {hasScore && (
                    <span className="font-mono text-[11px] font-semibold text-slate-400 shrink-0">
                      Delta to Threshold:{' '}
                      <span className={score < 0.5 ? 'text-emerald-400' : 'text-rose-400'}>
                        {score < 0.5
                          ? `-${((0.5 - score) * 100).toFixed(1)}% (Authentic bias)`
                          : `+${((score - 0.5) * 100).toFixed(1)}% (Synthetic bias)`}
                      </span>
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Forensic Findings Message Banner */}
      <div className="relative mt-6 rounded-2xl border border-slate-800/90 bg-slate-950/60 p-4 shadow-sm flex items-start gap-3">
        <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-500/10 text-cyan-400">
          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <p className="text-sm font-medium leading-relaxed text-slate-200">
          {result.message}
        </p>
      </div>

      {/* Advanced Forensic Metric Cards (Face Details & Geometric Integrity) */}
      {hasScore && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* 1. Face Detector Confidence */}
          <div className="group rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4 transition-all hover:border-cyan-500/30 hover:bg-slate-900/40">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
                Detector Conf
              </span>
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="22" y1="12" x2="18" y2="12" />
                  <line x1="6" y1="12" x2="2" y2="12" />
                  <line x1="12" y1="6" x2="12" y2="2" />
                  <line x1="12" y1="22" x2="12" y2="18" />
                </svg>
              </div>
            </div>
            <p className="mt-2 text-xl font-extrabold text-cyan-300">
              {formatPercent(faceConf)}
            </p>
            {/* Mini progress bar */}
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800/80">
              <div
                className="h-full rounded-full bg-gradient-to-r from-teal-400 to-cyan-400 transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, faceConf || 0))}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              YOLO face detection confidence.
            </p>
          </div>

          {/* 2. Face Frame Area */}
          <div className="group rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4 transition-all hover:border-indigo-500/30 hover:bg-slate-900/40">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
                Frame Area
              </span>
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="M21 15l-5-5L5 21" />
                </svg>
              </div>
            </div>
            <p className="mt-2 text-xl font-extrabold text-slate-100">
              {formatPercent(faceArea)}
            </p>
            {/* Mini progress bar */}
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800/80">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-cyan-400 transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, (faceArea || 0) * 4))}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              Portion of media frame occupied by face.
            </p>
          </div>

          {/* 3. Face Brightness / Luminosity */}
          <div className="group rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4 transition-all hover:border-amber-500/30 hover:bg-slate-900/40">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
                Brightness
              </span>
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              </div>
            </div>
            <p className="mt-2 text-xl font-extrabold text-slate-100">
              {formatPercent(faceBrightness)}
            </p>
            {/* Mini progress bar */}
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800/80">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, faceBrightness || 0))}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              Grayscale mean luminosity of crop.
            </p>
          </div>

          {/* 4. 3D Landmark & Geometric Mesh */}
          <div className="group rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4 transition-all hover:border-emerald-500/30 hover:bg-slate-900/40">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
                Landmarks Mesh
              </span>
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
            </div>
            <p className={`mt-2 text-xl font-extrabold ${landmarksVerified ? 'text-emerald-300' : isForensics ? 'text-indigo-300' : 'text-slate-200'}`}>
              {landmarksVerified
                ? '68-Pt Verified'
                : isForensics
                  ? 'Sensor Matrix'
                  : 'Geometric Check'}
            </p>
            {/* Mini status indicator */}
            <div className="mt-2 flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${landmarksVerified ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]' : 'bg-slate-500'}`} />
              <span className="text-[11px] font-medium text-slate-400">
                {landmarksVerified
                  ? '3D facial alignment passed'
                  : isForensics
                    ? 'Full frame analysis'
                    : 'Affine normalization'}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Facial morphing & alignment check.
            </p>
          </div>
        </div>
      )}

      {/* Cyber Forensic Telemetry Strip (More Details) */}
      <div className="mt-5 flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/60 text-[11px] text-slate-400">
        <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-800 bg-slate-900/60 px-2.5 py-1">
          <span className="font-semibold text-slate-300">Model:</span> {detectorModel}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-800 bg-slate-900/60 px-2.5 py-1">
          <span className="font-semibold text-slate-300">Engine:</span> {detectorDevice}
        </span>
        {bboxLabel && (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-800 bg-slate-900/60 px-2.5 py-1 font-mono">
            <span className="font-semibold text-slate-300">Crop ROI:</span> {bboxLabel}
          </span>
        )}
        {marginRatio != null && (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-800 bg-slate-900/60 px-2.5 py-1">
            <span className="font-semibold text-slate-300">Margin:</span> +{(marginRatio * 100).toFixed(0)}% Padding
          </span>
        )}
        {ttaHflip != null && (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-800 bg-slate-900/60 px-2.5 py-1">
            <span className="font-semibold text-slate-300">TTA:</span> {ttaHflip > 0 ? `Dual-Pass (${(ttaHflip * 100).toFixed(0)}%)` : 'Single Pass'}
          </span>
        )}
        {isVideo && result.result?.sampling && (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-800 bg-slate-900/60 px-2.5 py-1">
            <span className="font-semibold text-slate-300">Frames:</span> {result.result.sampling.num_detected ?? 0} / {result.result.sampling.num_sampled ?? 0} Sampled
          </span>
        )}
      </div>
    </section>
  )
}

function ForensicsPanel({ result }) {
  const forensics = result.result?.forensics
  if (!forensics) return null

  const isLowEla = forensics.ela_mean <= 1.5
  const isNaturalFft = forensics.fft_high_freq_ratio <= 1.35
  const isSharp = forensics.sharpness_variance >= 60
  const isLowSynthetic = forensics.synthetic_artifact_score <= 0.35

  return (
    <section className="relative overflow-hidden rounded-3xl border border-indigo-500/30 bg-gradient-to-b from-slate-900/90 via-slate-950/95 to-slate-950 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
      {/* Ambient background glow */}
      <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />

      {/* Header */}
      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-400 shadow-[0_0_8px_#818cf8]" />
            </span>
            <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-indigo-400">
              Explainable Digital Forensics
            </p>
          </div>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-white sm:text-3xl">
            Signal & Spectral Artifact Diagnostics
          </h2>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3.5 py-1 text-xs font-semibold text-indigo-300">
          <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
          Fourier & ELA Metrics
        </span>
      </div>

      {/* 4 Professional Forensic Telemetry Cards */}
      <div className="relative mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Error Level Analysis */}
        <div className="group rounded-2xl border border-slate-800/80 bg-slate-950/70 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-400/40 hover:bg-slate-900/60 hover:shadow-[0_8px_20px_rgba(99,102,241,0.12)]">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
              Error Level (ELA)
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10 border border-indigo-400/20 text-indigo-300">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
            </div>
          </div>

          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="font-mono text-3xl font-black tracking-tight text-white">
              {forensics.ela_mean.toFixed(2)}
            </span>
            <span className="text-xs font-semibold text-slate-400">μ</span>
          </div>

          <div className="mt-2.5">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase ${
                isLowEla
                  ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300'
                  : 'border-amber-400/30 bg-amber-500/10 text-amber-300'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${isLowEla ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              {isLowEla ? 'Uniform Compression' : 'Compression Shift'}
            </span>
          </div>

          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-900 border border-slate-800">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isLowEla ? 'bg-gradient-to-r from-emerald-400 to-teal-400' : 'bg-gradient-to-r from-amber-400 to-rose-400'
              }`}
              style={{ width: `${Math.min(100, Math.max(8, (forensics.ela_mean / 2.5) * 100))}%` }}
            />
          </div>

          <p className="mt-2 text-xs leading-relaxed text-slate-400">
            Std dev: ±{forensics.ela_std.toFixed(2)}. Recompression error rate.
          </p>
        </div>

        {/* Card 2: FFT High-Frequency Ratio */}
        <div className="group rounded-2xl border border-slate-800/80 bg-slate-950/70 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-400/40 hover:bg-slate-900/60 hover:shadow-[0_8px_20px_rgba(99,102,241,0.12)]">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
              FFT High-Freq
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10 border border-indigo-400/20 text-indigo-300">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
          </div>

          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="font-mono text-3xl font-black tracking-tight text-white">
              {forensics.fft_high_freq_ratio.toFixed(2)}
            </span>
          </div>

          <div className="mt-2.5">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase ${
                isNaturalFft
                  ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300'
                  : 'border-rose-400/30 bg-rose-500/10 text-rose-300'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${isNaturalFft ? 'bg-emerald-400' : 'bg-rose-400'}`} />
              {isNaturalFft ? 'Natural Falloff' : 'High Latent Spikes'}
            </span>
          </div>

          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-900 border border-slate-800">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isNaturalFft ? 'bg-gradient-to-r from-teal-400 to-indigo-400' : 'bg-gradient-to-r from-amber-400 to-rose-400'
              }`}
              style={{ width: `${Math.min(100, Math.max(8, (forensics.fft_high_freq_ratio / 2.0) * 100))}%` }}
            />
          </div>

          <p className="mt-2 text-xs leading-relaxed text-slate-400">
            High-frequency spectral power vs synthetic generation spikes.
          </p>
        </div>

        {/* Card 3: Laplacian Sharpness */}
        <div className="group rounded-2xl border border-slate-800/80 bg-slate-950/70 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-400/40 hover:bg-slate-900/60 hover:shadow-[0_8px_20px_rgba(99,102,241,0.12)]">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
              Texture Sharpness
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10 border border-indigo-400/20 text-indigo-300">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="14.31" y1="8" x2="20.05" y2="17.94" />
                <line x1="9.69" y1="8" x2="21.17" y2="8" />
                <line x1="7.38" y1="12" x2="13.12" y2="2.06" />
                <line x1="9.69" y1="16" x2="3.95" y2="6.06" />
                <line x1="14.31" y1="16" x2="2.83" y2="16" />
                <line x1="16.62" y1="12" x2="10.88" y2="21.94" />
              </svg>
            </div>
          </div>

          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="font-mono text-3xl font-black tracking-tight text-white">
              {forensics.sharpness_variance.toFixed(0)}
            </span>
            <span className="text-xs font-semibold text-slate-400">var</span>
          </div>

          <div className="mt-2.5">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase ${
                isSharp
                  ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300'
                  : 'border-amber-400/30 bg-amber-500/10 text-amber-300'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${isSharp ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              {isSharp ? 'Optical Focus' : 'Diffusion Smoothing'}
            </span>
          </div>

          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-900 border border-slate-800">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isSharp ? 'bg-gradient-to-r from-cyan-400 to-indigo-400' : 'bg-gradient-to-r from-amber-400 to-yellow-400'
              }`}
              style={{ width: `${Math.min(100, Math.max(8, (forensics.sharpness_variance / 150) * 100))}%` }}
            />
          </div>

          <p className="mt-2 text-xs leading-relaxed text-slate-400">
            Laplacian edge variance indicating camera lens focus.
          </p>
        </div>

        {/* Card 4: Synthetic Signal Index */}
        <div className="group rounded-2xl border border-slate-800/80 bg-slate-950/70 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-400/50 hover:bg-slate-900/60 hover:shadow-[0_8px_20px_rgba(34,211,238,0.14)]">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-400">
              Synthetic Index
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/10 border border-cyan-400/30 text-cyan-300">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
          </div>

          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="font-mono text-3xl font-black tracking-tight text-cyan-300">
              {forensics.synthetic_artifact_score.toFixed(4)}
            </span>
          </div>

          <div className="mt-2.5">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase ${
                isLowSynthetic
                  ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300'
                  : 'border-rose-400/30 bg-rose-500/10 text-rose-300'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${isLowSynthetic ? 'bg-emerald-400' : 'bg-rose-400'}`} />
              {isLowSynthetic ? 'Authentic Baseline' : 'Elevated Anomaly'}
            </span>
          </div>

          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-900 border border-slate-800">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isLowSynthetic ? 'bg-gradient-to-r from-emerald-400 to-cyan-400' : 'bg-gradient-to-r from-amber-400 to-rose-500'
              }`}
              style={{ width: `${Math.min(100, Math.max(8, forensics.synthetic_artifact_score * 100))}%` }}
            />
          </div>

          <p className="mt-2 text-xs leading-relaxed text-slate-400">
            Composite heuristic from spectral & ELA compression signals.
          </p>
        </div>
      </div>

      {/* Styled Footnote */}
      <div className="relative mt-6 flex items-start gap-3 rounded-2xl border border-slate-800/80 bg-slate-950/60 p-4 shadow-sm">
        <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-400">
          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
        </div>
        <p className="text-xs font-medium leading-relaxed text-slate-300">
          Error Level Analysis (ELA) verifies compression boundary consistency across image zones. 2D Fast Fourier Transform (FFT) inspects frequency space for latent grid artifacts common in GAN and diffusion generation.
        </p>
      </div>
    </section>
  )
}

function AggregationPanel({ result }) {
  const aggregation = result.aggregation ?? result.result?.aggregation
  if (!aggregation) return null

  return (
    <section className="rounded-3xl border border-slate-800/90 bg-slate-900/50 p-6 backdrop-blur-xl sm:p-8">
      <p className="text-xs font-bold uppercase tracking-[0.25em] text-slate-400">
        Temporal Frame Aggregation
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Metric label="Selected mode" value={aggregation.mode.toUpperCase()} highlight />
        <Metric label="Chosen decision branch" value={aggregation.selected_branch ?? 'heuristic'} />
        <Metric label="Evaluated frame count" value={String(aggregation.frame_count ?? 'N/A')} />
      </div>
      <p className="mt-4 text-sm leading-relaxed text-slate-300">
        {aggregation.description}
      </p>
    </section>
  )
}

function FramesPanel({ result }) {
  const frames = result.frames ?? result.result?.frames ?? []
  if (frames.length === 0) return null

  return (
    <section className="rounded-3xl border border-slate-800/90 bg-slate-900/50 p-6 backdrop-blur-xl sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-slate-400">
            FFmpeg Frame Observations
          </p>
          <h2 className="mt-1 text-xl font-extrabold text-slate-100">
            Sampled Frame Predictions (fps=1)
          </h2>
        </div>
        <span className="rounded-full bg-slate-800 px-3 py-1 font-mono text-xs text-slate-300">
          {frames.length} frame{frames.length === 1 ? '' : 's'} analysed
        </span>
      </div>

      <div className="mt-5 max-h-80 overflow-auto rounded-2xl border border-slate-800 bg-slate-950/80">
        <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
          <thead className="sticky top-0 bg-slate-950 text-xs font-bold uppercase tracking-wider text-slate-400">
            <tr>
              <th className="px-4 py-3">Timestamp</th>
              <th className="px-4 py-3">Fake Score</th>
              <th className="px-4 py-3">Face Conf</th>
              <th className="px-4 py-3">Face Ratio</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70 font-mono text-xs">
            {frames.map((frame, i) => (
              <tr key={i} className="hover:bg-slate-900/50">
                <td className="whitespace-nowrap px-4 py-3 text-slate-400">
                  ~{frame.timestamp_seconds ?? frame.deepguard_frame_time ?? i}s
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-200">
                  {formatScore(frame.fake_score)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-400">
                  {formatPercent(frame.face_confidence)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-400">
                  {formatPercent(frame.face_area_percent)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-sans font-semibold ${
                      frame.status === 'evaluated' || Number.isFinite(frame.fake_score)
                        ? 'bg-cyan-500/10 text-cyan-300'
                        : 'bg-amber-500/10 text-amber-300'
                    }`}
                  >
                    {frame.status ?? 'evaluated'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        Frames sampled at ~1 fps. DeepTrace tests each frame independently; frame aggregation does not model temporal motion or 3D face consistency.
      </p>
    </section>
  )
}

function FileAndDetectorPanel({ result }) {
  const file = result.file
  const detector = result.detector
  if (!file && !detector) return null

  const [copied, setCopied] = useState(false)

  function copyDigest() {
    if (file?.sha256) {
      navigator.clipboard.writeText(file.sha256)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <section className="grid gap-6 lg:grid-cols-2">
      {/* Left Card: Cryptographic Integrity */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-800/90 bg-gradient-to-b from-slate-900/90 via-slate-950/95 to-slate-950 p-6 backdrop-blur-xl sm:p-7 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_#22d3ee]" />
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-400/90">
                Cryptographic Integrity
              </p>
            </div>
            <h3 className="mt-1 text-xl font-black tracking-tight text-white">
              Intake Fingerprint
            </h3>
          </div>
          <span className="rounded-full border border-slate-800 bg-slate-900/80 px-2.5 py-1 text-[11px] font-mono text-slate-300">
            SHA-256 Verified
          </span>
        </div>

        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between rounded-xl border border-slate-800/60 bg-slate-950/60 px-4 py-2.5 text-xs">
            <span className="font-medium text-slate-400">File Name</span>
            <span
              className="max-w-[220px] truncate font-mono font-bold text-slate-200"
              title={file?.original_name ?? file?.filename}
            >
              {file?.original_name ?? file?.filename}
            </span>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-slate-800/60 bg-slate-950/60 px-4 py-2.5 text-xs">
            <span className="font-medium text-slate-400">File Size</span>
            <span className="font-mono font-bold text-slate-200">
              {formatBytes(file?.bytes)}
            </span>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-slate-800/60 bg-slate-950/60 px-4 py-2.5 text-xs">
            <span className="font-medium text-slate-400">Detected Format</span>
            <span className="rounded-md border border-cyan-400/30 bg-cyan-500/10 px-2 py-0.5 font-mono text-[11px] font-bold text-cyan-300">
              {file?.detected_type ?? file?.content_type}
            </span>
          </div>

          <div className="pt-1">
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 mb-1.5">
              <span>SHA-256 Checksum</span>
              <span className="text-[10px] uppercase font-mono text-slate-500">
                256-bit Digest
              </span>
            </div>
            <div className="flex items-center justify-between gap-2.5 rounded-xl border border-slate-800/80 bg-slate-950 p-2.5 shadow-inner">
              <span className="truncate font-mono text-xs text-cyan-200 select-all">
                {file?.sha256}
              </span>
              <button
                type="button"
                onClick={copyDigest}
                className="shrink-0 flex items-center gap-1 rounded-lg border border-slate-700/80 bg-slate-800 px-2.5 py-1 text-[11px] font-bold text-slate-200 hover:border-cyan-400 hover:text-white transition-colors"
              >
                {copied ? 'Copied ✓' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Right Card: Forensic Engine Metadata */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-800/90 bg-gradient-to-b from-slate-900/90 via-slate-950/95 to-slate-950 p-6 backdrop-blur-xl sm:p-7 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 shadow-[0_0_6px_#818cf8]" />
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-indigo-400">
                Forensic Engine Metadata
              </p>
            </div>
            <h3 className="mt-1 text-xl font-black tracking-tight text-white">
              Engine Configuration
            </h3>
          </div>
          <span className="rounded-full border border-slate-800 bg-slate-900/80 px-2.5 py-1 text-[11px] font-mono text-slate-300">
            DeepGuard Pipeline
          </span>
        </div>

        {detector ? (
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-slate-800/60 bg-slate-950/60 px-4 py-2.5 text-xs">
              <span className="font-medium text-slate-400">
                Neural Architecture
              </span>
              <span className="font-mono font-bold text-slate-200">
                {detector.model || 'Multimodal AI'}
              </span>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-slate-800/60 bg-slate-950/60 px-4 py-2.5 text-xs">
              <span className="font-medium text-slate-400">
                Training Reference
              </span>
              <span className="font-mono font-bold text-slate-200">
                {detector.dataset
                  ? `${detector.dataset} (FaceForensics++)`
                  : 'Web Provenance & GenAI Artifacts'}
              </span>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-slate-800/60 bg-slate-950/60 px-4 py-2.5 text-xs">
              <span className="font-medium text-slate-400">
                Inference Hardware
              </span>
              <span className="rounded-md border border-cyan-400/30 bg-cyan-500/10 px-2 py-0.5 font-mono text-[11px] font-bold text-cyan-300 uppercase">
                {detector.device || 'CPU'}
              </span>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-slate-800/60 bg-slate-950/60 px-4 py-2.5 text-xs">
              <span className="font-medium text-slate-400">
                Grounding Engine
              </span>
              <span className="text-xs font-semibold text-indigo-300">
                Google Search & Web Registry Grounding
              </span>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">
            Detector metadata is currently unavailable.
          </p>
        )}
      </div>
    </section>
  )
}

function JsonAuditPanel({ result }) {
  const [isOpen, setIsOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const jsonString = useMemo(() => JSON.stringify(result, null, 2), [result])
  const byteSize = useMemo(() => new Blob([jsonString]).size, [jsonString])

  function handleCopy() {
    navigator.clipboard.writeText(jsonString)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleDownload() {
    const baseName =
      result.file?.original_name || result.file?.filename || 'report'
    const filename = `deeptrace-audit-${baseName}.json`.replace(
      /[^a-zA-Z0-9._-]/g,
      '_'
    )
    const blob = new Blob([jsonString], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <section className="relative overflow-hidden rounded-3xl border border-slate-800/80 bg-slate-900/40 p-5 sm:p-6 transition-all duration-300 shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left: Collapsible Header Trigger */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="group flex items-center gap-3 text-left focus:outline-none"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700/80 bg-slate-800/70 text-slate-400 group-hover:border-cyan-400/50 group-hover:text-cyan-300 transition-colors shadow-inner">
            <svg
              className={`h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 5l7 7-7 7"
              />
            </svg>
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-[0.22em] text-slate-300 group-hover:text-cyan-300 transition-colors">
              Raw JSON Forensic Audit Payload
            </h4>
            <p className="text-[11px] text-slate-400 font-mono mt-0.5">
              Full cryptographic & forensic schema ({formatBytes(byteSize)})
            </p>
          </div>
        </button>

        {/* Right Corner: Download & Copy Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1.5 rounded-xl border border-slate-700/80 bg-slate-800/70 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-slate-600 hover:bg-slate-800 hover:text-white transition-all shadow-sm"
          >
            <svg
              className="h-3.5 w-3.5 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
            <span>{copied ? 'Copied ✓' : 'Copy'}</span>
          </button>

          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center gap-1.5 rounded-xl border border-cyan-400/50 bg-cyan-500/10 px-3.5 py-1.5 text-xs font-bold text-cyan-300 hover:bg-cyan-500/20 hover:border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.15)] transition-all"
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            <span>Download JSON</span>
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="mt-4">
          <pre className="max-h-96 overflow-auto rounded-2xl border border-slate-800/90 bg-slate-950 p-5 font-mono text-xs leading-relaxed text-slate-300 shadow-inner selection:bg-cyan-500/30 selection:text-cyan-200">
            {jsonString}
          </pre>
        </div>
      )}
    </section>
  )
}

function VideoContextPanel({ result }) {
  const probe = result.probe
  const sampling = result.sampling
  if (!probe && !sampling) return null

  return (
    <section className="rounded-3xl border border-slate-800/90 bg-slate-900/50 p-6 backdrop-blur-xl sm:p-8">
      <p className="text-xs font-bold uppercase tracking-[0.25em] text-slate-400">
        Media Container & Stream Details
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Duration"
          value={probe ? `${probe.duration_seconds.toFixed(2)}s` : 'Unknown'}
        />
        <Metric
          label="Resolution"
          value={probe ? `${probe.width ?? '?'} × ${probe.height ?? '?'}` : 'Unknown'}
        />
        <Metric label="Video Codec" value={probe?.codec ?? 'Unknown'} highlight />
        <Metric
          label="Audio Streams"
          value={probe ? String(probe.audio_stream_count ?? 0) : '0'}
        />
      </div>
      {sampling ? (
        <p className="mt-4 text-xs leading-relaxed text-slate-400">
          {sampling.method} {sampling.scope_note}
        </p>
      ) : null}
    </section>
  )
}

function ResultView({ result }) {
  const kind = result.file?.kind
  const isVideo = kind === 'video'

  return (
    <div className="space-y-8" aria-live="polite">
      {/* 1. Primary AI Verdict & Web Search Grounding */}
      <AiGroundingPanel result={result} />

      {/* 2. Observation Model Score */}
      <ScorePanel result={result} kind={kind} />

      {/* 3. Explainable Digital Signal Forensics */}
      <ForensicsPanel result={result} />

      {/* 4. Temporal Aggregation for Videos */}
      {isVideo ? <AggregationPanel result={result} /> : null}

      {/* 5. Cryptographic Fingerprint & Engine Configuration */}
      <FileAndDetectorPanel result={result} />

      {/* 6. Video Stream Details */}
      {isVideo ? <VideoContextPanel result={result} /> : null}

      {/* 7. Video Frame Breakdown */}
      {isVideo ? <FramesPanel result={result} /> : null}

      {/* 8. Raw JSON Forensic Audit Payload */}
      <JsonAuditPanel result={result} />
    </div>
  )
}

export default function Home() {
  const [file, setFile] = useState(null)
  const [aggMode, setAggMode] = useState('conf')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isCameraOpen, setIsCameraOpen] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [samples, setSamples] = useState([])
  const [isLoadingSample, setIsLoadingSample] = useState(false)
  const [videoDevices, setVideoDevices] = useState([])
  const [selectedDeviceId, setSelectedDeviceId] = useState('')
  const [cameraStream, setCameraStream] = useState(null)
  const [streamResolution, setStreamResolution] = useState('')
  const [isCameraActive, setIsCameraActive] = useState(false)
  const [isMirrored, setIsMirrored] = useState(true)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)

  // Object URL preview for loaded file
  const [filePreview, setFilePreview] = useState(null)

  const [geminiApiKey, setGeminiApiKey] = useState(() => {
    try {
      return localStorage.getItem('deeptrace_gemini_key') || ''
    } catch {
      return ''
    }
  })
  const [isAiSettingsOpen, setIsAiSettingsOpen] = useState(false)

  const handleSaveApiKey = (key) => {
    setGeminiApiKey(key)
    try {
      if (key) {
        localStorage.setItem('deeptrace_gemini_key', key)
      } else {
        localStorage.removeItem('deeptrace_gemini_key')
      }
    } catch {}
  }

  const cameraStreamRef = useRef(null)
  const cameraVideoRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const recordedChunksRef = useRef([])
  const recordingTimerRef = useRef(null)
  const kind = useMemo(() => mediaKind(file), [file])
  const selectedAggregation = aggregationOptions.find((opt) => opt.value === aggMode)

  // Manage file preview URL
  useEffect(() => {
    if (!file) {
      setFilePreview(null)
      return
    }
    const url = URL.createObjectURL(file)
    setFilePreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  // Load available demo samples from server
  useEffect(() => {
    fetch('/api/samples')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.samples)) {
          setSamples(data.samples)
        }
      })
      .catch(() => {})
  }, [])

  function stopLaptopCamera() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop()
      } catch {}
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = null
    }
    setIsRecording(false)
    setRecordingSeconds(0)
    setStreamResolution('')
    setIsCameraActive(false)

    cameraStreamRef.current?.getTracks().forEach((track) => track.stop())
    cameraStreamRef.current = null
    setCameraStream(null)
    if (cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = null
    }
    setIsCameraOpen(false)
  }

  const stopWebcam = stopLaptopCamera
  useEffect(() => () => stopLaptopCamera(), [])

  function attachStreamToVideo(videoEl, stream) {
    if (!videoEl || !stream) return
    if (videoEl.srcObject !== stream) {
      videoEl.srcObject = stream
    }
    videoEl.muted = true
    videoEl.defaultMuted = true
    videoEl.playsInline = true
    videoEl.setAttribute('playsinline', 'true')
    videoEl.setAttribute('autoplay', 'true')
    videoEl.setAttribute('muted', 'true')

    const triggerPlay = () => {
      videoEl.play().catch((err) => {
        console.warn('Autoplay prevented:', err)
      })
      if (videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
        setStreamResolution(`${videoEl.videoWidth}×${videoEl.videoHeight}`)
        setIsCameraActive(true)
      }
    }

    triggerPlay()
    videoEl.onloadedmetadata = triggerPlay
    videoEl.oncanplay = triggerPlay
    videoEl.onplaying = () => setIsCameraActive(true)
  }

  useEffect(() => {
    if (isCameraOpen && cameraStream && cameraVideoRef.current) {
      attachStreamToVideo(cameraVideoRef.current, cameraStream)
    }
  }, [isCameraOpen, cameraStream])

  async function updateVideoDeviceList() {
    if (!navigator.mediaDevices?.enumerateDevices) return []
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const videoInputs = devices.filter((d) => d.kind === 'videoinput')
      setVideoDevices(videoInputs)
      return videoInputs
    } catch {
      return []
    }
  }

  async function startLaptopCamera(deviceIdToUse) {
    setCameraError('')
    setIsCameraActive(false)
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('This browser does not support system camera capture.')
      return
    }

    cameraStreamRef.current?.getTracks().forEach((track) => track.stop())
    cameraStreamRef.current = null
    setCameraStream(null)

    const targetId = deviceIdToUse || selectedDeviceId
    try {
      let stream
      try {
        const videoConstraint = targetId
          ? { deviceId: { ideal: targetId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
          : { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 } }
        stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraint,
          audio: false,
        })
      } catch {
        try {
          const fallbackConstraint = targetId ? { deviceId: targetId } : { facingMode: 'user' }
          stream = await navigator.mediaDevices.getUserMedia({
            video: fallbackConstraint,
            audio: false,
          })
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        }
      }

      cameraStreamRef.current = stream
      setCameraStream(stream)
      setIsCameraOpen(true)

      if (cameraVideoRef.current) {
        attachStreamToVideo(cameraVideoRef.current, stream)
      }

      const available = await updateVideoDeviceList()
      const activeTrack = stream.getVideoTracks()?.[0]
      const activeSettings = activeTrack?.getSettings?.()
      if (activeSettings?.deviceId && !targetId) {
        setSelectedDeviceId(activeSettings.deviceId)
      } else if (!targetId && available.length > 0) {
        setSelectedDeviceId(available[0].deviceId)
      }
    } catch (cameraReqErr) {
      console.error('Camera request error:', cameraReqErr)
      let message = 'Could not access system camera. Please check permissions or choose a file.'
      if (cameraReqErr.name === 'NotAllowedError' || cameraReqErr.name === 'PermissionDeniedError') {
        message = 'Camera permission update pending: Reload the browser page to apply permissions.'
      } else if (cameraReqErr.name === 'NotReadableError' || cameraReqErr.name === 'TrackStartError') {
        message = 'Camera is currently locked by another application. Please close other camera apps.'
      } else if (cameraReqErr.message) {
        message = `Camera notice: ${cameraReqErr.message}`
      }
      setCameraError(message)
    }
  }

  const startWebcam = startLaptopCamera

  async function handleDeviceSwitch(newDeviceId) {
    setSelectedDeviceId(newDeviceId)
    if (isCameraOpen) {
      await startLaptopCamera(newDeviceId)
    }
  }

  function captureLaptopSnapshot() {
    const video = cameraVideoRef.current
    if (!video || !video.videoWidth || !video.videoHeight) {
      setCameraError('System camera feed is initializing. Please wait a moment.')
      return
    }

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const context = canvas.getContext('2d')
    if (!context) {
      setCameraError('Failed to capture frame context.')
      return
    }

    if (isMirrored) {
      context.save()
      context.translate(canvas.width, 0)
      context.scale(-1, 1)
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      context.restore()
    } else {
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
    }

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setCameraError('Could not encode camera frame.')
          return
        }
        const captured = new File([blob], `studio-capture-${Date.now()}.jpg`, {
          type: 'image/jpeg',
        })
        setFile(captured)
        setResult(null)
        setError('')
        setCameraError('')
        stopLaptopCamera()
      },
      'image/jpeg',
      0.95,
    )
  }

  function startRecordingClip() {
    if (!cameraStreamRef.current) return
    setCameraError('')
    recordedChunksRef.current = []

    let options = { mimeType: 'video/webm' }
    if (typeof MediaRecorder !== 'undefined') {
      if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
        options = { mimeType: 'video/webm;codecs=vp9' }
      } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
        options = { mimeType: 'video/webm;codecs=vp8' }
      } else if (MediaRecorder.isTypeSupported('video/mp4')) {
        options = { mimeType: 'video/mp4' }
      }
    }

    try {
      const recorder = new MediaRecorder(cameraStreamRef.current, options)
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data)
        }
      }
      recorder.onstop = () => {
        const mime = options.mimeType || 'video/webm'
        const ext = mime.includes('mp4') ? 'mp4' : 'webm'
        const blob = new Blob(recordedChunksRef.current, { type: mime })
        const recordedFile = new File([blob], `studio-clip-${Date.now()}.${ext}`, {
          type: mime,
        })
        setFile(recordedFile)
        setResult(null)
        setError('')
        stopLaptopCamera()
      }

      mediaRecorderRef.current = recorder
      recorder.start(250)
      setIsRecording(true)
      setRecordingSeconds(0)

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1)
      }, 1000)
    } catch (err) {
      setCameraError(`Could not start video recording: ${err.message}`)
    }
  }

  function stopRecordingClip() {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = null
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    setIsRecording(false)
  }

  async function loadSample(sample) {
    setIsLoadingSample(true)
    setError('')
    setResult(null)
    stopWebcam()

    try {
      const res = await fetch(`/api/samples/${sample.id}`)
      if (!res.ok) {
        throw new Error(`Failed to load ${sample.label}`)
      }
      const blob = await res.blob()
      const sampleFile = new File([blob], sample.id, { type: blob.type })
      setFile(sampleFile)
    } catch (sampleErr) {
      setError(sampleErr.message)
    } finally {
      setIsLoadingSample(false)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!file) {
      setError('Please select or capture a file first.')
      return
    }

    setIsLoading(true)
    setError('')
    setResult(null)

    const form = new FormData()
    form.append('media', file)

    try {
      const query = kind === 'video' ? `?aggMode=${encodeURIComponent(aggMode)}` : ''
      const headers = {}
      if (geminiApiKey) {
        headers['x-gemini-api-key'] = geminiApiKey
      }
      const response = await fetch(`/api/analyze${query}`, {
        method: 'POST',
        headers,
        body: form,
      })
      const body = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(body?.error?.message ?? 'Analysis request failed.')
      }

      setResult(body)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen bg-[#030712] text-slate-100 selection:bg-cyan-500 selection:text-black">
      {/* Immersive Cyber Forensic Ambient Background */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        {/* Sleek Fluid Obsidian & Neon Rim-lit Wallpaper */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-55 scale-[1.01] transform transition-transform duration-1000"
          style={{ backgroundImage: `url('/images/deep-forensic-bg.jpg')` }}
        />
        {/* Soft Vignette & Atmospheric Gradient Overlays */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#030712]/50 via-[#030712]/40 to-[#030712]/80" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_35%,_#030712_88%)]" />

        {/* Ambient dynamic glow orbs for dimensional depth */}
        <div className="absolute -top-40 left-1/4 h-[550px] w-[550px] rounded-full bg-cyan-500/10 blur-[140px]" />
        <div className="absolute top-1/3 -right-40 h-[650px] w-[650px] rounded-full bg-indigo-500/10 blur-[160px]" />
        <div className="absolute -bottom-40 left-1/3 h-[500px] w-[500px] rounded-full bg-purple-500/10 blur-[150px]" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-6 sm:px-8">
        {/* Top Executive Navigation Bar */}
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-800/80 bg-slate-900/40 p-4 shadow-xl backdrop-blur-2xl">
          <div className="flex items-center gap-3.5">
            {/* Custom DeepTrace Hexagonal Biometric Neural Logo */}
            <div className="relative group flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/40 bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950 p-2.5 shadow-[0_0_25px_rgba(34,211,238,0.25)] transition-all duration-300 hover:border-cyan-300 hover:shadow-[0_0_30px_rgba(34,211,238,0.4)]">
              <svg viewBox="0 0 36 36" fill="none" className="h-full w-full">
                <defs>
                  <linearGradient id="dtShieldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#22d3ee" />
                    <stop offset="50%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#a855f7" />
                  </linearGradient>
                  <linearGradient id="dtCoreGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#67e8f9" />
                    <stop offset="100%" stopColor="#3b82f6" />
                  </linearGradient>
                </defs>
                {/* Hexagonal Biometric Shield Frame */}
                <path
                  d="M18 3L30 10V22L18 29L6 22V10L18 3Z"
                  stroke="url(#dtShieldGrad)"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* Interlocking Forensic Trace Matrix (D + T vectors) */}
                <path
                  d="M18 8V24M11 12.5L18 8L25 12.5M11 20L18 24.5L25 20"
                  stroke="url(#dtShieldGrad)"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.85"
                />
                {/* Central Luminous Quantum Sensor */}
                <circle
                  cx="18"
                  cy="16"
                  r="3"
                  fill="url(#dtCoreGrad)"
                  className="animate-pulse"
                />
                {/* Calibrated Optical Focus Ticks */}
                <circle cx="18" cy="4" r="1.2" fill="#22d3ee" />
                <circle cx="29.5" cy="10.5" r="1.2" fill="#818cf8" />
                <circle cx="6.5" cy="10.5" r="1.2" fill="#22d3ee" />
              </svg>
            </div>

            <div>
              <div className="flex items-center gap-2.5">
                <span className="text-xl font-black tracking-tight bg-gradient-to-r from-white via-slate-100 to-cyan-300 bg-clip-text text-transparent">
                  DeepTrace
                </span>
                <span className="rounded-full border border-cyan-400/40 bg-cyan-500/10 px-2.5 py-0.5 font-mono text-[10px] font-extrabold uppercase tracking-wide text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.2)]">
                  v0.7 PRO
                </span>
              </div>
              <p className="text-xs font-medium text-slate-400">
                Neural Media Forensics & Live Web Grounding
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Live Camera Studio Trigger Button */}
            <button
              type="button"
              onClick={isCameraOpen ? stopLaptopCamera : () => startLaptopCamera()}
              className={`flex items-center gap-2 rounded-2xl border px-4 py-2 text-xs font-bold transition shadow-lg ${
                isCameraOpen
                  ? 'border-rose-500/50 bg-rose-500/20 text-rose-200 hover:bg-rose-500/30'
                  : 'border-cyan-400/40 bg-cyan-500/10 text-cyan-200 hover:border-cyan-400 hover:bg-cyan-500/20'
              }`}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <span>{isCameraOpen ? 'Close Camera Studio' : 'Open Camera Studio'}</span>
            </button>

            {/* AI Grounding Status Indicator */}
            <div className="flex items-center gap-2 rounded-2xl border border-indigo-400/30 bg-indigo-500/10 px-3.5 py-2 text-xs font-semibold text-indigo-200">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400 shadow-[0_0_6px_#22d3ee]" />
              </span>
              <span>{geminiApiKey ? 'Gemini 2.5 + Grounding' : 'AI & Web Search Active'}</span>
            </div>

            {/* AI Search Settings Trigger */}
            <button
              type="button"
              onClick={() => setIsAiSettingsOpen(true)}
              className="flex items-center gap-1.5 rounded-2xl border border-slate-700 bg-slate-800/80 px-3.5 py-2 text-xs font-bold text-slate-200 transition hover:border-cyan-400 hover:text-white"
            >
              <svg className="h-3.5 w-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              <span>AI Settings</span>
            </button>
          </div>
        </header>

        {/* Main Work Area */}
        <main className="flex-1 py-8">
          {/* EXPANDED LIVE CAMERA STUDIO VIEWPORT */}
          <LiveCameraStudio
            isOpen={isCameraOpen}
            onClose={stopLaptopCamera}
            cameraVideoRef={(node) => {
              cameraVideoRef.current = node
              if (node && cameraStreamRef.current) {
                attachStreamToVideo(node, cameraStreamRef.current)
              }
            }}
            cameraStream={cameraStream}
            isCameraActive={isCameraActive}
            streamResolution={streamResolution}
            videoDevices={videoDevices}
            selectedDeviceId={selectedDeviceId}
            onDeviceSwitch={handleDeviceSwitch}
            onReloadCamera={() => startLaptopCamera(selectedDeviceId)}
            isMirrored={isMirrored}
            onToggleMirror={() => setIsMirrored(!isMirrored)}
            onCaptureSnapshot={captureLaptopSnapshot}
            isRecording={isRecording}
            recordingSeconds={recordingSeconds}
            onStartRecording={startRecordingClip}
            onStopRecording={stopRecordingClip}
            cameraError={cameraError}
          />

          {/* TWO-COLUMN INGESTION & MEDIA INSPECTOR */}
          <div className="grid gap-8 lg:grid-cols-12 lg:items-start">
            {/* LEFT COLUMN: Intake & Controls (7 Cols) */}
            <div className="space-y-6 lg:col-span-7">
              {/* Hero Banner */}
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3.5 py-1 text-xs font-bold tracking-wider text-cyan-300">
                  <span>FORENSIC INGESTION PIPELINE</span>
                </div>
                <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
                  Detect synthetic media.
                  <br />
                  <span className="bg-gradient-to-r from-cyan-300 via-indigo-300 to-slate-400 bg-clip-text text-transparent">
                    Ground every finding with live web search.
                  </span>
                </h1>
                <p className="mt-3 text-sm leading-relaxed text-slate-300">
                  Upload images, video, or audio for real-time verification using multimodal AI, live web search grounding, Error Level Analysis (ELA), and Fourier spectral diagnostics.
                </p>
              </div>

              {/* Sample Media Shortcuts */}
              {samples.length > 0 ? (
                <div className="rounded-3xl border border-slate-800/80 bg-slate-900/50 p-5 shadow-xl backdrop-blur-xl">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                      Quick Demo Samples
                    </p>
                    <span className="text-[11px] text-slate-500">1-Click Instant Test</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2.5">
                    {samples.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => loadSample(s)}
                        disabled={isLoadingSample || isLoading}
                        className="flex items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-800/70 px-3.5 py-2 text-xs font-semibold text-slate-200 transition-all hover:border-cyan-400 hover:bg-cyan-500/10 hover:text-cyan-200 disabled:opacity-50"
                      >
                        <span>{s.type === 'video' ? '🎥' : '🖼️'}</span>
                        <span>{s.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Drag & Drop File Upload Area */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div
                  onDragOver={(e) => {
                    e.preventDefault()
                    setIsDragging(true)
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setIsDragging(false)
                    stopWebcam()
                    setCameraError('')
                    const dropped = e.dataTransfer.files?.[0]
                    if (dropped) {
                      setFile(dropped)
                      setResult(null)
                      setError('')
                    }
                  }}
                  className={`relative block rounded-3xl border-2 border-dashed p-8 text-center transition-all ${
                    isDragging
                      ? 'border-cyan-400 bg-cyan-400/10 scale-[1.01]'
                      : file
                        ? 'border-cyan-500/50 bg-slate-950/60 shadow-[0_0_30px_rgba(34,211,238,0.1)]'
                        : 'border-slate-700/80 bg-slate-950/40 hover:border-slate-500 hover:bg-slate-900/40'
                  }`}
                >
                  <label htmlFor="media" className="cursor-pointer">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 text-cyan-300 shadow-lg">
                      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </div>
                    <p className="mt-4 text-base font-bold text-slate-100">
                      {isDragging
                        ? 'Drop media here to analyze'
                        : file
                          ? file.name
                          : 'Select an image, video, or audio file'}
                    </p>
                    <p className="mt-1.5 text-xs text-slate-400">
                      Supported: JPG, PNG, WebP, MP4, MOV, MKV, WAV, MP3 up to 50 MiB
                    </p>
                    {file ? (
                      <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-1.5 text-xs font-mono font-bold text-cyan-200">
                        <span>{formatBytes(file.size)}</span>
                        <span>•</span>
                        <span className="uppercase">{kind}</span>
                      </div>
                    ) : null}
                    <input
                      id="media"
                      type="file"
                      accept={ACCEPTED_MEDIA}
                      className="sr-only"
                      onChange={(event) => {
                        stopWebcam()
                        setCameraError('')
                        setFile(event.target.files?.[0] ?? null)
                        setResult(null)
                        setError('')
                      }}
                    />
                  </label>
                </div>

                {/* Video Aggregation Mode Selector */}
                {kind === 'video' ? (
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                      Video Temporal Aggregation
                    </label>
                    <div className="mt-2.5 grid gap-2 sm:grid-cols-3">
                      {aggregationOptions.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setAggMode(opt.value)}
                          className={`rounded-xl border p-3 text-left transition ${
                            aggMode === opt.value
                              ? 'border-cyan-400 bg-cyan-500/10 text-white'
                              : 'border-slate-800 bg-slate-950/70 text-slate-400 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-200">{opt.badge}</span>
                            {aggMode === opt.value ? <span className="text-cyan-400 font-bold">✓</span> : null}
                          </div>
                          <p className="mt-1 text-[11px] leading-tight text-slate-400">{opt.label}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* Primary Execute Button */}
                <button
                  type="submit"
                  disabled={!file || isLoading}
                  className="w-full flex items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-cyan-400 via-teal-300 to-indigo-500 py-4 text-sm font-black uppercase tracking-wider text-slate-950 shadow-[0_0_30px_rgba(34,211,238,0.3)] transition hover:opacity-95 hover:shadow-[0_0_40px_rgba(34,211,238,0.5)] active:scale-[0.99] disabled:opacity-40 disabled:pointer-events-none"
                >
                  {isLoading ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950 border-t-transparent" />
                      <span>Running AI Multimodal Forensics & Live Web Search...</span>
                    </>
                  ) : (
                    <>
                      <span>⚡</span>
                      <span>Analyse Media Authenticity & Search Web</span>
                    </>
                  )}
                </button>
              </form>

              {/* Error Alert */}
              {error ? (
                <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-xs font-semibold text-rose-200 shadow-lg">
                  <div className="flex items-center gap-2">
                    <span className="text-base">⚠️</span>
                    <span>{error}</span>
                  </div>
                </div>
              ) : null}
            </div>

            {/* RIGHT COLUMN: Media Preview & Inspector (5 Cols) */}
            <div className="lg:col-span-5">
              <section className="rounded-3xl border border-slate-800/90 bg-gradient-to-b from-slate-900/60 to-slate-950/80 p-6 shadow-2xl backdrop-blur-xl">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                    Media Inspector & Preview
                  </p>
                  {file ? (
                    <button
                      type="button"
                      onClick={() => {
                        setFile(null)
                        setResult(null)
                        setError('')
                      }}
                      className="text-xs font-semibold text-slate-400 hover:text-rose-400 transition"
                    >
                      Clear
                    </button>
                  ) : null}
                </div>

                {file && filePreview ? (
                  <div className="mt-4 space-y-4">
                    {/* Media Viewer */}
                    <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-slate-800 bg-black flex items-center justify-center shadow-inner">
                      {kind === 'image' ? (
                        <img
                          src={filePreview}
                          alt="Media preview"
                          className="h-full w-full object-contain"
                        />
                      ) : kind === 'video' ? (
                        <video
                          src={filePreview}
                          controls
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <div className="p-6 text-center">
                          <span className="text-4xl">🎵</span>
                          <p className="mt-2 text-xs font-bold text-slate-300">{file.name}</p>
                          <audio src={filePreview} controls className="mt-3 w-full" />
                        </div>
                      )}
                    </div>

                    {/* Metadata Specs */}
                    <div className="space-y-2 rounded-2xl border border-slate-800/80 bg-slate-950/80 p-4 text-xs">
                      <div className="flex justify-between border-b border-slate-800/60 pb-2">
                        <span className="text-slate-500">File Name</span>
                        <span className="font-mono text-slate-200 truncate max-w-[200px]">{file.name}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-800/60 pb-2">
                        <span className="text-slate-500">File Size</span>
                        <span className="font-semibold text-slate-200">{formatBytes(file.size)}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-800/60 pb-2">
                        <span className="text-slate-500">Format Class</span>
                        <span className="font-mono text-cyan-300 uppercase font-bold">{kind}</span>
                      </div>
                      <div className="flex justify-between pt-1">
                        <span className="text-slate-500">MIME Type</span>
                        <span className="font-mono text-slate-400">{file.type || 'Unknown'}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800/80 p-8 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-slate-500">
                      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <p className="mt-3 text-sm font-bold text-slate-300">No Media Loaded</p>
                    <p className="mt-1 text-xs text-slate-500 max-w-xs">
                      Drop an image, video, or audio file, or capture from your laptop camera to preview forensic attributes here.
                    </p>
                    <button
                      type="button"
                      onClick={() => startLaptopCamera()}
                      className="mt-4 flex items-center gap-2 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-xs font-bold text-cyan-300 hover:bg-cyan-500/20 transition"
                    >
                      <span>📷</span>
                      <span>Launch Studio Camera</span>
                    </button>
                  </div>
                )}
              </section>
            </div>
          </div>

          {/* RESULTS DASHBOARD */}
          <div className="mt-12">
            {result ? (
              <ResultView result={result} />
            ) : (
              <div className="rounded-3xl border border-slate-800/60 bg-slate-900/20 p-8 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-slate-600">
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="mt-3 text-sm font-bold text-slate-400">Ready for Media Verification</p>
                <p className="mt-1 text-xs text-slate-500">
                  Upload an image, video, or launch the studio camera above to begin multimodal analysis and live web grounding.
                </p>
              </div>
            )}
          </div>
        </main>

        {/* Executive Footer */}
        <footer className="mt-16 border-t border-slate-800/80 pt-6 text-center text-xs leading-relaxed text-slate-500">
          DeepTrace AI Enterprise Platform • Multimodal Forensics & Live Web Search Grounding • Google Search & Provenance Verification
        </footer>
      </div>

      <AiSettingsModal
        isOpen={isAiSettingsOpen}
        onClose={() => setIsAiSettingsOpen(false)}
        apiKey={geminiApiKey}
        onSaveApiKey={handleSaveApiKey}
      />
    </div>
  )
}
