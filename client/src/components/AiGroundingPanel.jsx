import React from 'react'

export function AiGroundingPanel({ result }) {
  const ai = result.ai_analysis
  const search = result.search_grounding || ai?.web_search
  if (!ai && !search) return null

  const isAuthentic = ai?.verdict === 'authentic'
  const isFake = ai?.verdict === 'deepfake_manipulated' || ai?.verdict === 'ai_generated'

  const borderGlow = isAuthentic
    ? 'border-emerald-500/40 shadow-[0_0_30px_rgba(16,185,129,0.12)]'
    : isFake
      ? 'border-rose-500/40 shadow-[0_0_30px_rgba(244,63,94,0.15)]'
      : 'border-cyan-500/30 shadow-[0_0_30px_rgba(34,211,238,0.12)]'

  const badgeBg = isAuthentic
    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-400/30'
    : isFake
      ? 'bg-rose-500/10 text-rose-300 border-rose-400/30'
      : 'bg-cyan-500/10 text-cyan-300 border-cyan-400/30'

  return (
    <div className="space-y-6">
      {/* Primary AI Grounding & Investigation Verdict */}
      <section className={`rounded-2xl border ${borderGlow} bg-gradient-to-b from-slate-900/90 to-slate-950/95 p-6 backdrop-blur-xl sm:p-7 transition-all`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-cyan-400 animate-ping" />
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-cyan-400">
                AI Multimodal & Web Grounding Verdict
              </p>
            </div>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-white">
              {ai?.headline || 'Multimodal AI Analysis Complete'}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-bold tracking-wide uppercase ${badgeBg}`}>
              <span className={`h-2 w-2 rounded-full ${isAuthentic ? 'bg-emerald-400' : isFake ? 'bg-rose-400' : 'bg-cyan-400'}`} />
              {isAuthentic ? 'Authentic Verified' : isFake ? 'Synthetic / Manipulated' : 'Evaluated'}
            </span>
            <span className="rounded-full border border-slate-700/80 bg-slate-800/60 px-3 py-1.5 text-xs font-mono text-slate-300">
              {ai?.ai_engine || 'AI Engine Active'}
            </span>
          </div>
        </div>

        {/* Identified Subject Highlight */}
        {ai?.identified_subject ? (
          <div className="mt-5 inline-flex items-center gap-2.5 rounded-xl border border-indigo-400/30 bg-indigo-500/10 px-4 py-2 text-sm font-semibold text-indigo-200">
            <svg className="h-4 w-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span>Identified Subject / Context: <strong className="text-white">{ai.identified_subject}</strong></span>
          </div>
        ) : null}

        {/* Detailed Explanation */}
        <div className="mt-5 rounded-xl border border-slate-800/80 bg-slate-900/60 p-5 leading-relaxed text-slate-300 text-sm">
          <p>{ai?.explanation || result.message}</p>
        </div>

        {/* Specific Forensic & Anatomical Indicators */}
        {ai?.forensic_indicators && ai.forensic_indicators.length > 0 ? (
          <div className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 mb-3">
              Key Diagnostic Observations
            </p>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {ai.forensic_indicators.map((indicator, idx) => (
                <div key={idx} className="flex items-start gap-2.5 rounded-xl border border-slate-800/60 bg-slate-950/70 p-3 text-xs leading-relaxed text-slate-300">
                  <span className="mt-0.5 text-cyan-400 font-bold">✓</span>
                  <span>{indicator}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {/* Live Web Search & Provenance Grounding Card */}
      {search ? (
        <section className="rounded-2xl border border-indigo-500/30 bg-gradient-to-b from-slate-900/60 to-slate-950/90 p-6 shadow-xl backdrop-blur-xl sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-indigo-400">
                  Live Web Search & Provenance Grounding
                </p>
              </div>
              <h3 className="mt-1.5 text-xl font-bold tracking-tight text-white">
                Web Sources & Fact Verification
              </h3>
            </div>

            <span className="rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-xs font-mono font-medium text-indigo-300">
              {search.provider || 'Live Search Grounding'}
            </span>
          </div>

          <p className="mt-3 text-sm text-slate-300 leading-relaxed">
            {search.summary || 'Searched indexed web archives and journalistic records to verify the origin and history of this media.'}
          </p>

          {/* Search Queries Executed */}
          {search.queries && search.queries.length > 0 ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Queries:</span>
              {search.queries.map((q, idx) => (
                <span key={idx} className="rounded-md border border-slate-700/60 bg-slate-800/50 px-2.5 py-1 font-mono text-[11px] text-slate-300">
                  "{q}"
                </span>
              ))}
            </div>
          ) : null}

          {/* Web Sources List */}
          {search.sources && search.sources.length > 0 ? (
            <div className="mt-5 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Discovered Sources & Archival Records ({search.sources.length})
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {search.sources.map((src, idx) => (
                  <a
                    key={idx}
                    href={src.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="group flex flex-col justify-between rounded-xl border border-slate-800/80 bg-slate-950/80 p-4 transition-all hover:border-cyan-400/50 hover:bg-slate-900/80"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-bold text-slate-200 group-hover:text-cyan-300">
                          {src.title}
                        </span>
                        <svg className="h-3.5 w-3.5 shrink-0 text-slate-500 group-hover:text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-400">
                        {src.snippet}
                      </p>
                    </div>
                    {src.domain ? (
                      <span className="mt-3 inline-block font-mono text-[10px] uppercase font-semibold text-cyan-400/80">
                        {src.domain}
                      </span>
                    ) : null}
                  </a>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-4 text-xs text-slate-500 italic">
              No previous matches found in public search indexing. This file may be an original, unreleased, or private capture.
            </p>
          )}

          {/* Reverse Search Shortcuts */}
          {search.reverse_search_tools && search.reverse_search_tools.length > 0 ? (
            <div className="mt-6 border-t border-slate-800/80 pt-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 mb-3">
                1-Click Reverse Image Search Tools
              </p>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {search.reverse_search_tools.map((tool, idx) => (
                  <a
                    key={idx}
                    href={tool.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex flex-col items-center justify-center rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-center transition hover:border-indigo-400/60 hover:bg-slate-900"
                  >
                    <span className="text-xs font-bold text-slate-200">{tool.name}</span>
                    <span className="mt-1 text-[10px] text-slate-400">{tool.badge}</span>
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
