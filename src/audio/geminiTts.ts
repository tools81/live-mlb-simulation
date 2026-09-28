import { GEMINI_API_BASE, GEMINI_TTS_MODEL, GEMINI_TTS_SAMPLE_RATE, GEMINI_TTS_STYLE, GEMINI_TTS_VOICE } from '../config/constants'

/** One chunk of raw 16-bit signed little-endian mono PCM. */
export interface PcmChunk {
  bytes: Uint8Array
  sampleRate: number
}

interface InteractionStreamEvent {
  event_type?: string
  delta?: { type?: string; data?: string; mime_type?: string; sample_rate?: number }
  error?: { message?: string }
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** Streaming responses are documented as headerless PCM, but tolerate a RIFF/WAV-wrapped chunk anyway by skipping to its `data` payload. */
function stripWavHeader(bytes: Uint8Array): Uint8Array {
  const isRiff = bytes.length >= 12 && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF'
  if (!isRiff) return bytes
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 12
  while (offset + 8 <= bytes.length) {
    const id = String.fromCharCode(...bytes.subarray(offset, offset + 4))
    const size = view.getUint32(offset + 4, true)
    if (id === 'data') return bytes.subarray(offset + 8, offset + 8 + size)
    offset += 8 + size + (size % 2)
  }
  return bytes
}

/**
 * Streams Gemini-TTS speech for `text` via the Interactions API's SSE stream, invoking `onChunk`
 * with each PCM chunk as it arrives. Resolves once the stream completes; rejects on HTTP/stream
 * errors or when `signal` aborts.
 */
export async function streamSpeech(
  text: string,
  apiKey: string,
  onChunk: (chunk: PcmChunk) => void,
  signal: AbortSignal,
): Promise<void> {
  const response = await fetch(`${GEMINI_API_BASE}/v1beta/interactions`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      model: GEMINI_TTS_MODEL,
      stream: true,
      input: [
        {
          type: 'user_input',
          content: [{ type: 'text', text, annotations: [{ type: 'speech_metadata', style: GEMINI_TTS_STYLE }] }],
        },
      ],
      response_format: { type: 'audio' },
      generation_config: { speech_config: [{ voice: GEMINI_TTS_VOICE }] },
    }),
  })
  if (!response.ok || !response.body) {
    throw new Error(`Gemini TTS request failed: ${response.status} ${await response.text().catch(() => '')}`)
  }

  const handleEvent = (data: string) => {
    if (!data || data === '[DONE]') return
    const event = JSON.parse(data) as InteractionStreamEvent
    if (event.event_type === 'error') throw new Error(`Gemini TTS stream error: ${event.error?.message ?? data}`)
    if (event.event_type !== 'step.delta' || event.delta?.type !== 'audio' || !event.delta.data) return
    onChunk({
      bytes: stripWavHeader(base64ToBytes(event.delta.data)),
      sampleRate: event.delta.sample_rate ?? GEMINI_TTS_SAMPLE_RATE,
    })
  }

  // Minimal SSE parser: an event's `data:` lines accumulate until a blank line dispatches it.
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  let dataLines: string[] = []
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += value
    let newline: number
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).replace(/\r$/, '')
      buffer = buffer.slice(newline + 1)
      if (line === '') {
        handleEvent(dataLines.join('\n'))
        dataLines = []
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart())
      }
    }
  }
  if (dataLines.length > 0) handleEvent(dataLines.join('\n'))
}
