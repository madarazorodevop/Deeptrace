const principles = [
  {
    title: 'Observation',
    body: 'What a tool or file property actually returned.',
  },
  {
    title: 'Interpretation',
    body: 'Explanation kept separate from the underlying output.',
  },
  {
    title: 'Integrity',
    body: 'SHA-256 records byte integrity, not authorship.',
  },
]

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-8 sm:px-10">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg border border-cyan-400/30 bg-cyan-400/10">
              <span className="h-2.5 w-2.5 rounded-sm bg-cyan-300" />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-[0.18em] text-slate-100">
                DEEPTRACE AI
              </p>
              <p className="text-xs text-slate-500">Media forensics workspace</p>
            </div>
          </div>
          <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-400">
            Phase 0
          </span>
        </header>

        <main className="flex flex-1 items-center py-16">
          <div className="max-w-3xl">
            <p className="mb-5 text-xs font-medium uppercase tracking-[0.25em] text-cyan-300/80">
              Explainable media review
            </p>
            <h1 className="text-5xl font-semibold leading-tight tracking-tight sm:text-6xl">
              Detect suspicious indicators.
              <br />
              <span className="text-slate-400">
                Preserve the evidence. Explain the limits.
              </span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-400">
              DeepTrace AI organizes tool outputs, file properties, timestamps, and
              integrity records so a human reviewer can examine media responsibly.
            </p>

            <div className="mt-8 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4">
              <p className="text-sm leading-relaxed text-amber-100/90">
                Preliminary review tool. Not a substitute for qualified forensic
                examination.
              </p>
            </div>

            <div className="mt-10 grid gap-3 sm:grid-cols-3">
              {principles.map((item) => (
                <div
                  key={item.title}
                  className="rounded-lg border border-slate-800 bg-slate-900/40 p-4"
                >
                  <p className="text-sm font-medium text-slate-200">{item.title}</p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>

            <p className="mt-8 text-sm text-slate-500">
              No media has been analyzed. Detection and reporting are not yet
              connected.
            </p>
          </div>
        </main>

        <footer className="border-t border-slate-800/80 pt-5 text-xs leading-relaxed text-slate-500">
          Prototype audit log. Not a legally admissible chain of custody. Media
          analysis is not enabled in this phase.
        </footer>
      </div>
    </div>
  )
}
