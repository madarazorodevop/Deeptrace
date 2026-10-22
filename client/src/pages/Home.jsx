import { useEffect, useMemo, useRef, useState } from 'react'

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
        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium tracking-wide ${
          evaluated
            ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-200'
            : 'border-amber-400/30 bg-amber-400/10 text-amber-200'
        }`}
      >
        <span
          className={`h-2 w-2 rounded-full ${
            evaluated ? 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]' : 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]'
          }`}
        />
        {evaluated ? 'Evaluated — Score Ready' : 'Inconclusive — No Score'}
      </span>
      {isForensics ? (
        <span className="rounded-full border border-indigo-400/30 bg-indigo-500/10 px-2.5 py-1 text-xs font-medium text-indigo-200">
          Visual Forensics (Non-Facial)
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
    <div className="rounded-xl border border-slate-800/80 bg-slate-950/70 p-4 transition hover:border-slate-700">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
        {label}
      </p>
      <p className={`mt-2 text-base font-semibold ${highlight ? 'text-cyan-300' : 'text-slate-200'}`}>
        {value}
      </p>
      {note ? <p className="mt-1 text-xs leading-relaxed text-slate-500">{note}</p> : null}
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
  let labelNote = 'Low manipulation signal'
  if (hasScore) {
    if (score >= 0.65) {
      barColor = 'from-amber-400 to-rose-500'
      labelNote = 'High fake / anomaly indicators'
    } else if (score >= 0.35) {
      barColor = 'from-cyan-400 to-amber-400'
      labelNote = 'Intermediate / inconclusive range'
    } else {
      barColor = 'from-emerald-400 to-cyan-400'
      labelNote = 'Consistent with authentic distribution'
    }
  }

  return (
    <section className="rounded-2xl border border-slate-800/90 bg-gradient-to-b from-slate-900/60 to-slate-950/80 p-6 shadow-xl backdrop-blur-md sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-400/90">
            Observation Model Result
          </p>
          <h2 className="mt-1.5 text-xl font-bold tracking-tight text-white">
            {analysisType === 'visual_forensics_non_facial'
              ? 'Digital Forensics Anomaly Score'
              : 'DeepGuard Fake-Class Score'}
          </h2>
        </div>
        <StatusPill status={result.status} analysisType={analysisType} />
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-[190px_1fr] sm:items-end">
        <div className="rounded-xl border border-slate-800/80 bg-slate-950/90 p-4">
          <p className="font-mono text-4xl font-extrabold tracking-tight text-white">
            {hasScore ? score.toFixed(4) : '—'}
          </p>
          <p className="mt-1 text-xs font-medium text-slate-400">
            {!hasScore
              ? 'No score produced'
              : isVideo
                ? 'Video aggregate'
                : isAudio
                  ? 'No audio score'
                  : analysisType === 'visual_forensics_non_facial'
                    ? 'Visual artifact index'
                    : 'Image face score'}
          </p>
          {hasScore ? (
            <p className="mt-2 text-[11px] font-medium text-cyan-300/90">
              {labelNote}
            </p>
          ) : null}
        </div>
        <div>
          {isAudio ? (
            <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-4 text-sm leading-relaxed text-amber-200">
              {AUDIO_MESSAGE}
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-medium text-slate-400">
                <span>0.0 (Authentic baseline)</span>
                <span>0.5</span>
                <span>1.0 (Manipulated / Synthetic)</span>
              </div>
              <div className="relative h-3 w-full overflow-hidden rounded-full bg-slate-800/90 p-0.5 shadow-inner">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${barColor} transition-all duration-700 ease-out`}
                  style={{ width: `${width}%` }}
                />
              </div>
              <p className="text-xs leading-relaxed text-slate-400">
                Sigmoid fake-class probability output. Uncalibrated observation signal — not a legal determination of authenticity.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <p className="text-sm font-medium leading-relaxed text-slate-300">
          {result.message}
        </p>
      </div>

      {hasScore && analysisType === 'facial_deepfake' ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
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
    <section className="rounded-2xl border border-slate-800/90 bg-gradient-to-b from-slate-900/40 to-slate-950/70 p-6 shadow-xl backdrop-blur-md sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-400">
            Explainable Digital Forensics
          </p>
          <h2 className="mt-1 text-lg font-bold text-slate-100">
            Signal & Spectral Artifact Analysis
          </h2>
        </div>
        <span className="rounded-full border border-indigo-400/20 bg-indigo-500/10 px-3 py-1 text-xs text-indigo-300">
          Fourier & ELA Metrics
        </span>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Error Level Analysis (ELA)"
          value={`${forensics.ela_mean.toFixed(2)} μ`}
          note={`Std dev: ${forensics.ela_std.toFixed(2)}. Compression anomaly difference.`}
        />
        <Metric
          label="FFT High-Freq Ratio"
          value={forensics.fft_high_freq_ratio.toFixed(2)}
          note="Ratio of high-frequency power spikes typical in GAN/diffusion generation."
        />
        <Metric
          label="Texture / Laplacian Sharpness"
          value={forensics.sharpness_variance.toFixed(0)}
          note="Edge variance indicating optical camera focus vs synthetic smoothing."
        />
        <Metric
          label="Synthetic Signal Index"
          value={forensics.synthetic_artifact_score.toFixed(4)}
          note="Composite heuristic from spectral and compression artifacts."
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
    <section className="rounded-2xl border border-slate-800/90 bg-slate-900/40 p-6 backdrop-blur-md sm:p-7">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
        Temporal Frame Aggregation
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Metric label="Selected mode" value={aggregation.mode.toUpperCase()} highlight />
        <Metric label="Chosen decision branch" value={aggregation.selected_branch ?? 'heuristic'} />
        <Metric
          label="Evaluated frame count"
          value={String(aggregation.frame_count ?? 'N/A')}
        />
      </div>
      <p className="mt-3 text-sm leading-relaxed text-slate-400">
        {aggregation.description}
      </p>
    </section>
  )
}

function FramesPanel({ result }) {
  const frames = result.frames ?? result.result?.frames ?? []
  if (frames.length === 0) return null

  return (
    <section className="rounded-2xl border border-slate-800/90 bg-slate-900/40 p-6 backdrop-blur-md sm:p-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            FFmpeg Frame Observations
          </p>
          <h2 className="mt-1 text-lg font-bold text-slate-100">
            Sampled Frame Predictions (fps=1)
          </h2>
        </div>
        <span className="rounded-full bg-slate-800 px-3 py-1 font-mono text-xs text-slate-300">
          {frames.length} frame{frames.length === 1 ? '' : 's'} analysed
        </span>
      </div>

      <div className="mt-4 max-h-80 overflow-auto rounded-xl border border-slate-800 bg-slate-950/60">
        <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
          <thead className="sticky top-0 bg-slate-950 text-xs font-semibold uppercase tracking-wider text-slate-400">
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
                    className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-sans font-medium ${
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
        Frames sampled at ~1 fps. DeepTrace tests each frame independently through DeepGuard; frame aggregation does not model temporal motion or 3D face consistency.
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
      <div className="rounded-2xl border border-slate-800/90 bg-slate-900/40 p-6 backdrop-blur-md sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          Cryptographic Integrity
        </p>
        <h3 className="mt-1 text-base font-bold text-slate-200">Intake Fingerprint</h3>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex justify-between border-b border-slate-800/80 pb-2">
            <dt className="text-slate-500">File Name</dt>
            <dd className="font-mono text-slate-200">{file?.original_name ?? file?.filename}</dd>
          </div>
          <div className="flex justify-between border-b border-slate-800/80 pb-2">
            <dt className="text-slate-500">File Size</dt>
            <dd className="text-slate-200">{formatBytes(file?.bytes)}</dd>
          </div>
          <div className="flex justify-between border-b border-slate-800/80 pb-2">
            <dt className="text-slate-500">Detected Format</dt>
            <dd className="font-mono text-cyan-300">{file?.detected_type ?? file?.content_type}</dd>
          </div>
          <div className="pt-1">
            <dt className="text-slate-500">SHA-256 Checksum</dt>
            <dd className="mt-1.5 flex items-center gap-2 rounded-lg bg-slate-950 p-2.5 font-mono text-xs text-cyan-200/90">
              <span className="truncate">{file?.sha256}</span>
              <button
                type="button"
                onClick={copyDigest}
                className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] uppercase font-semibold text-slate-300 hover:border-cyan-400 hover:text-white"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </dd>
          </div>
        </dl>
      </div>

      <div className="rounded-2xl border border-slate-800/90 bg-slate-900/40 p-6 backdrop-blur-md sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          Forensic Engine Metadata
        </p>
        <h3 className="mt-1 text-base font-bold text-slate-200">DeepGuard Configuration</h3>
        {detector ? (
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between border-b border-slate-800/80 pb-2">
              <dt className="text-slate-500">Neural Network Model</dt>
              <dd className="font-mono font-medium text-slate-200">{detector.model}</dd>
            </div>
            <div className="flex justify-between border-b border-slate-800/80 pb-2">
              <dt className="text-slate-500">Training Benchmark</dt>
              <dd className="font-mono text-slate-200">{detector.dataset} (FaceForensics++)</dd>
            </div>
            <div className="flex justify-between border-b border-slate-800/80 pb-2">
              <dt className="text-slate-500">Inference Hardware</dt>
              <dd className="font-mono text-cyan-300 uppercase">{detector.device}</dd>
            </div>
            <div className="flex justify-between pt-1">
              <dt className="text-slate-500">License Obligations</dt>
              <dd className="text-xs text-slate-400">DeepGuard MIT / YOLO AGPL-3.0</dd>
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
    <section className="rounded-2xl border border-slate-800/90 bg-slate-900/40 p-6 backdrop-blur-md sm:p-7">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
        Media Container & Stream Details
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Duration" value={probe ? `${probe.duration_seconds.toFixed(2)}s` : 'Unknown'} />
        <Metric label="Resolution" value={probe ? `${probe.width ?? '?'} × ${probe.height ?? '?'}` : 'Unknown'} />
        <Metric label="Video Codec" value={probe?.codec ?? 'Unknown'} highlight />
        <Metric label="Audio Streams" value={probe ? String(probe.audio_stream_count ?? 0) : '0'} />
      </div>
      {sampling ? (
        <p className="mt-3 text-xs leading-relaxed text-slate-400">
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
    <div className="space-y-6" aria-live="polite">
      <ScorePanel result={result} kind={kind} />
      <ForensicsPanel result={result} />
      {isVideo ? <AggregationPanel result={result} /> : null}
      <FileAndDetectorPanel result={result} />
      {isVideo ? <VideoContextPanel result={result} /> : null}
      {isVideo ? <FramesPanel result={result} /> : null}

      <details className="rounded-2xl border border-slate-800/80 bg-slate-900/30 p-5">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 hover:text-cyan-300">
          Inspect Raw JSON Forensic Audit Payload
        </summary>
        <pre className="mt-4 max-h-96 overflow-auto rounded-xl bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-400 shadow-inner">
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

  const cameraStreamRef = useRef(null)
  const cameraVideoRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const recordedChunksRef = useRef([])
  const recordingTimerRef = useRef(null)
  const kind = useMemo(() => mediaKind(file), [file])
  const selectedAggregation = aggregationOptions.find((opt) => opt.value === aggMode)

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

    // Stop existing stream tracks if active
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop())
    cameraStreamRef.current = null
    setCameraStream(null)

    const targetId = deviceIdToUse || selectedDeviceId
    try {
      let stream
      try {
        // Preferred constraint: specify deviceId with ideal to avoid OverconstrainedError in Windows UVC drivers
        const videoConstraint = targetId
          ? { deviceId: { ideal: targetId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
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

      // Immediately attach to video element if already mounted
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
        message = 'Camera permission update pending: Click the blue "Reload" button in Brave (or press Ctrl+R) to apply your permission setting.'
      } else if (cameraReqErr.name === 'NotReadableError' || cameraReqErr.name === 'TrackStartError') {
        message = 'Camera is currently locked by another application or background tab. Please close other camera apps and reload.'
      } else if (cameraReqErr.message) {
        message = `Camera access notice (${cameraReqErr.name || 'Hardware'}): ${cameraReqErr.message}`
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
      setCameraError('System camera feed is initializing or blocked by physical shutter. Please wait a moment.')
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
        const captured = new File([blob], `laptop-camera-photo-${Date.now()}.jpg`, {
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

  const captureWebcam = captureLaptopSnapshot

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
        const recordedFile = new File([blob], `laptop-camera-clip-${Date.now()}.${ext}`, {
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
      if (!res.ok) throw new Error('Failed to load sample')
      const blob = await res.blob()
      const sampleFile = new File([blob], sample.id, {
        type: sample.type === 'video' ? 'video/mp4' : 'image/jpeg',
      })
      setFile(sampleFile)
    } catch (err) {
      setError(`Could not load demo sample: ${err.message}`)
    } finally {
      setIsLoadingSample(false)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!file || !kind) return

    setIsLoading(true)
    setError('')
    setResult(null)

    const form = new FormData()
    form.append('media', file)

    try {
      const query = kind === 'video' ? `?aggMode=${encodeURIComponent(aggMode)}` : ''
      const response = await fetch(`/api/analyze${query}`, {
        method: 'POST',
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
      {/* Subtle ambient lighting */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/4 h-[500px] w-[500px] rounded-full bg-cyan-500/10 blur-[130px]" />
        <div className="absolute top-1/3 -right-40 h-[600px] w-[600px] rounded-full bg-indigo-500/10 blur-[150px]" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-5 py-8 sm:px-8">
        {/* Navigation Header */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-400/40 bg-gradient-to-br from-cyan-400/20 to-indigo-600/20 shadow-[0_0_20px_rgba(34,211,238,0.25)]">
              <span className="h-3 w-3 rounded-sm bg-cyan-300 shadow-[0_0_8px_#22d3ee]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-extrabold tracking-[0.2em] text-white">
                  DEEPTRACE
                </span>
                <span className="rounded bg-cyan-400/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-cyan-300">
                  AI v3.1
                </span>
              </div>
              <p className="text-xs text-slate-400">Explainable Media Forensics Platform</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
              <span>DeepGuard Online</span>
            </div>
            <div className="rounded-full border border-slate-800 bg-slate-900/60 px-3 py-1 text-xs text-slate-300">
              FFmpeg Sampling Ready
            </div>
          </div>
        </header>

        {/* Main Interface */}
        <main className="flex-1 py-10">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.15fr] lg:items-start">
            {/* Overview Column */}
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/5 px-3.5 py-1 text-xs font-semibold tracking-wider text-cyan-300">
                <span>DIGITAL VERIFICATION AUDIT</span>
              </div>
              <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-white sm:text-5xl sm:leading-[1.15]">
                Detect synthetic media.
                <br />
                <span className="bg-gradient-to-r from-cyan-300 via-indigo-300 to-slate-400 bg-clip-text text-transparent">
                  Inspect every signal.
                </span>
              </h1>
              <p className="mt-5 text-base leading-relaxed text-slate-300">
                Upload image or video media for real-time analysis using local DeepGuard neural networks and digital image forensics. DeepTrace exposes exact face confidence, compression error levels, and frame-by-frame timestamps.
              </p>

              {/* Sample Media Shortcuts */}
              {samples.length > 0 ? (
                <div className="mt-6 rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Quick Demo Samples
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Click any test file to load and analyse instantly:
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {samples.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => loadSample(s)}
                        disabled={isLoadingSample || isLoading}
                        className="rounded-lg border border-slate-700/80 bg-slate-800/60 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-cyan-400 hover:bg-cyan-500/10 hover:text-cyan-200 disabled:opacity-50"
                      >
                        {s.type === 'video' ? '🎥 ' : '🖼️ '}
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Core Methodology Cards */}
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <Metric label="Face Forensics" value="DeepGuard GCViT" note="Trained on FaceForensics++ benchmark." />
                <Metric label="Digital Forensics" value="ELA & Fourier" note="Spectral artifact analysis for full frames." />
                <Metric label="Verification" value="SHA-256" note="Bit-exact cryptographic intake record." />
              </div>
            </div>

            {/* Media Upload & Camera Control Column */}
            <section className="rounded-2xl border border-slate-800/90 bg-gradient-to-b from-slate-900/60 to-slate-950/80 p-6 shadow-2xl backdrop-blur-xl sm:p-7">
              <form onSubmit={handleSubmit}>
                {/* Drag and Drop Zone */}
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
                  className={`relative block rounded-xl border-2 border-dashed p-7 text-center transition ${
                    isDragging
                      ? 'border-cyan-400 bg-cyan-400/10 scale-[1.01]'
                      : file
                        ? 'border-cyan-500/50 bg-slate-950/60'
                        : 'border-slate-700/80 bg-slate-950/40 hover:border-slate-500 hover:bg-slate-900/40'
                  }`}
                >
                  <label htmlFor="media" className="cursor-pointer">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-cyan-300">
                      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </div>
                    <p className="mt-3 text-sm font-semibold text-slate-100">
                      {isDragging
                        ? 'Drop media here to inspect'
                        : file
                          ? file.name
                          : 'Choose file or drag & drop here'}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      JPG, PNG, WebP, MP4, MOV, MKV up to 50 MiB
                    </p>
                    {file ? (
                      <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-mono font-medium text-cyan-200">
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

                {/* Laptop System Camera Controls */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={isCameraOpen ? stopLaptopCamera : () => startLaptopCamera()}
                      className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-semibold transition ${
                        isCameraOpen
                          ? 'border-rose-500/50 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20'
                          : 'border-cyan-500/50 bg-cyan-950/40 text-cyan-200 hover:border-cyan-400 hover:bg-cyan-900/40'
                      }`}
                    >
                      <span className={`h-2 w-2 rounded-full ${isCameraOpen ? 'bg-rose-400 animate-pulse' : 'bg-cyan-400'}`} />
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      {isCameraOpen ? 'Close System Camera' : 'Use Laptop Camera'}
                    </button>

                    <label
                      className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-850/80 px-3.5 py-2.5 text-xs font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white"
                      title="Opens the device's native system camera app directly"
                    >
                      <svg className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span>OS Camera App</span>
                      <input
                        type="file"
                        accept="image/*,video/*"
                        capture="user"
                        className="sr-only"
                        onChange={(event) => {
                          stopLaptopCamera()
                          setCameraError('')
                          setFile(event.target.files?.[0] ?? null)
                          setResult(null)
                          setError('')
                        }}
                      />
                    </label>
                  </div>

                  {file ? (
                    <button
                      type="button"
                      onClick={() => {
                        setFile(null)
                        setResult(null)
                        setError('')
                      }}
                      className="text-xs text-slate-400 hover:text-rose-300"
                    >
                      Clear selected media
                    </button>
                  ) : null}
                </div>

                <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                  Directly captures from your laptop&apos;s integrated camera hardware (e.g. USB2.0 HD UVC / Built-in camera).
                </p>

                {cameraError ? (
                  <div className="mt-3 flex items-start justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs leading-relaxed text-rose-200">
                    <div className="flex items-start gap-2">
                      <span className="text-base leading-none">⚠️</span>
                      <div>
                        <p className="font-medium text-rose-200">{cameraError}</p>
                        <p className="mt-1 text-[11px] text-rose-300/80">
                          If you just enabled camera access in your browser bar, reload the page to apply the setting.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => window.location.reload()}
                      className="shrink-0 rounded-lg border border-rose-400/40 bg-rose-500/20 px-3 py-1.5 font-semibold text-rose-100 transition hover:bg-rose-500/30"
                    >
                      Reload Page
                    </button>
                  </div>
                ) : null}

                {/* Laptop Camera Live Preview & Control Modal */}
                {isCameraOpen ? (
                  <div className="mt-4 overflow-hidden rounded-2xl border border-cyan-500/30 bg-slate-950 p-4 shadow-2xl">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="relative flex h-2 w-2">
                          <span className={`absolute inline-flex h-full w-full rounded-full ${isCameraActive ? 'bg-emerald-400 animate-ping opacity-75' : 'bg-cyan-400'}`}></span>
                          <span className={`relative inline-flex h-2 w-2 rounded-full ${isCameraActive ? 'bg-emerald-500' : 'bg-cyan-500'}`}></span>
                        </span>
                        <span className="font-semibold text-slate-200">System Camera Live</span>
                        {streamResolution ? (
                          <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono text-emerald-300">
                            {streamResolution}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => startLaptopCamera(selectedDeviceId)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/80 px-2 py-1 text-[11px] text-cyan-300 transition hover:border-cyan-400 hover:text-cyan-200"
                          title="Reload stream connection"
                        >
                          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Reload
                        </button>
                        {videoDevices.length > 1 ? (
                          <select
                            value={selectedDeviceId}
                            onChange={(e) => handleDeviceSwitch(e.target.value)}
                            className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-200 focus:border-cyan-400 focus:outline-none"
                          >
                            {videoDevices.map((d, idx) => (
                              <option key={d.deviceId || idx} value={d.deviceId}>
                                {d.label ? (d.label.toLowerCase().includes('uvc') || d.label.toLowerCase().includes('integrated') ? `${d.label} [Built-in]` : d.label) : `Camera ${idx + 1}`}
                              </option>
                            ))}
                          </select>
                        ) : videoDevices.length === 1 && videoDevices[0].label ? (
                          <span className="max-w-[180px] truncate rounded bg-slate-800/80 px-2 py-0.5 text-[11px] font-mono text-cyan-300" title={videoDevices[0].label}>
                            {videoDevices[0].label}
                          </span>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => setIsMirrored(!isMirrored)}
                          className="rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-[11px] text-slate-300 transition hover:border-slate-500"
                        >
                          {isMirrored ? 'Mirrored' : 'Natural'}
                        </button>
                      </div>
                    </div>

                    <div className="relative mt-3 aspect-video w-full overflow-hidden rounded-xl bg-black">
                      <video
                        ref={(node) => {
                          cameraVideoRef.current = node
                          if (node && cameraStreamRef.current) {
                            attachStreamToVideo(node, cameraStreamRef.current)
                          }
                        }}
                        autoPlay
                        muted
                        playsInline
                        onLoadedMetadata={(e) => {
                          const v = e.currentTarget
                          v.play().catch(() => {})
                          if (v.videoWidth > 0 && v.videoHeight > 0) {
                            setStreamResolution(`${v.videoWidth}×${v.videoHeight}`)
                            setIsCameraActive(true)
                          }
                        }}
                        className={`h-full w-full object-cover transition-transform ${isMirrored ? '-scale-x-100' : ''}`}
                      />
                      {/* Face framing guideline overlay */}
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <div className="h-44 w-36 rounded-[50%] border-2 border-dashed border-cyan-400/60 shadow-[0_0_15px_rgba(34,211,238,0.3)]" />
                      </div>
                      <div className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 font-mono text-[10px] text-cyan-300">
                        Center face within oval
                      </div>
                      {isRecording ? (
                        <div className="absolute top-2 right-2 flex items-center gap-2 rounded border border-rose-500/50 bg-rose-950/80 px-2.5 py-1 font-mono text-xs text-rose-200">
                          <span className="h-2 w-2 animate-ping rounded-full bg-rose-500" />
                          <span>Recording: 0:0{recordingSeconds}s</span>
                        </div>
                      ) : null}
                    </div>

                    {/* Troubleshooting tip for physical camera slider */}
                    <div className="mt-2.5 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 p-2.5 text-[11px] leading-relaxed text-amber-200/90">
                      <span className="text-sm leading-none">💡</span>
                      <span>
                        <strong>Camera light is ON but screen is dark?</strong> Look at your laptop&apos;s screen bezel — many laptops have a physical privacy slider (shutter) covering the lens that slides left/right, or a keyboard shortcut (e.g. <code>Fn + F10</code>). Slide the shutter open to reveal the camera feed.
                      </span>
                    </div>

                    <div className="mt-3.5 flex flex-wrap gap-2.5">
                      {isRecording ? (
                        <button
                          type="button"
                          onClick={stopRecordingClip}
                          className="flex-1 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 py-2.5 text-xs font-bold text-slate-950 shadow-lg transition hover:opacity-95"
                        >
                          Stop & Analyze Video Clip ({recordingSeconds}s)
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={captureLaptopSnapshot}
                            className="flex-1 rounded-xl bg-gradient-to-r from-cyan-400 to-indigo-500 py-2.5 text-xs font-bold text-slate-950 shadow-lg transition hover:opacity-95"
                          >
                            Capture Photo Snapshot
                          </button>
                          <button
                            type="button"
                            onClick={startRecordingClip}
                            className="rounded-xl border border-indigo-400/40 bg-indigo-500/20 px-3.5 py-2.5 text-xs font-semibold text-indigo-200 transition hover:bg-indigo-500/30"
                          >
                            Record 3s Video Clip
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={stopLaptopCamera}
                        className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-700"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}

                {/* Video Aggregation Options */}
                {kind === 'video' ? (
                  <div className="mt-6 rounded-xl border border-slate-800/80 bg-slate-950/60 p-4">
                    <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                      Video Frame Aggregation Strategy
                    </label>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      {aggregationOptions.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setAggMode(opt.value)}
                          className={`rounded-lg border p-2.5 text-left transition ${
                            aggMode === opt.value
                              ? 'border-cyan-400 bg-cyan-400/10 text-cyan-200'
                              : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center justify-between text-xs font-bold">
                            <span>{opt.value.toUpperCase()}</span>
                            <span className="text-[10px] opacity-70">{opt.badge}</span>
                          </div>
                          <p className="mt-1 text-[11px] leading-tight text-slate-400">
                            {opt.label}
                          </p>
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-slate-500">
                      {selectedAggregation?.description}
                    </p>
                  </div>
                ) : null}

                {error ? (
                  <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs font-medium leading-relaxed text-rose-200">
                    <p className="font-semibold text-rose-100">Analysis Error</p>
                    <p className="mt-1">{error}</p>
                  </div>
                ) : null}

                {/* Submit Action Button */}
                <button
                  type="submit"
                  disabled={!file || !kind || isLoading}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 via-cyan-300 to-indigo-400 px-5 py-3.5 text-sm font-bold tracking-wide text-slate-950 shadow-[0_0_25px_rgba(34,211,238,0.3)] transition hover:opacity-95 hover:shadow-[0_0_35px_rgba(34,211,238,0.5)] disabled:cursor-not-allowed disabled:bg-none disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none"
                >
                  {isLoading ? (
                    <>
                      <svg className="h-4 w-4 animate-spin text-slate-950" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>Evaluating Neural Forensics…</span>
                    </>
                  ) : (
                    <span>Analyse Media Authenticity</span>
                  )}
                </button>
              </form>
            </section>
          </div>

          {/* Results Display */}
          {result ? (
            <div className="mt-12">
              <ResultView result={result} />
            </div>
          ) : (
            <div className="mt-12 rounded-2xl border border-slate-800/80 bg-slate-900/20 p-8 text-center text-slate-500">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-slate-800 bg-slate-900/60 text-slate-600">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="mt-3 text-sm font-medium text-slate-400">Ready for Media Review</p>
              <p className="mt-1 text-xs text-slate-500">
                Select an image, capture a photo, or choose one of the demo samples above to begin analysis.
              </p>
            </div>
          )}
        </main>

        {/* Footer */}
        <footer className="mt-16 border-t border-slate-800/80 pt-6 text-center text-xs leading-relaxed text-slate-500">
          DeepTrace AI Prototype • Preliminary media review only • Not a legally admissible chain of custody • DeepGuard neural classifier scores are uncalibrated signals for analyst review
        </footer>
      </div>
    </div>
  )
}
