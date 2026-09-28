import { afterEach, describe, expect, it, vi } from 'vitest'
import { streamSpeech, type PcmChunk } from '../geminiTts'

function sseResponse(parts: string[]): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part))
      controller.close()
    },
  })
  return new Response(body, { status: 200 })
}

function audioEvent(bytes: number[], extra: Record<string, unknown> = {}): string {
  const data = btoa(String.fromCharCode(...bytes))
  return `data: ${JSON.stringify({ event_type: 'step.delta', delta: { type: 'audio', data, ...extra } })}\n\n`
}

describe('streamSpeech', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends the Schedar voice and decodes audio deltas split across network reads', async () => {
    const event = audioEvent([1, 2, 3, 4], { sample_rate: 22050 })
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([
        'data: {"event_type":"interaction.created"}\n\n',
        event.slice(0, 10),
        event.slice(10),
        audioEvent([5, 6]),
        'data: {"event_type":"interaction.completed"}\n\n',
      ]),
    )
    vi.stubGlobal('fetch', fetchMock)

    const chunks: PcmChunk[] = []
    await streamSpeech('Judge homers to left.', 'key', (chunk) => chunks.push(chunk), new AbortController().signal)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/v1beta/interactions')
    expect(init.headers['x-goog-api-key']).toBe('key')
    const body = JSON.parse(init.body)
    expect(body.stream).toBe(true)
    expect(body.generation_config.speech_config[0].voice).toBe('Schedar')
    expect(body.input[0].content[0].text).toBe('Judge homers to left.')

    expect(chunks.map((c) => [...c.bytes])).toEqual([[1, 2, 3, 4], [5, 6]])
    expect(chunks.map((c) => c.sampleRate)).toEqual([22050, 24000])
  })

  it('strips a WAV header if a chunk arrives RIFF-wrapped', async () => {
    const header = [...'RIFF'].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0], [...'WAVE'].map((c) => c.charCodeAt(0)))
    const dataChunk = [...'data'].map((c) => c.charCodeAt(0)).concat([2, 0, 0, 0], [9, 8])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([audioEvent([...header, ...dataChunk])])))

    const chunks: PcmChunk[] = []
    await streamSpeech('x', 'key', (chunk) => chunks.push(chunk), new AbortController().signal)
    expect(chunks.map((c) => [...c.bytes])).toEqual([[9, 8]])
  })

  it('rejects on HTTP errors and stream error events', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad key', { status: 403 })))
    await expect(streamSpeech('x', 'key', () => {}, new AbortController().signal)).rejects.toThrow(/403/)

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(sseResponse(['data: {"event_type":"error","error":{"message":"quota"}}\n\n'])),
    )
    await expect(streamSpeech('x', 'key', () => {}, new AbortController().signal)).rejects.toThrow(/quota/)
  })
})
