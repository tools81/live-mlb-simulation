import { Application } from 'pixi.js'
import { useEffect, useState, type RefObject } from 'react'
import { FieldController } from '../pixi/FieldController'

/** Mounts a PixiJS Application into the given container, StrictMode-safe (a spurious dev double-invoke just absorbs one create+destroy cycle). */
export function usePixiApp(containerRef: RefObject<HTMLDivElement | null>): FieldController | null {
  const [controller, setController] = useState<FieldController | null>(null)

  useEffect(() => {
    let cancelled = false
    let app: Application | null = null
    let fieldController: FieldController | null = null
    let resizeObserver: ResizeObserver | null = null

    async function setup() {
      const container = containerRef.current
      if (!container) return

      const newApp = new Application()
      await newApp.init({ backgroundAlpha: 0, antialias: true, resolution: window.devicePixelRatio || 1, autoDensity: true })

      if (cancelled) {
        newApp.destroy(true, { children: true, texture: false })
        return
      }

      app = newApp
      container.appendChild(app.canvas)
      fieldController = new FieldController(app)

      const resize = () => {
        if (!fieldController || !app) return
        const width = container.clientWidth
        const height = container.clientHeight
        app.renderer.resize(width, height)
        fieldController.setStageSize(width, height)
      }
      resize()

      resizeObserver = new ResizeObserver(resize)
      resizeObserver.observe(container)

      setController(fieldController)
    }

    setup().catch((error) => console.error('[usePixiApp] setup failed', error))

    return () => {
      cancelled = true
      resizeObserver?.disconnect()
      fieldController?.destroy()
      app?.destroy(true, { children: true, texture: false })
    }
  }, [])

  return controller
}
