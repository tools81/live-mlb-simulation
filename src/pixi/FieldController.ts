import { Assets, Container, Graphics, RenderTexture, Sprite, Text, Texture, type Application, type Renderer } from 'pixi.js'
import { Easing, TweenManager } from '../animation/tween'
import { BASE_ANCHORS_NORMALIZED, FIELDER_POSITIONS_NORMALIZED, normalizedToPixel, type PositionCode } from '../domain/coordinates'
import type { BallFlightStep, BaseKey, CelebrationStep, NormalizedPoint, RunnerMoveStep, TextPopStep } from '../domain/types'
import { BallTrail } from './BallTrail'
import { SpritePool } from './SpritePool'
import { getCachedCircularHeadshot } from './textures'

const BATTER_BOX_OFFSET: NormalizedPoint = { x: -0.025, y: 0.005 }
const RUNNER_TOKEN_DIAMETER = 44
const SINGLETON_TOKEN_DIAMETER = 52
const FIELDER_TOKEN_DIAMETER = 40
const BALL_DIAMETER = 20

export class FieldController {
  private tweens = new TweenManager()
  private stageWidth = 1
  private stageHeight = 1

  private stadiumLayer = new Container()
  private fieldersLayer = new Container()
  private runnersLayer = new Container()
  private batterPitcherLayer = new Container()
  private ballLayer = new Container()
  private textLayer = new Container()

  private stadiumSprite = new Sprite()
  private ball = new Sprite()
  private ballTrail: BallTrail

  private batterSprite = new Sprite()
  private pitcherSprite = new Sprite()
  private currentBatterId: number | null = null

  private fielderSprites = new Map<PositionCode, Sprite>()
  private runnerPool: SpritePool<Sprite>
  private runnerTokensByPlayerId = new Map<number, Sprite>()
  private placeholderTexture: Texture
  private app: Application

  constructor(app: Application) {
    this.app = app
    this.placeholderTexture = this.bakePlaceholderTexture()

    app.stage.addChild(this.stadiumLayer, this.fieldersLayer, this.runnersLayer, this.batterPitcherLayer, this.ballLayer, this.textLayer)

    this.stadiumLayer.addChild(this.stadiumSprite)

    this.batterSprite.anchor.set(0.5)
    this.pitcherSprite.anchor.set(0.5)
    this.batterPitcherLayer.addChild(this.pitcherSprite, this.batterSprite)

    this.ball.anchor.set(0.5)
    this.ball.texture = this.placeholderTexture
    this.ball.visible = false
    this.ball.width = BALL_DIAMETER
    this.ball.height = BALL_DIAMETER
    this.ballTrail = new BallTrail(this.ballLayer, this.placeholderTexture, BALL_DIAMETER)
    this.ballLayer.addChild(this.ball)

    this.runnerPool = new SpritePool(() => {
      const sprite = new Sprite()
      sprite.anchor.set(0.5)
      sprite.width = RUNNER_TOKEN_DIAMETER
      sprite.height = RUNNER_TOKEN_DIAMETER
      sprite.visible = false
      this.runnersLayer.addChild(sprite)
      return sprite
    })

    for (const position of Object.keys(FIELDER_POSITIONS_NORMALIZED) as PositionCode[]) {
      const sprite = new Sprite()
      sprite.anchor.set(0.5)
      sprite.width = FIELDER_TOKEN_DIAMETER
      sprite.height = FIELDER_TOKEN_DIAMETER
      sprite.visible = false
      this.fieldersLayer.addChild(sprite)
      this.fielderSprites.set(position, sprite)
      this.placeAt(sprite, FIELDER_POSITIONS_NORMALIZED[position])
    }

    app.ticker.add((ticker) => {
      this.tweens.update(ticker.deltaMS)
      this.ballTrail.update(ticker.deltaMS)
    })
  }

  private bakePlaceholderTexture(diameter = 64): Texture {
    const graphics = new Graphics().circle(diameter / 2, diameter / 2, diameter / 2).fill({ color: 0x2b3a55, alpha: 0.6 })
    const renderTexture = RenderTexture.create({ width: diameter, height: diameter })
    this.app.renderer.render({ container: graphics, target: renderTexture })
    graphics.destroy()
    return renderTexture
  }

  get renderer(): Renderer {
    return this.app.renderer
  }

  async loadStadiumBackground(url: string): Promise<void> {
    const texture = await Assets.load<Texture>(url)
    this.stadiumSprite.texture = texture
    this.fitStadiumSprite()
  }

  async loadBallTexture(url: string): Promise<void> {
    const texture = await Assets.load<Texture>(url)
    this.ball.texture = texture
    this.ball.width = BALL_DIAMETER
    this.ball.height = BALL_DIAMETER
    this.ballTrail.setTexture(texture)
  }

  setStageSize(width: number, height: number): void {
    this.stageWidth = width
    this.stageHeight = height
    this.fitStadiumSprite()
    this.reprojectStatic()
  }

  private fitStadiumSprite(): void {
    if (!this.stadiumSprite.texture || this.stadiumSprite.texture === Texture.EMPTY) return
    this.stadiumSprite.width = this.stageWidth
    this.stadiumSprite.height = this.stageHeight
  }

  private toPixel(point: NormalizedPoint) {
    return normalizedToPixel(point, this.stageWidth, this.stageHeight)
  }

  private placeAt(sprite: Sprite, point: NormalizedPoint): void {
    const px = this.toPixel(point)
    sprite.position.set(px.x, px.y)
  }

  private reprojectStatic(): void {
    for (const [position, sprite] of this.fielderSprites) {
      this.placeAt(sprite, FIELDER_POSITIONS_NORMALIZED[position])
    }
    this.placeAt(this.pitcherSprite, BASE_ANCHORS_NORMALIZED.mound)
    if (this.currentBatterId !== null) {
      this.placeAt(this.batterSprite, {
        x: BASE_ANCHORS_NORMALIZED.home.x + BATTER_BOX_OFFSET.x,
        y: BASE_ANCHORS_NORMALIZED.home.y + BATTER_BOX_OFFSET.y,
      })
    }
  }

  setPitcher(mlbId: number | null): void {
    this.pitcherSprite.texture = (mlbId !== null && getCachedCircularHeadshot(mlbId)) || this.placeholderTexture
    this.pitcherSprite.width = SINGLETON_TOKEN_DIAMETER
    this.pitcherSprite.height = SINGLETON_TOKEN_DIAMETER
    this.pitcherSprite.visible = mlbId !== null
    this.placeAt(this.pitcherSprite, BASE_ANCHORS_NORMALIZED.mound)
  }

  setBatter(mlbId: number | null): void {
    this.currentBatterId = mlbId
    this.batterSprite.texture = (mlbId !== null && getCachedCircularHeadshot(mlbId)) || this.placeholderTexture
    this.batterSprite.width = SINGLETON_TOKEN_DIAMETER
    this.batterSprite.height = SINGLETON_TOKEN_DIAMETER
    this.batterSprite.visible = mlbId !== null
    this.placeAt(this.batterSprite, {
      x: BASE_ANCHORS_NORMALIZED.home.x + BATTER_BOX_OFFSET.x,
      y: BASE_ANCHORS_NORMALIZED.home.y + BATTER_BOX_OFFSET.y,
    })
  }

  setFielder(position: PositionCode, mlbId: number | null): void {
    const sprite = this.fielderSprites.get(position)
    if (!sprite) return
    sprite.texture = (mlbId !== null && getCachedCircularHeadshot(mlbId)) || this.placeholderTexture
    sprite.visible = mlbId !== null
  }

  private getOrCreateRunnerToken(playerId: number): Sprite {
    let token = this.runnerTokensByPlayerId.get(playerId)
    if (!token) {
      token = this.runnerPool.acquire()
      token.texture = getCachedCircularHeadshot(playerId) || this.placeholderTexture
      token.width = RUNNER_TOKEN_DIAMETER
      token.height = RUNNER_TOKEN_DIAMETER
      token.visible = true
      token.alpha = 1
      this.runnerTokensByPlayerId.set(playerId, token)
    }
    if (playerId === this.currentBatterId) this.batterSprite.visible = false
    return token
  }

  private async releaseRunnerToken(playerId: number): Promise<void> {
    const token = this.runnerTokensByPlayerId.get(playerId)
    if (!token) return
    await this.tweens.play({
      from: { alpha: token.alpha },
      to: { alpha: 0 },
      durationMs: 280,
      onUpdate: (v) => (token.alpha = v.alpha),
    })
    token.visible = false
    this.runnerTokensByPlayerId.delete(playerId)
    this.runnerPool.release(token)
  }

  /** Instantly matches runner tokens to the given base occupancy, with no animation — hydration / drift self-correction. */
  snapBases(bases: Record<BaseKey, number | null>): void {
    const desired = new Map<number, NormalizedPoint>()
    if (bases.first !== null) desired.set(bases.first, BASE_ANCHORS_NORMALIZED.first)
    if (bases.second !== null) desired.set(bases.second, BASE_ANCHORS_NORMALIZED.second)
    if (bases.third !== null) desired.set(bases.third, BASE_ANCHORS_NORMALIZED.third)

    for (const [playerId, token] of this.runnerTokensByPlayerId) {
      if (!desired.has(playerId)) {
        token.visible = false
        token.alpha = 1
        this.runnerTokensByPlayerId.delete(playerId)
        this.runnerPool.release(token)
      }
    }
    for (const [playerId, point] of desired) {
      const token = this.getOrCreateRunnerToken(playerId)
      this.placeAt(token, point)
    }
  }

  async runBallFlight(step: BallFlightStep): Promise<void> {
    const from = this.toPixel(step.from)
    const to = this.toPixel(step.to)
    const arcPx = step.arcHeight * Math.min(this.stageWidth, this.stageHeight)

    this.ball.visible = true
    this.ballTrail.reset()

    await this.tweens.play({
      from: { x: from.x, y: from.y },
      to: { x: to.x, y: to.y },
      durationMs: step.durationMs,
      easing: step.easing ?? Easing.linear,
      onUpdate: (v, t) => {
        const arcOffset = arcPx * Easing.parabola(t)
        this.ball.position.set(v.x, v.y - arcOffset)
        if (step.spin) this.ball.rotation += 0.5
        this.ballTrail.sample(this.ball.x, this.ball.y)
      },
    })
  }

  async runRunnerMove(step: RunnerMoveStep): Promise<void> {
    const isNew = !this.runnerTokensByPlayerId.has(step.playerId)
    const token = this.getOrCreateRunnerToken(step.playerId)
    if (isNew) this.placeAt(token, step.from)

    const to = this.toPixel(step.to)
    await this.tweens.play({
      from: { x: token.x, y: token.y },
      to: { x: to.x, y: to.y },
      durationMs: step.durationMs,
      easing: step.easing ?? Easing.easeInOutQuad,
      onUpdate: (v) => token.position.set(v.x, v.y),
    })

    if (step.isOut || step.isScoring) {
      await this.releaseRunnerToken(step.playerId)
    }
  }

  async showTextPop(step: TextPopStep): Promise<void> {
    const point = this.toPixel(step.at)
    const color = step.tone === 'out' ? 0xe0483e : step.tone === 'good' ? 0x3ecf8e : 0xffffff
    const text = new Text({
      text: step.text,
      style: { fill: color, fontSize: 36, fontWeight: 'bold', stroke: { color: 0x000000, width: 4 } },
    })
    text.anchor.set(0.5)
    text.position.set(point.x, point.y)
    text.alpha = 0
    this.textLayer.addChild(text)

    await this.tweens.play({
      from: { y: point.y, alpha: 0, scale: 0.6 },
      to: { y: point.y - 30, alpha: 1, scale: 1 },
      durationMs: Math.min(300, step.durationMs),
      easing: Easing.easeOutQuad,
      onUpdate: (v) => {
        text.position.y = v.y
        text.alpha = v.alpha
        text.scale.set(v.scale)
      },
    })
    await this.tweens.play({
      from: { alpha: 1 },
      to: { alpha: 0 },
      durationMs: Math.max(0, step.durationMs - 300),
      onUpdate: (v) => (text.alpha = v.alpha),
    })
    this.textLayer.removeChild(text)
    text.destroy()
  }

  async runCelebration(step: CelebrationStep): Promise<void> {
    const point = this.toPixel(step.at)
    const pieces = Array.from({ length: 10 }, () => {
      const g = new Graphics().circle(0, 0, 4).fill(0xffd166 + Math.floor(Math.random() * 0x1111))
      g.position.set(point.x, point.y)
      this.textLayer.addChild(g)
      return g
    })

    await Promise.all(
      pieces.map((piece) => {
        const angle = Math.random() * Math.PI * 2
        const distance = 40 + Math.random() * 50
        return this.tweens.play({
          from: { x: point.x, y: point.y, alpha: 1 },
          to: { x: point.x + Math.cos(angle) * distance, y: point.y + Math.sin(angle) * distance, alpha: 0 },
          durationMs: step.durationMs,
          easing: Easing.easeOutQuad,
          onUpdate: (v) => {
            piece.position.set(v.x, v.y)
            piece.alpha = v.alpha
          },
        })
      }),
    )
    for (const piece of pieces) {
      this.textLayer.removeChild(piece)
      piece.destroy()
    }
  }

  destroy(): void {
    this.app.stage.removeChild(
      this.stadiumLayer,
      this.fieldersLayer,
      this.runnersLayer,
      this.batterPitcherLayer,
      this.ballLayer,
      this.textLayer,
    )
    for (const layer of [this.stadiumLayer, this.fieldersLayer, this.runnersLayer, this.batterPitcherLayer, this.ballLayer, this.textLayer]) {
      layer.destroy({ children: true })
    }
  }
}
