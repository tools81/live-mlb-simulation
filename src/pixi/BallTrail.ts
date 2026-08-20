import { Container, Sprite, Texture } from 'pixi.js'

const TRAIL_LENGTH = 8
const FADE_PER_MS = 0.0035
const TRAIL_DIAMETER_RATIO = 0.8

/** A ring buffer of fading ball clones, sampled from the ball's position each animation tick. */
export class BallTrail {
  private sprites: Sprite[]
  private cursor = 0
  private diameter: number

  constructor(container: Container, texture: Texture, ballDiameter: number) {
    this.diameter = ballDiameter * TRAIL_DIAMETER_RATIO
    this.sprites = Array.from({ length: TRAIL_LENGTH }, () => {
      const sprite = new Sprite(texture)
      sprite.anchor.set(0.5)
      sprite.width = this.diameter
      sprite.height = this.diameter
      sprite.visible = false
      container.addChild(sprite)
      return sprite
    })
  }

  setTexture(texture: Texture): void {
    for (const sprite of this.sprites) {
      sprite.texture = texture
      sprite.width = this.diameter
      sprite.height = this.diameter
    }
  }

  reset(): void {
    for (const sprite of this.sprites) sprite.visible = false
  }

  sample(x: number, y: number): void {
    const sprite = this.sprites[this.cursor]
    sprite.position.set(x, y)
    sprite.visible = true
    sprite.alpha = 0.45
    this.cursor = (this.cursor + 1) % this.sprites.length
  }

  update(deltaMs: number): void {
    for (const sprite of this.sprites) {
      if (sprite.visible) sprite.alpha = Math.max(0, sprite.alpha - deltaMs * FADE_PER_MS)
    }
  }
}
