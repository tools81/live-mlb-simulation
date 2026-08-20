import { Assets, Container, Graphics, RenderTexture, Sprite, Texture, type Renderer } from 'pixi.js'
import { buildHeadshotUrl } from '../api/images'

const circularTextureCache = new Map<number, Texture>()
const inFlight = new Map<number, Promise<Texture>>()

/** Bakes a headshot into a circular texture once per mlbId, caching the result for reuse across tokens. */
export function loadCircularHeadshotTexture(renderer: Renderer, mlbId: number, diameter = 96): Promise<Texture> {
  const cached = circularTextureCache.get(mlbId)
  if (cached) return Promise.resolve(cached)

  const pending = inFlight.get(mlbId)
  if (pending) return pending

  const promise = (async () => {
    // The headshot URL has no file extension (ends in `/current`), so Pixi's extension-based
    // parser detection can't identify it as an image without this explicit hint.
    const rawTexture = await Assets.load<Texture>({ src: buildHeadshotUrl(mlbId), parser: 'loadTextures' })

    const container = new Container()
    const sprite = new Sprite(rawTexture)
    const scale = diameter / Math.min(rawTexture.width, rawTexture.height)
    sprite.scale.set(scale)
    sprite.anchor.set(0.5)
    sprite.position.set(diameter / 2, diameter / 2)

    const mask = new Graphics().circle(diameter / 2, diameter / 2, diameter / 2).fill(0xffffff)
    container.addChild(sprite)
    container.addChild(mask)
    sprite.mask = mask

    const renderTexture = RenderTexture.create({ width: diameter, height: diameter })
    renderer.render({ container, target: renderTexture })
    container.destroy({ children: true })

    circularTextureCache.set(mlbId, renderTexture)
    inFlight.delete(mlbId)
    return renderTexture as Texture
  })()

  inFlight.set(mlbId, promise)
  return promise
}

export function getCachedCircularHeadshot(mlbId: number): Texture | undefined {
  return circularTextureCache.get(mlbId)
}

/** Prefetches every roster headshot up front so in-game animations never wait on a network request. */
export async function prefetchRoster(renderer: Renderer, mlbIds: number[]): Promise<void> {
  await Promise.all(mlbIds.map((id) => loadCircularHeadshotTexture(renderer, id).catch(() => undefined)))
}
