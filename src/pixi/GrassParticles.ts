import { Container, Graphics } from 'pixi.js'

const POOL_SIZE = 10
const BLADE_LIFETIME_MS = 450
const MIN_SPEED_PX_PER_MS = 0.04
const MAX_SPEED_PX_PER_MS = 0.12

interface Blade {
  graphic: Graphics
  vx: number
  vy: number
  ageMs: number
  active: boolean
}

/** A small pool of kicked-up grass-blade bits, spawned along a ground ball's flight path. */
export class GrassParticles {
  private blades: Blade[]

  constructor(container: Container) {
    this.blades = Array.from({ length: POOL_SIZE }, () => {
      const graphic = new Graphics()
      graphic.visible = false
      container.addChild(graphic)
      return { graphic, vx: 0, vy: 0, ageMs: 0, active: false }
    })
  }

  spawn(x: number, y: number): void {
    const blade = this.blades.find((b) => !b.active) ?? this.blades[0]

    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.6
    const speed = MIN_SPEED_PX_PER_MS + Math.random() * (MAX_SPEED_PX_PER_MS - MIN_SPEED_PX_PER_MS)
    blade.vx = Math.cos(angle) * speed
    blade.vy = Math.sin(angle) * speed
    blade.ageMs = 0
    blade.active = true

    const g = blade.graphic
    const length = 4 + Math.random() * 3
    const shade = 0x3f9d3f + Math.floor(Math.random() * 0x0a1a0a)
    g.clear()
    g.rect(-1, -length / 2, 2, length).fill(shade)
    g.rotation = Math.random() * Math.PI
    g.position.set(x, y)
    g.alpha = 1
    g.visible = true
  }

  update(deltaMs: number): void {
    for (const blade of this.blades) {
      if (!blade.active) continue
      blade.ageMs += deltaMs
      if (blade.ageMs >= BLADE_LIFETIME_MS) {
        blade.active = false
        blade.graphic.visible = false
        continue
      }
      blade.graphic.x += blade.vx * deltaMs
      blade.graphic.y += blade.vy * deltaMs
      blade.graphic.alpha = 1 - blade.ageMs / BLADE_LIFETIME_MS
    }
  }
}
