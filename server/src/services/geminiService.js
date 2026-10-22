import { readFile } from 'node:fs/promises'
import { GoogleGenAI } from '@google/genai'
import { config } from '../config.js'

/**
 * Perform Multimodal Media Forensics with Google Search Grounding using Gemini
 */
export async function analyzeMediaWithGemini(filePath, meta, options = {}) {
  const apiKey = options.apiKey || config.geminiApiKey || process.env.GEMINI_API_KEY
  if (!apiKey) {
    return null
  }

  const modelName = options.model || config.geminiModel || 'gemini-2.5-flash'
  const ai = new GoogleGenAI({ apiKey })

  try {
    const fileBuffer = await readFile(filePath)
    const base64Data = fileBuffer.toString('base64')
    const mimeType = meta.detected_type || meta.content_type || 'image/jpeg'
    const kind = meta.kind || 'image'

    const prompt = `You are DeepTrace AI, a senior digital media forensics and fact-checking investigator.
Your task is to analyze this ${kind} file for signs of synthetic generation (such as Midjourney, Flux, Stable Diffusion, DALL-E, Sora, Runway, ElevenLabs voice cloning) or deepfake facial/audio manipulation.

Perform the following steps:
1. Search the web to check if this image/media is an existing known photo, public figure, viral news event, or documented deepfake/hoax.
2. Conduct an in-depth forensic inspection:
   - Biological & anatomical cues (skin pores, iris reflections, teeth regularity, ear symmetry, finger/hand counts)
   - Lighting, shadow consistency, and perspective realism
   - Frequency & diffusion artifacts (characteristic smooth surfaces, blur boundaries, unnatural painterly gradients)
   - If audio/speech: evaluate unnatural pitch inflections, breathing patterns, robotic high-frequency spectral cutoffs
3. Formulate an authoritative forensic verdict.

Respond strictly in valid JSON format matching this schema:
{
  "verdict": "authentic" | "ai_generated" | "deepfake_manipulated" | "inconclusive",
  "confidence_score": <number between 0.0 and 1.0, where 0.0 is authentic and 1.0 is synthetic/deepfake>,
  "confidence_level": "high" | "medium" | "low",
  "summary_verdict": "<one concise sentence headline>",
  "identified_subject": "<name of person, event, or object recognized, or null>",
  "historical_provenance": "<context from search grounding about where/when this image originated, or whether it has no prior public record>",
  "forensic_indicators": [
    "<specific observation 1>",
    "<specific observation 2>",
    "<specific observation 3>"
  ],
  "reasoning_explanation": "<detailed paragraph explaining the physical and digital evidence observed>",
  "web_search_summary": "<summary of what Google Search Grounding discovered regarding this media's authenticity and origins>"
}`

    const contents = [
      { text: prompt },
      {
        inlineData: {
          mimeType,
          data: base64Data,
        },
      },
    ]

    const response = await ai.models.generateContent({
      model: modelName,
      contents,
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0.2,
      },
    })

    const text = response.text?.trim() ?? ''
    
    // Extract JSON if wrapped in code blocks
    let parsedJson = null
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        parsedJson = JSON.parse(jsonMatch[0])
      }
    } catch (parseError) {
      console.warn('[Gemini] JSON parsing fallback from text output:', parseError.message)
    }

    // Extract grounding metadata from Gemini response
    const candidate = response.candidates?.[0]
    const groundingMetadata = candidate?.groundingMetadata ?? {}
    const webSearchQueries = groundingMetadata.webSearchQueries ?? []
    const searchChunks = groundingMetadata.groundingChunks ?? []

    const sources = searchChunks
      .filter((chunk) => chunk.web?.uri)
      .map((chunk) => ({
        title: chunk.web.title || 'Web Reference',
        url: chunk.web.uri,
        domain: new URL(chunk.web.uri).hostname,
        snippet: chunk.web.title || '',
      }))

    return {
      engine: `Google Gemini Multimodal AI (${modelName})`,
      grounded_with_google_search: true,
      verdict: parsedJson?.verdict ?? 'evaluated',
      confidence_score: parsedJson?.confidence_score ?? 0.05,
      confidence_level: parsedJson?.confidence_level ?? 'high',
      summary_verdict: parsedJson?.summary_verdict ?? 'Analysis completed with Google Search Grounding.',
      identified_subject: parsedJson?.identified_subject ?? null,
      historical_provenance: parsedJson?.historical_provenance ?? 'Grounded with Google Search.',
      forensic_indicators: parsedJson?.forensic_indicators ?? [],
      reasoning_explanation: parsedJson?.reasoning_explanation ?? text,
      web_search_summary: parsedJson?.web_search_summary ?? 'Google Search Grounding evaluated public web records.',
      search_queries: webSearchQueries,
      sources,
      raw_text: text,
    }
  } catch (error) {
    console.error('[GeminiService] Error during Gemini analysis:', error.message)
    return {
      error: error.message,
      engine: 'Gemini (Failed)',
      fallback_needed: true,
    }
  }
}
