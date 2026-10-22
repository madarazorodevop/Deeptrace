import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  isSupportedUpload,
  mediaKind,
  mediaTypeFor,
  sha256File,
  sniffMedia,
} from '../../src/services/media.js'

test('media kinds are derived from extensions', () => {
  assert.equal(mediaKind('clip.MP4'), 'video')
  assert.equal(mediaKind('photo.jpeg'), 'image')
  assert.equal(mediaKind('voice.wav'), 'audio')
  assert.equal(mediaKind('notes.txt'), null)
})

test('media types and supported uploads are constrained', () => {
  assert.equal(mediaTypeFor('photo.png'), 'image/png')
  assert.equal(mediaTypeFor('voice.m4a'), 'audio/mp4')
  assert.equal(isSupportedUpload('photo.jpg', 'image/jpeg'), true)
  assert.equal(isSupportedUpload('photo.jpg', 'image/jpg'), true)
  assert.equal(isSupportedUpload('voice.wav', 'audio/x-wav'), true)
  assert.equal(isSupportedUpload('clip.mp4', 'video/mp4'), true)
  assert.equal(isSupportedUpload('photo.jpg', 'text/plain'), false)
  assert.equal(isSupportedUpload('voice.wav', 'video/mp4'), false)
  assert.equal(isSupportedUpload('notes.txt', 'text/plain'), false)
})

test('signatures identify supported media and reject unknown data', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'deeptrace-media-test-'))
  try {
    const jpegPath = path.join(directory, 'photo.jpg')
    const wavPath = path.join(directory, 'voice.wav')
    const mp4Path = path.join(directory, 'clip.mp4')
    const badPath = path.join(directory, 'bad.bin')

    await writeFile(jpegPath, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]))
    await writeFile(
      wavPath,
      Buffer.concat([
        Buffer.from('RIFF'),
        Buffer.alloc(4),
        Buffer.from('WAVEfmt '),
      ]),
    )
    await writeFile(
      mp4Path,
      Buffer.concat([
        Buffer.from([0x00, 0x00, 0x00, 0x18]),
        Buffer.from('ftypisom'),
      ]),
    )
    await writeFile(badPath, Buffer.from('not media'))

    assert.equal(await sniffMedia(jpegPath), 'image/jpeg')
    assert.equal(await sniffMedia(wavPath, 'audio'), 'audio/wav')
    assert.equal(await sniffMedia(mp4Path, 'video'), 'video/mp4')
    assert.equal(await sniffMedia(mp4Path, 'audio'), 'audio/mp4')
    assert.equal(await sniffMedia(badPath), null)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('sha256 hashes the exact bytes', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'deeptrace-hash-test-'))
  try {
    const filePath = path.join(directory, 'value.txt')
    await writeFile(filePath, 'abc')
    assert.equal(
      await sha256File(filePath),
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
