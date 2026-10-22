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

  // Score semantic coloring
  let barColor = 'from-emerald-400 to-cyan-400'
  let labelNote = 'Low manipulation signal (Consistent with Authentic)'
  if (hasScore) {
    if (score >= 0.65) {
      barColor = 'from-amber-400 via-rose-500 to-red-500'
      labelNote = 'High fake / synthetic anomaly indicators'
    } else if (score >= 0.35) {
      barColor = 'from-cyan-400 to-amber-400'
      labelNote = 'Intermediate / inconclusive range'
    } else {
      barColor = 'from-emerald-400 to-cyan-400'
      labelNote = 'Consistent with natural photographic capture'
    }
  }

  return (
    <section className="rounded-3xl border border-slate-800/90 bg-gradient-to-b from-slate-900/80 to-slate-950/90 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-cyan-400/90">
            Observation Model Result
          </p>
          <h2 className="mt-1.5 text-2xl font-extrabold tracking-tight text-white">
            {analysisType === 'visual_forensics_non_facial'
              ? 'Digital Forensics Anomaly Index'
              : isAudio
                ? 'Acoustic Voice Synthesis Score'
                : 'Neural Classifier Fake-Class Score'}
          </h2>
        </div>
        <StatusPill status={result.status} analysisType={analysisType} />
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-[220px_1fr] sm:items-end">
        <div className="rounded-2xl border border-slate-800/80 bg-slate-950/90 p-5 shadow-inner">
          <p className="font-mono text-5xl font-black tracking-tight text-white">
            {hasScore ? score.toFixed(4) : '—'}
          </p>
          <p className="mt-2 text-xs font-semibold text-slate-400">
            {!hasScore
              ? 'No score produced'
              : isVideo
                ? 'Video aggregate'
                : isAudio
                  ? 'Acoustic voice score'
                  : analysisType === 'visual_forensics_non_facial'
                    ? 'Visual artifact index'
                    : 'Image face score'}
          </p>
          {hasScore ? (
            <p className="mt-2 text-[11px] font-semibold text-cyan-300">
              {labelNote}
            </p>
          ) : null}
        </div>

        <div>
          {isAudio && !result.ai_analysis ? (
            <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm leading-relaxed text-amber-200">
              {AUDIO_MESSAGE}
            </p>
          ) : (
            <div className="space-y-3.5">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
                <span>0.0 (Authentic baseline)</span>
                <span>0.5 (Threshold)</span>
                <span>1.0 (Manipulated / Synthetic)</span>
              </div>
              <div className="relative h-4 w-full overflow-hidden rounded-full bg-slate-800/90 p-0.5 shadow-inner">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${barColor} shadow-md transition-all duration-700 ease-out`}
                  style={{ width: `${width}%` }}
                />
              </div>
              <p className="text-xs leading-relaxed text-slate-400">
                {isAudio
                  ? 'Acoustic speech frequency and vocoder artifact score.'
                  : 'Sigmoid fake-class probability output. Observation signal for forensic analyst review.'}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4">
        <p className="text-sm font-medium leading-relaxed text-slate-200">
          {result.message}
        </p>
      </div>

      {hasScore && analysisType === 'facial_deepfake' ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Metric
            label="Face detector confidence"
            value={formatPercent(result.result.face_confidence)}
            note="YOLO face detection confidence."
            highlight
          />
          <Metric
            label="Face frame area"
            value={formatPercent(result.result.face_area_percent)}
            note="Portion of media frame occupied by face."
          />
          <Metric
            label="Face brightness"
            value={formatPercent(result.result.face_brightness_percent)}
            note="Grayscale mean luminosity of crop."
          />
        </div>
      ) : null}
    </section>
  )
}

function ForensicsPanel({ result }) {
  const forensics = result.result?.forensics
  if (!forensics) return null

  return (
    <section className="rounded-3xl border border-indigo-500/30 bg-gradient-to-b from-slate-900/60 to-slate-950/80 p-6 shadow-xl backdrop-blur-xl sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-indigo-400">
            Explainable Digital Forensics
          </p>
          <h2 className="mt-1 text-xl font-extrabold text-slate-100">
            Signal & Spectral Artifact Diagnostics
          </h2>
        </div>
        <span className="rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3.5 py-1 text-xs font-semibold text-indigo-300">
          Fourier & ELA Metrics
        </span>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Error Level Analysis (ELA)"
          value={`${forensics.ela_mean.toFixed(2)} μ`}
          note={`Std dev: ${forensics.ela_std.toFixed(2)}. Compression anomaly difference.`}
        />
        <Metric
          label="FFT High-Freq Ratio"
          value={forensics.fft_high_freq_ratio.toFixed(2)}
          note="High-frequency power spikes typical in GAN/diffusion generation."
        />
        <Metric
          label="Texture / Laplacian Sharpness"
          value={forensics.sharpness_variance.toFixed(0)}
          note="Edge variance indicating camera focus vs synthetic smoothing."
        />
        <Metric
          label="Synthetic Signal Index"
          value={forensics.synthetic_artifact_score.toFixed(4)}
          note="Composite heuristic from spectral & compression artifacts."
          highlight
        />
      </div>

      <p className="mt-4 text-xs leading-relaxed text-slate-400">
        Error Level Analysis highlights compression inconsistencies between modified and original image areas. 2D Fast Fourier Transform (FFT) reveals non-optical periodic grid artifacts common to generative synthesis pipelines.
      </p>
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
      <div className="rounded-3xl border border-slate-800/90 bg-slate-900/50 p-6 backdrop-blur-xl sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-slate-400">
          Cryptographic Integrity
        </p>
        <h3 className="mt-1 text-lg font-bold text-slate-100">Intake Fingerprint</h3>
        <dl className="mt-4 space-y-3.5 text-sm">
          <div className="flex justify-between border-b border-slate-800/80 pb-2">
            <dt className="text-slate-500 font-medium">File Name</dt>
            <dd className="font-mono text-slate-200">{file?.original_name ?? file?.filename}</dd>
          </div>
          <div className="flex justify-between border-b border-slate-800/80 pb-2">
            <dt className="text-slate-500 font-medium">File Size</dt>
            <dd className="text-slate-200 font-semibold">{formatBytes(file?.bytes)}</dd>
          </div>
          <div className="flex justify-between border-b border-slate-800/80 pb-2">
            <dt className="text-slate-500 font-medium">Detected Format</dt>
            <dd className="font-mono text-cyan-300">{file?.detected_type ?? file?.content_type}</dd>
          </div>
          <div className="pt-1">
            <dt className="text-slate-500 font-medium">SHA-256 Checksum</dt>
            <dd className="mt-2 flex items-center gap-2 rounded-xl bg-slate-950 p-3 font-mono text-xs text-cyan-200 shadow-inner">
              <span className="truncate">{file?.sha256}</span>
              <button
                type="button"
                onClick={copyDigest}
                className="shrink-0 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] uppercase font-bold text-slate-300 hover:border-cyan-400 hover:text-white"
              >
                {copied ? 'Copied ✓' : 'Copy'}
              </button>
            </dd>
          </div>
        </dl>
      </div>

      <div className="rounded-3xl border border-slate-800/90 bg-slate-900/50 p-6 backdrop-blur-xl sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-slate-400">
          Forensic Engine Metadata
        </p>
        <h3 className="mt-1 text-lg font-bold text-slate-100">Engine Configuration</h3>
        {detector ? (
          <dl className="mt-4 space-y-3.5 text-sm">
            <div className="flex justify-between border-b border-slate-800/80 pb-2">
              <dt className="text-slate-500 font-medium">Neural Architecture</dt>
              <dd className="font-mono font-bold text-slate-200">{detector.model || 'Multimodal AI'}</dd>
            </div>
            <div className="flex justify-between border-b border-slate-800/80 pb-2">
              <dt className="text-slate-500 font-medium">Training Reference</dt>
              <dd className="font-mono text-slate-200">{detector.dataset ? `${detector.dataset} (FaceForensics++)` : 'Web Provenance & GenAI Artifacts'}</dd>
            </div>
            <div className="flex justify-between border-b border-slate-800/80 pb-2">
              <dt className="text-slate-500 font-medium">Inference Hardware</dt>
              <dd className="font-mono text-cyan-300 uppercase font-bold">{detector.device || 'CPU'}</dd>
            </div>
            <div className="flex justify-between pt-1">
              <dt className="text-slate-500 font-medium">Grounding Engine</dt>
              <dd className="text-xs font-semibold text-indigo-300">Google Search & Web Registry Grounding</dd>
            </div>
          </dl>
        ) : (
          <p className="mt-4 text-sm text-slate-500">Detector metadata is currently unavailable.</p>
        )}
      </div>
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
        <Metric label="Duration" value={probe ? `${probe.duration_seconds.toFixed(2)}s` : 'Unknown'} />
        <Metric label="Resolution" value={probe ? `${probe.width ?? '?'} × ${probe.height ?? '?'}` : 'Unknown'} />
        <Metric label="Video Codec" value={probe?.codec ?? 'Unknown'} highlight />
        <Metric label="Audio Streams" value={probe ? String(probe.audio_stream_count ?? 0) : '0'} />
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
      <details className="rounded-3xl border border-slate-800/80 bg-slate-900/40 p-6 transition">
        <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.25em] text-slate-400 hover:text-cyan-300">
          Inspect Raw JSON Forensic Audit Payload
        </summary>
        <pre className="mt-4 max-h-96 overflow-auto rounded-2xl bg-slate-950 p-5 font-mono text-xs leading-relaxed text-slate-300 shadow-inner">
          {JSON.stringify(result, null, 2)}
        </pre>
      </details>
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
    <div className="min-h-screen bg-[#030712] text-slate-100 selection:bg-cyan-500 selection:text-black">
      {/* Background cybernetic grid & ambient glows */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/4 h-[550px] w-[550px] rounded-full bg-cyan-500/10 blur-[140px]" />
        <div className="absolute top-1/3 -right-40 h-[650px] w-[650px] rounded-full bg-indigo-500/10 blur-[160px]" />
        <div className="absolute -bottom-40 left-1/3 h-[500px] w-[500px] rounded-full bg-purple-500/10 blur-[150px]" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-6 sm:px-8">
        {/* Top Executive Navigation Bar */}
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-800/80 bg-slate-900/40 p-4 shadow-xl backdrop-blur-2xl">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-400/40 bg-gradient-to-br from-cyan-400/20 to-indigo-600/30 shadow-[0_0_20px_rgba(34,211,238,0.25)]">
              <span className="h-3 w-3 rounded-sm bg-cyan-300 shadow-[0_0_8px_#22d3ee]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-black tracking-[0.2em] text-white">
                  DEEPTRACE
                </span>
                <span className="rounded-md border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 font-mono text-[10px] font-bold text-cyan-300">
                  v0.4 PRO
                </span>
              </div>
              <p className="text-xs text-slate-400">Multimodal Media Forensics & Live Web Grounding</p>
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
              <span>{isCameraOpen ? 'Close Camera Studio' : '📷 Open Camera Studio'}</span>
            </button>

            {/* AI Grounding Status Indicator */}
            <div className="flex items-center gap-2 rounded-2xl border border-indigo-400/30 bg-indigo-500/10 px-3.5 py-2 text-xs font-semibold text-indigo-200">
              <span className="h-2 w-2 animate-ping rounded-full bg-cyan-400" />
              <span>{geminiApiKey ? 'Gemini 2.5 + Grounding' : 'AI & Web Search Active'}</span>
            </div>

            {/* AI Search Settings Trigger */}
            <button
              type="button"
              onClick={() => setIsAiSettingsOpen(true)}
              className="flex items-center gap-1.5 rounded-2xl border border-slate-700 bg-slate-800/80 px-3.5 py-2 text-xs font-bold text-slate-200 transition hover:border-cyan-400 hover:text-white"
            >
              <span>⚙️</span>
              <span>AI Engine Settings</span>
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
