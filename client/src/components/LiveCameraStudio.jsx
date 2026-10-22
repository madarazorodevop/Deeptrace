import React, { useState } from 'react'

export function LiveCameraStudio({
  isOpen,
  onClose,
  cameraVideoRef,
  cameraStream,
  isCameraActive,
  streamResolution,
  videoDevices,
  selectedDeviceId,
  onDeviceSwitch,
  onReloadCamera,
  isMirrored,
  onToggleMirror,
  onCaptureSnapshot,
  isRecording,
  recordingSeconds,
  onStartRecording,
  onStopRecording,
  cameraError,
}) {
  const [showGrid, setShowGrid] = useState(false)
  const [showFaceReticle, setShowFaceReticle] = useState(true)
  const [aspectRatio, setAspectRatio] = useState('aspect-video') // 'aspect-video' | 'aspect-[4/3]'

  if (!isOpen) return null

  return (
    <div className="relative mb-8 w-full overflow-hidden rounded-3xl border border-cyan-500/40 bg-gradient-to-b from-slate-900/90 via-slate-950 to-black p-5 shadow-[0_0_50px_rgba(34,211,238,0.15)] backdrop-blur-2xl transition-all">
      {/* Studio Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/40 bg-cyan-500/10 text-cyan-300 shadow-[0_0_15px_rgba(34,211,238,0.25)]">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-extrabold uppercase tracking-[0.2em] text-white">
                Live Studio Camera Feed
              </span>
              <span className="flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-mono font-bold text-emerald-300">
                <span className="h-1.5 w-1.5 animate-ping rounded-full bg-emerald-400" />
                ONLINE
              </span>
            </div>
            <p className="text-xs text-slate-400">Direct Hardware Ingestion • Zero Compression Frame Buffer</p>
          </div>
        </div>

        {/* Header Quick Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {streamResolution ? (
            <div className="rounded-lg border border-slate-800 bg-slate-900/80 px-2.5 py-1 text-xs font-mono text-cyan-300">
              {streamResolution} • 30 FPS
            </div>
          ) : null}

          {videoDevices.length > 1 ? (
            <select
              value={selectedDeviceId}
              onChange={(e) => onDeviceSwitch(e.target.value)}
              className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 focus:border-cyan-400 focus:outline-none"
            >
              {videoDevices.map((d, idx) => (
                <option key={d.deviceId || idx} value={d.deviceId}>
                  {d.label || `Camera ${idx + 1}`}
                </option>
              ))}
            </select>
          ) : null}

          <button
            type="button"
            onClick={onReloadCamera}
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-cyan-400 hover:text-white"
            title="Reload Video Stream"
          >
            <svg className="h-3.5 w-3.5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Reload
          </button>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-800 bg-slate-900 p-1.5 text-slate-400 transition hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-300"
            title="Minimize Studio"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Camera Hardware Notice / Errors */}
      {cameraError ? (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-200">
          <div className="flex items-center gap-2">
            <span className="text-base">⚠️</span>
            <span>{cameraError}</span>
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg bg-rose-500/20 px-3 py-1 font-bold text-rose-100 hover:bg-rose-500/30"
          >
            Reload Page
          </button>
        </div>
      ) : null}

      {/* MASSIVE IMMERSIVE CAMERA VIEWPORT */}
      <div className={`relative mt-4 w-full ${aspectRatio} min-h-[380px] sm:min-h-[480px] lg:min-h-[560px] overflow-hidden rounded-2xl border border-slate-800 bg-black shadow-inner`}>
        <video
          ref={cameraVideoRef}
          autoPlay
          muted
          playsInline
          className={`h-full w-full object-cover transition-transform duration-200 ${isMirrored ? '-scale-x-100' : ''}`}
        />

        {/* Scanline Animation Overlay */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-25">
          <div className="h-2 w-full bg-gradient-to-b from-transparent via-cyan-400 to-transparent animate-scanline" />
        </div>

        {/* Rule of Thirds Grid Overlay */}
        {showGrid ? (
          <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 border border-cyan-400/20">
            <div className="border-r border-b border-cyan-400/20" />
            <div className="border-r border-b border-cyan-400/20" />
            <div className="border-b border-cyan-400/20" />
            <div className="border-r border-b border-cyan-400/20" />
            <div className="border-r border-b border-cyan-400/20" />
            <div className="border-b border-cyan-400/20" />
            <div className="border-r border-cyan-400/20" />
            <div className="border-r border-cyan-400/20" />
            <div />
          </div>
        ) : null}

        {/* Biometric Face Reticle & Targeting HUD */}
        {showFaceReticle ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            {/* Corner Targeting Brackets */}
            <div className="relative h-64 w-52 sm:h-80 sm:w-64 animate-reticle">
              {/* Top-Left */}
              <div className="absolute top-0 left-0 h-6 w-6 border-t-2 border-l-2 border-cyan-400 shadow-[0_0_10px_#22d3ee]" />
              {/* Top-Right */}
              <div className="absolute top-0 right-0 h-6 w-6 border-t-2 border-r-2 border-cyan-400 shadow-[0_0_10px_#22d3ee]" />
              {/* Bottom-Left */}
              <div className="absolute bottom-0 left-0 h-6 w-6 border-b-2 border-l-2 border-cyan-400 shadow-[0_0_10px_#22d3ee]" />
              {/* Bottom-Right */}
              <div className="absolute bottom-0 right-0 h-6 w-6 border-b-2 border-r-2 border-cyan-400 shadow-[0_0_10px_#22d3ee]" />

              {/* Center Crosshair */}
              <div className="absolute inset-0 m-auto h-3 w-3 border-t border-b border-cyan-400/60" />
              <div className="absolute inset-0 m-auto h-3 w-3 border-l border-r border-cyan-400/60" />

              {/* Elliptical Head Alignment Guide */}
              <div className="h-full w-full rounded-[50%] border border-dashed border-cyan-400/50 shadow-[0_0_20px_rgba(34,211,238,0.2)]" />
            </div>
          </div>
        ) : null}

        {/* HUD Top Left: Telemetry */}
        <div className="absolute top-4 left-4 flex flex-col gap-1.5 rounded-xl bg-black/60 p-2.5 font-mono text-[11px] text-cyan-300 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-cyan-400" />
            <span className="font-bold">OPTICAL HUD v3</span>
          </div>
          <span className="text-slate-400">RESOLUTION: {streamResolution || 'Detecting...'}</span>
          <span className="text-slate-400">ORIENTATION: {isMirrored ? 'MIRRORED (FRONT)' : 'NATURAL'}</span>
        </div>

        {/* HUD Top Right: Recording Indicator */}
        {isRecording ? (
          <div className="absolute top-4 right-4 flex items-center gap-2.5 rounded-xl border border-rose-500/50 bg-rose-950/80 px-4 py-2 font-mono text-xs text-rose-200 shadow-[0_0_25px_rgba(244,63,94,0.4)] backdrop-blur-md">
            <span className="h-2.5 w-2.5 animate-ping rounded-full bg-rose-500" />
            <span className="font-extrabold uppercase tracking-widest text-rose-300">REC ● 0:0{recordingSeconds}s</span>
          </div>
        ) : (
          <div className="absolute top-4 right-4 rounded-xl bg-black/60 px-3 py-1.5 font-mono text-[11px] text-slate-300 backdrop-blur-md">
            STANDBY READY
          </div>
        )}

        {/* Bottom Left: Alignment Guideline Tip */}
        <div className="absolute bottom-4 left-4 rounded-xl bg-black/60 px-3.5 py-1.5 font-mono text-[11px] text-slate-300 backdrop-blur-md">
          Align facial features within the cyan reticle for optimal neural scoring
        </div>

        {/* Bottom Right Viewport Controls */}
        <div className="absolute bottom-4 right-4 flex items-center gap-2 rounded-xl bg-black/70 p-1.5 backdrop-blur-md">
          <button
            type="button"
            onClick={() => setShowFaceReticle(!showFaceReticle)}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
              showFaceReticle ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-white'
            }`}
          >
            Reticle
          </button>
          <button
            type="button"
            onClick={() => setShowGrid(!showGrid)}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
              showGrid ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-white'
            }`}
          >
            Grid
          </button>
          <button
            type="button"
            onClick={onToggleMirror}
            className="rounded-lg px-2.5 py-1 text-[11px] font-semibold text-slate-400 transition hover:text-white"
          >
            {isMirrored ? 'Flip Natural' : 'Flip Mirror'}
          </button>
        </div>
      </div>

      {/* Hardware Privacy Shutter Notice */}
      <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-2 text-xs text-amber-300/90">
        <span className="text-sm">💡</span>
        <span>
          <strong>Black feed?</strong> Check if your laptop has a physical sliding privacy shutter on the top screen bezel or a keyboard toggle (e.g., <code>Fn + F10</code>).
        </span>
      </div>

      {/* STUDIO CAPTURE ACTION BAR */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {isRecording ? (
          <button
            type="button"
            onClick={onStopRecording}
            className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-rose-500 to-amber-500 py-4 text-sm font-extrabold uppercase tracking-wider text-slate-950 shadow-xl transition hover:opacity-90 active:scale-[0.99]"
          >
            <span className="h-3 w-3 rounded-sm bg-slate-950" />
            Stop & Submit Video Clip ({recordingSeconds}s)
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={onCaptureSnapshot}
              className="flex-1 flex items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-cyan-400 via-teal-300 to-indigo-500 py-4 text-sm font-extrabold uppercase tracking-wider text-slate-950 shadow-[0_0_30px_rgba(34,211,238,0.3)] transition hover:opacity-95 hover:shadow-[0_0_40px_rgba(34,211,238,0.5)] active:scale-[0.99]"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Capture High-Resolution Photo Snapshot
            </button>

            <button
              type="button"
              onClick={onStartRecording}
              className="flex items-center gap-2 rounded-2xl border border-indigo-400/40 bg-indigo-500/20 px-6 py-4 text-sm font-bold uppercase tracking-wider text-indigo-200 transition hover:bg-indigo-500/30 active:scale-[0.99]"
            >
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500 animate-pulse" />
              Record 3s Video
            </button>
          </>
        )}
      </div>
    </div>
  )
}
