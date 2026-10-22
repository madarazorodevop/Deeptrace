import React, { useState } from 'react'

function decodeHtmlEntities(str) {
  if (!str) return ''
  return str
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
}

function cleanDomainName(rawDomain, rawUrl) {
  if (rawDomain) {
    return rawDomain.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
  }
  try {
    const parsed = new URL(rawUrl)
    return parsed.hostname.replace(/^www\./, '')
  } catch {
    return 'source'
  }
}

function SourceFavicon({ domain, name }) {
  const [hasError, setHasError] = useState(false)
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`

  if (hasError || !domain) {
    return (
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-400/30 bg-gradient-to-br from-cyan-500/20 to-indigo-600/30 text-sm font-bold text-cyan-300 shadow-inner">
        {name?.charAt(0) || domain?.charAt(0) || '🌐'}
      </div>
    )
  }

  return (
    <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-700/80 bg-slate-900/90 p-2 shadow-inner transition-transform duration-200 group-hover:scale-105 group-hover:border-cyan-400/50">
      <img
        src={faviconUrl}
        alt={name || domain}
        onError={() => setHasError(true)}
        className="h-full w-full object-contain rounded-lg"
        loading="lazy"
      />
    </div>
  )
}

function ReverseToolLogo({ name }) {
  const [hasError, setHasError] = useState(false)
  const key = (name || '').toLowerCase().trim()

  const toolConfig = {
    'google lens': {
      domain: 'lens.google.com',
      fallback: (
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="18" height="18" rx="5" stroke="#4285F4" strokeWidth="2" />
          <circle cx="12" cy="12" r="4" stroke="#EA4335" strokeWidth="2" />
          <circle cx="16" cy="8" r="1.5" fill="#FBBC05" />
          <path d="M7 16a5 5 0 0 0 6 0" stroke="#34A853" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ),
    },
    'tineye': {
      domain: 'tineye.com',
      fallback: (
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none">
          <rect x="4" y="6" width="16" height="13" rx="3.5" fill="#00BCD4" fillOpacity="0.2" stroke="#00BCD4" strokeWidth="2" />
          <circle cx="9" cy="12" r="2.2" fill="#00BCD4" />
          <circle cx="15" cy="12" r="2.2" fill="#00BCD4" />
          <circle cx="9" cy="11.5" r="0.9" fill="#fff" />
          <circle cx="15" cy="11.5" r="0.9" fill="#fff" />
          <path d="M12 2v4M8 16.5h8" stroke="#00BCD4" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ),
    },
    'bing visual search': {
      domain: 'bing.com',
      fallback: (
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none">
          <path d="M5 4l5 2v11l-5-3V4z" fill="#008373" />
          <path d="M10 6l9 4-4 2-5-2V6z" fill="#00A4EF" />
          <path d="M10 17l4-2 5 3-9 2v-3z" fill="#28C8A8" />
        </svg>
      ),
    },
    'yandex images': {
      domain: 'yandex.com',
      fallback: (
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[#fc3f1d] text-white font-black text-xs shadow-sm">
          Я
        </div>
      ),
    },
  }

  const match = toolConfig[key] || {
    domain: '',
    fallback: <span className="text-lg">🔍</span>,
  }

  const faviconUrl = match.domain ? `https://www.google.com/s2/favicons?domain=${match.domain}&sz=128` : null

  if (hasError || !faviconUrl) {
    return (
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-700/80 bg-slate-900 shadow-inner">
        {match.fallback}
      </div>
    )
  }

  return (
    <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-700/80 bg-slate-900/90 p-2 shadow-inner transition-transform duration-200 group-hover:scale-110">
      <img
        src={faviconUrl}
        alt={name}
        onError={() => setHasError(true)}
        className="h-full w-full object-contain rounded-md"
        loading="lazy"
      />
    </div>
  )
}

export function AiGroundingPanel({ result }) {
  const ai = result.ai_analysis
  const search = result.search_grounding || ai?.web_search
  if (!ai && !search) return null

  const isAuthentic = ai?.verdict === 'authentic'
  const isFake =
    ai?.verdict === 'deepfake_manipulated' || ai?.verdict === 'ai_generated'

  const borderGlow = isAuthentic
    ? 'border-emerald-500/40 shadow-[0_0_35px_rgba(16,185,129,0.15)]'
    : isFake
      ? 'border-rose-500/40 shadow-[0_0_35px_rgba(244,63,94,0.18)]'
      : 'border-cyan-500/30 shadow-[0_0_35px_rgba(34,211,238,0.12)]'

  const badgeBg = isAuthentic
    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-400/30'
    : isFake
      ? 'bg-rose-500/10 text-rose-300 border-rose-400/30'
      : 'bg-cyan-500/10 text-cyan-300 border-cyan-400/30'

  // Clean title & subject from repetitive text
  let rawHeadline = ai?.headline || 'Multimodal AI Analysis Complete'
  let displayTitle = rawHeadline
  let contextSubject = ai?.identified_subject || null

  if (rawHeadline.includes(':')) {
    const parts = rawHeadline.split(':')
    displayTitle = parts[0].trim()
    if (!contextSubject && parts[1]) {
      contextSubject = parts[1].replace(/\.$/, '').trim()
    }
  }

  // Clean explanation so it doesn't repeat the headline
  let cleanExplanation = ai?.explanation || result.message || ''
  if (ai?.headline && cleanExplanation.startsWith(ai.headline)) {
    cleanExplanation = cleanExplanation.slice(ai.headline.length).trim()
  } else if (
    displayTitle &&
    cleanExplanation.toLowerCase().startsWith(displayTitle.toLowerCase())
  ) {
    cleanExplanation = cleanExplanation
      .replace(new RegExp(`^${displayTitle}[:.]?\\s*`, 'i'), '')
      .trim()
  }
  if (!cleanExplanation) {
    cleanExplanation = ai?.explanation || result.message
  }

  return (
    <div className="space-y-6">
      {/* Primary AI Grounding & Investigation Verdict */}
      <section
        className={`relative overflow-hidden rounded-3xl border ${borderGlow} bg-gradient-to-b from-slate-900/95 via-slate-950/95 to-slate-950 p-6 backdrop-blur-2xl sm:p-8 transition-all duration-300`}
      >
        {/* Subtle luminous ambient aura */}
        <div
          className={`pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full blur-3xl opacity-15 ${
            isAuthentic
              ? 'bg-emerald-400'
              : isFake
                ? 'bg-rose-500'
                : 'bg-cyan-400'
          }`}
        />
        <div
          className={`pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full blur-3xl opacity-10 ${
            isAuthentic
              ? 'bg-cyan-400'
              : isFake
                ? 'bg-amber-500'
                : 'bg-indigo-500'
          }`}
        />

        {/* Top Header Row */}
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    isAuthentic
                      ? 'bg-emerald-400'
                      : isFake
                        ? 'bg-rose-400'
                        : 'bg-cyan-400'
                  }`}
                />
                <span
                  className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                    isAuthentic
                      ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                      : isFake
                        ? 'bg-rose-400 shadow-[0_0_8px_#fb7185]'
                        : 'bg-cyan-400 shadow-[0_0_8px_#22d3ee]'
                  }`}
                />
              </span>
              <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-cyan-400/90">
                AI Forensic Verdict
              </p>
            </div>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">
              {displayTitle}
            </h2>
          </div>

          {/* Badges Bar: Verdict + Engine + Subject */}
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold tracking-wide uppercase ${badgeBg} shadow-sm`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isAuthentic
                    ? 'bg-emerald-400'
                    : isFake
                      ? 'bg-rose-400'
                      : 'bg-cyan-400'
                }`}
              />
              {isAuthentic
                ? 'Authentic Verified'
                : isFake
                  ? 'Synthetic / Manipulated'
                  : 'Evaluated'}
            </span>

            <span className="rounded-full border border-slate-800 bg-slate-900/90 px-3 py-1 text-xs font-medium text-slate-300">
              {ai?.ai_engine
                ? ai.ai_engine.replace(
                    'DeepTrace Autonomous AI + Web Search Grounding',
                    'DeepTrace AI • Web Grounded'
                  )
                : 'DeepTrace Vision AI'}
            </span>

            {contextSubject && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-400/40 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-200">
                <svg
                  className="h-3.5 w-3.5 text-indigo-400 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
                <span className="max-w-[240px] truncate">{contextSubject}</span>
              </span>
            )}
          </div>
        </div>

        {/* Clear Concise Summary Block with subtle accent highlight */}
        <div className="relative mt-5 rounded-2xl border border-slate-800/80 bg-slate-950/60 p-4 sm:p-5 border-l-4 border-l-cyan-400 shadow-inner">
          <p className="text-sm font-medium leading-relaxed text-slate-200">
            {cleanExplanation}
          </p>
        </div>

        {/* Key Diagnostic Observations: Interactive Cyber Micro-Cards */}
        {ai?.forensic_indicators && ai.forensic_indicators.length > 0 ? (
          <div className="relative mt-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-3 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
              Key Diagnostic Observations
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {ai.forensic_indicators.map((indicator, idx) => (
                <div
                  key={idx}
                  className="group relative flex items-start gap-3 rounded-2xl border border-slate-800/90 bg-slate-950/70 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-400/50 hover:bg-slate-900/80 hover:shadow-[0_4px_20px_rgba(34,211,238,0.12)]"
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-400/30 text-emerald-400 text-xs font-bold shadow-[0_0_8px_rgba(16,185,129,0.25)]">
                    ✓
                  </div>
                  <p className="text-xs font-medium leading-relaxed text-slate-300 transition-colors group-hover:text-slate-100">
                    {indicator}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {/* Sources Section */}
      {search ? (
        <section className="rounded-2xl border border-slate-800/90 bg-gradient-to-b from-slate-900/70 to-slate-950/90 p-6 shadow-xl backdrop-blur-xl sm:p-7">
          {/* Clean Header: Just "Sources" */}
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-400/40 bg-gradient-to-br from-cyan-400/20 to-indigo-600/30 text-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.2)]">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                </svg>
              </div>
              <h3 className="text-2xl font-black tracking-tight text-white">Sources</h3>
              {search.sources && search.sources.length > 0 ? (
                <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-0.5 font-mono text-xs font-bold text-cyan-300">
                  {search.sources.length}
                </span>
              ) : null}
            </div>

            {search.provider ? (
              <span className="rounded-full border border-slate-700/80 bg-slate-800/60 px-3 py-1 font-mono text-xs font-semibold text-slate-300">
                {search.provider}
              </span>
            ) : null}
          </div>

          {/* Source Cards: Logo on top, Name in below in a cool style */}
          {search.sources && search.sources.length > 0 ? (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {search.sources.map((src, idx) => {
                const domain = cleanDomainName(src.domain, src.url)
                const cleanName = decodeHtmlEntities(src.title || domain)

                return (
                  <a
                    key={idx}
                    href={src.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="group relative flex flex-col justify-between rounded-2xl border border-slate-800/90 bg-slate-950/70 p-5 transition-all duration-200 hover:-translate-y-1 hover:border-cyan-400/60 hover:bg-slate-900/80 hover:shadow-[0_10px_25px_rgba(34,211,238,0.14)]"
                  >
                    {/* Top Row: Logo & External Link Arrow */}
                    <div className="flex items-start justify-between">
                      <SourceFavicon domain={domain} name={cleanName} />
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-500 transition-colors group-hover:border-cyan-400/40 group-hover:bg-cyan-500/10 group-hover:text-cyan-300">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </span>
                    </div>

                    {/* Bottom: Name in below & Domain Badge */}
                    <div className="mt-4">
                      <h4 className="text-sm font-bold leading-snug text-slate-100 transition-colors group-hover:text-cyan-200 line-clamp-2">
                        {cleanName}
                      </h4>
                      <div className="mt-2.5 flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_#22d3ee]" />
                        <span className="font-mono text-xs font-semibold text-cyan-400/90 truncate">
                          {domain}
                        </span>
                      </div>
                    </div>
                  </a>
                )
              })}
            </div>
          ) : (
            <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950/60 p-6 text-center">
              <p className="text-xs text-slate-400">
                No matching public records found. Media may be original or unreleased.
              </p>
            </div>
          )}

          {/* 1-Click Reverse Search Portals: Logo on top, Name below, each unique */}
          {search.reverse_search_tools && search.reverse_search_tools.length > 0 ? (
            <div className="mt-8 border-t border-slate-800/80 pt-5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3.5">
                1-Click Reverse Search
              </p>
              <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
                {search.reverse_search_tools.map((tool, idx) => {
                  const key = (tool.name || '').toLowerCase().trim()
                  let hoverStyle = 'hover:border-cyan-400/60 hover:shadow-[0_8px_22px_rgba(34,211,238,0.15)]'
                  if (key.includes('google')) {
                    hoverStyle = 'hover:border-[#4285F4]/60 hover:shadow-[0_8px_22px_rgba(66,133,244,0.18)]'
                  } else if (key.includes('tineye')) {
                    hoverStyle = 'hover:border-[#00bcd4]/60 hover:shadow-[0_8px_22px_rgba(0,188,212,0.18)]'
                  } else if (key.includes('bing')) {
                    hoverStyle = 'hover:border-[#008373]/60 hover:shadow-[0_8px_22px_rgba(0,131,115,0.18)]'
                  } else if (key.includes('yandex')) {
                    hoverStyle = 'hover:border-[#fc3f1d]/60 hover:shadow-[0_8px_22px_rgba(252,63,29,0.18)]'
                  }

                  return (
                    <a
                      key={idx}
                      href={tool.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className={`group relative flex flex-col items-center justify-center rounded-2xl border border-slate-800/90 bg-slate-950/70 p-4 text-center transition-all duration-200 hover:-translate-y-1 hover:bg-slate-900/80 ${hoverStyle}`}
                    >
                      <span className="absolute top-2.5 right-2.5 text-slate-600 transition-colors group-hover:text-cyan-300">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </span>

                      {/* Distinctive Logo */}
                      <ReverseToolLogo name={tool.name} />

                      {/* Name below */}
                      <span className="mt-3 text-xs font-bold text-slate-100 transition-colors group-hover:text-white">
                        {tool.name}
                      </span>
                    </a>
                  )
                })}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
