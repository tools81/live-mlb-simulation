import { NARRATION_WATCHDOG_MS } from '../config/constants'
import { streamSpeech, type PcmChunk } from './geminiTts'

// One AudioContext for the whole app (not one per game page) -- browsers cap how many can be open.
let sharedContext: AudioContext | null = null
function getAudioContext(): AudioContext {
  sharedContext ??= new AudioContext()
  return sharedContext
}

/**
 * One spoken play description. Synthesis starts streaming as soon as it's constructed, so audio
 * can be buffering while the play is still being animated; nothing is audible until `play()`.
 */
export class Utterance {
  private context: AudioContext
  private abort = new AbortController()
  private pending: AudioBuffer[] = []
  private sources = new Set<AudioBufferSourceNode>()
  private nextStartTime = 0
  private carry: number | null = null
  private released = false
  private streamEnded = false
  private finished = false
  private resolveDone!: () => void
  private watchdog: ReturnType<typeof setTimeout> | null = null
  /** Settles once playback has ended, been cancelled, or failed -- never rejects. */
  readonly done: Promise<void>

  constructor(context: AudioContext, text: string, apiKey: string) {
    this.context = context
    this.done = new Promise((resolve) => (this.resolveDone = resolve))
    streamSpeech(text, apiKey, (chunk) => this.receive(chunk), this.abort.signal)
      .catch((error: unknown) => {
        if (!this.abort.signal.aborted) console.warn('[Narrator] speech synthesis failed', error)
      })
      .finally(() => {
        this.streamEnded = true
        this.checkFinished()
      })
  }

  /** Starts audible playback (immediately, then continuing as more audio streams in). Returns `done`. */
  play(): Promise<void> {
    if (this.finished) return this.done
    this.released = true
    // Without a prior user gesture the context stays suspended and scheduled audio would never
    // end -- don't let a caller that awaits playback hang on speech nobody can hear.
    if (this.context.state !== 'running') {
      // resume() can succeed synchronously when the page already has user activation.
      void this.context.resume()
      if ((this.context.state as AudioContextState) !== 'running') {
        this.cancel()
        return this.done
      }
    }
    this.watchdog = setTimeout(() => this.cancel(), NARRATION_WATCHDOG_MS)
    for (const buffer of this.pending) this.schedule(buffer)
    this.pending = []
    this.checkFinished()
    return this.done
  }

  cancel(): void {
    this.abort.abort()
    for (const source of this.sources) {
      source.onended = null
      source.stop()
    }
    this.sources.clear()
    this.pending = []
    this.finish()
  }

  private receive({ bytes, sampleRate }: PcmChunk): void {
    if (this.finished) return
    // Chunk boundaries aren't guaranteed to fall on a whole 16-bit sample, so carry a dangling byte over.
    let offset = 0
    let first: number | null = null
    if (this.carry !== null && bytes.length > 0) {
      first = (this.carry | (bytes[0] << 8)) << 16 >> 16
      offset = 1
      this.carry = null
    }
    const sampleCount = Math.floor((bytes.length - offset) / 2)
    if ((bytes.length - offset) % 2 === 1) this.carry = bytes[bytes.length - 1]
    const total = sampleCount + (first !== null ? 1 : 0)
    if (total === 0) return

    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, sampleCount * 2)
    const buffer = this.context.createBuffer(1, total, sampleRate)
    const channel = buffer.getChannelData(0)
    let i = 0
    if (first !== null) channel[i++] = first / 32768
    for (let s = 0; s < sampleCount; s++) channel[i++] = view.getInt16(s * 2, true) / 32768

    if (this.released) this.schedule(buffer)
    else this.pending.push(buffer)
  }

  private schedule(buffer: AudioBuffer): void {
    const source = this.context.createBufferSource()
    source.buffer = buffer
    source.connect(this.context.destination)
    // Chunks are queued back-to-back on the audio clock so streamed pieces play gaplessly.
    const startAt = Math.max(this.nextStartTime, this.context.currentTime + 0.05)
    source.start(startAt)
    this.nextStartTime = startAt + buffer.duration
    this.sources.add(source)
    source.onended = () => {
      this.sources.delete(source)
      this.checkFinished()
    }
  }

  private checkFinished(): void {
    if (this.released && this.streamEnded && this.sources.size === 0 && this.pending.length === 0) this.finish()
  }

  private finish(): void {
    if (this.finished) return
    this.finished = true
    if (this.watchdog) clearTimeout(this.watchdog)
    this.resolveDone()
  }
}

/** Speaks play-by-play text with Gemini-TTS. At most one utterance is in flight; a newer one interrupts it. */
export class Narrator {
  private muted = false
  private apiKey = ''
  private current: Utterance | null = null

  setMuted(muted: boolean): void {
    this.muted = muted
    if (muted) this.stop()
    else if (sharedContext?.state === 'suspended') void sharedContext.resume()
  }

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey.trim()
  }

  /** Begins synthesizing `text` without playing it yet. Returns null when narration is muted or unconfigured. */
  prepare(text: string | undefined): Utterance | null {
    if (this.muted || !this.apiKey || !text) return null
    this.current?.cancel()
    this.current = new Utterance(getAudioContext(), text, this.apiKey)
    return this.current
  }

  stop(): void {
    this.current?.cancel()
    this.current = null
  }
}
