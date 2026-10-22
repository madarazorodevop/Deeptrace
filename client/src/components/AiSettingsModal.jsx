import React, { useState } from 'react'

export function AiSettingsModal({ isOpen, onClose, apiKey, onSaveApiKey }) {
  if (!isOpen) return null

  const [inputKey, setInputKey] = useState(apiKey || '')
  const [showKey, setShowKey] = useState(false)
  const [savedSuccess, setSavedSuccess] = useState(false)

  const handleSave = (e) => {
    e.preventDefault()
    onSaveApiKey(inputKey.trim())
    setSavedSuccess(true)
    setTimeout(() => {
      setSavedSuccess(false)
      onClose()
    }, 1000)
  }

  const handleClear = () => {
    setInputKey('')
    onSaveApiKey('')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-700/80 bg-slate-900 p-6 shadow-2xl sm:p-7">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-400/20 text-cyan-300">
              ⚡
            </div>
            <div>
              <h3 className="text-base font-bold text-white">AI Engine & Search Configuration</h3>
              <p className="text-xs text-slate-400">Configure Multimodal AI & Google Search Grounding</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSave} className="mt-5 space-y-5">
          {/* Active Status */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Current AI Operating Mode</p>
            <div className="mt-2 flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              <span className="text-sm font-semibold text-white">
                {apiKey ? 'Google Gemini 2.5 Flash + Google Search Grounding' : 'Autonomous AI + Live DuckDuckGo Web Grounding'}
              </span>
            </div>
            <p className="mt-1.5 text-xs text-slate-400">
              {apiKey
                ? 'Your Gemini API key is active. Media is evaluated with Gemini multimodal vision and grounded directly using Google Search.'
                : 'Running out of the box with built-in digital forensics and live web search grounding. No API key required!'}
            </p>
          </div>

          {/* Gemini Key Input */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
              Google Gemini API Key (Optional)
            </label>
            <p className="mt-1 text-xs text-slate-400">
              Enter your Google AI Studio API key to activate Gemini 2.5 Flash with official Google Search Grounding.
            </p>

            <div className="mt-2.5 relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={inputKey}
                onChange={(e) => setInputKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 font-mono text-sm text-white placeholder-slate-600 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-2.5 text-xs font-semibold text-slate-400 hover:text-slate-200"
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>

            <div className="mt-2 flex items-center justify-between text-xs">
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer noopener"
                className="text-cyan-400 hover:underline"
              >
                → Get a free Gemini API key at Google AI Studio
              </a>
              {inputKey ? (
                <button
                  type="button"
                  onClick={handleClear}
                  className="text-rose-400 hover:underline"
                >
                  Clear Key
                </button>
              ) : null}
            </div>
          </div>

          {/* Save Buttons */}
          <div className="flex items-center justify-end gap-3 border-t border-slate-800 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 px-5 py-2 text-xs font-bold text-white shadow-lg shadow-cyan-500/20 hover:from-cyan-400 hover:to-indigo-500"
            >
              {savedSuccess ? 'Saved! ✓' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
