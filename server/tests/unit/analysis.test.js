import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  aggregateFakeScores,
  aggregationDescription,
  analyzeMedia,
} from '../../src/services/analysis.js'

test('mean aggregation averages every score', () => {
  const result = aggregateFakeScores([0.1, 0.2, 0.9], 'mean')
  assert.equal(result.branch, 'all_frames')
  assert.ok(Math.abs(result.score - 0.4) < 1e-12)
})

test('vote aggregation reports the share above 0.5', () => {
  const result = aggregateFakeScores([0.1, 0.6, 0.9, 0.4], 'vote')
  assert.equal(result.branch, 'vote_share')
  assert.equal(result.score, 0.5)
})

test('conf aggregation selects the strong-fake subset', () => {
  const result = aggregateFakeScores([0.1, 0.85, 0.9, 0.95], 'conf')
  assert.equal(result.branch, 'strong_fake_subset')
  assert.ok(Math.abs(result.score - 0.9) < 1e-12)
})

test('conf aggregation selects the strong-real subset', () => {
  const result = aggregateFakeScores(new Array(10).fill(0.1), 'conf')
  assert.equal(result.branch, 'strong_real_subset')
  assert.ok(Math.abs(result.score - 0.1) < 1e-12)
})

test('conf aggregation falls back to all frames in ambiguous cases', () => {
  const result = aggregateFakeScores([0.1, 0.3, 0.6, 0.9], 'conf')
  assert.equal(result.branch, 'all_frames')
  assert.ok(Math.abs(result.score - 0.475) < 1e-12)
})

test('empty score lists are rejected', () => {
  assert.throws(() => aggregateFakeScores([], 'conf'))
})

test('aggregation descriptions document all modes', () => {
  assert.match(aggregationDescription('conf'), /heuristic/)
  assert.match(aggregationDescription('mean'), /Arithmetic mean/)
  assert.match(aggregationDescription('vote'), /above 0\.5/)
})

test('audio-only media returns an explicit incomplete result', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'deeptrace-audio-test-'))
  try {
    const filePath = path.join(directory, 'voice.wav')
    const bytes = Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.alloc(4),
      Buffer.from('WAVEfmt '),
    ])
    await writeFile(filePath, bytes)

    const result = await analyzeMedia(
      {
        path: filePath,
        originalname: 'voice.wav',
        size: bytes.length,
        mimetype: 'audio/wav',
      },
      'conf',
    )

    assert.equal(result.status, 'inconclusive')
    assert.equal(result.reason, 'no_audio_detector')
    assert.equal(result.result, null)
    assert.equal(result.message, 'No audio detector configured — analysis incomplete')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
