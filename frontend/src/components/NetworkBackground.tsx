import { useEffect, useRef } from 'react'

/**
 * Drifting "recovery network" background, ported from the IBC CTF
 * NodeNetwork. Nodes float and link to their neighbours, like the Core's
 * mesh coming back online. A few nodes pulse. One fixed canvas, capped node
 * count, rAF loop; paused when the tab is hidden and static under
 * prefers-reduced-motion.
 */
type Node = { x: number; y: number; vx: number; vy: number; hue: 0 | 1; phase: number }

const LINK_DIST = 170
const CYAN = '34, 225, 255'
const VIOLET = '167, 139, 250'

export function NetworkBackground() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let width = 0
    let height = 0
    let nodes: Node[] = []
    let raf = 0
    let t = 0

    const resize = () => {
      width = window.innerWidth
      height = window.innerHeight
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      canvas.width = Math.max(1, Math.floor(width * dpr))
      canvas.height = Math.max(1, Math.floor(height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const init = () => {
      const count = Math.round(Math.min(110, Math.max(36, (width * height) / 20000)))
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.32,
        vy: (Math.random() - 0.5) * 0.32,
        hue: Math.random() < 0.7 ? 0 : 1,
        phase: Math.random() * Math.PI * 2,
      }))
    }

    const draw = () => {
      ctx.clearRect(0, 0, width, height)

      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i]
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j]
          const dist = Math.hypot(a.x - b.x, a.y - b.y)
          if (dist < LINK_DIST) {
            const alpha = (1 - dist / LINK_DIST) * 0.42
            ctx.strokeStyle = `rgba(${a.hue === b.hue && a.hue === 1 ? VIOLET : CYAN}, ${alpha})`
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.stroke()
          }
        }
      }

      for (const n of nodes) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 0.03 + n.phase)
        const col = n.hue === 0 ? CYAN : VIOLET
        ctx.beginPath()
        ctx.arc(n.x, n.y, 1.8 + pulse * 1.4, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${col}, ${0.55 + pulse * 0.4})`
        ctx.shadowColor = `rgba(${col}, 0.9)`
        ctx.shadowBlur = 8 + pulse * 8
        ctx.fill()
        ctx.shadowBlur = 0
      }
    }

    const step = () => {
      t++
      for (const n of nodes) {
        n.x += n.vx
        n.y += n.vy
        if (n.x < 0 || n.x > width) n.vx *= -1
        if (n.y < 0 || n.y > height) n.vy *= -1
      }
      draw()
      raf = requestAnimationFrame(step)
    }

    const start = () => {
      resize()
      init()
      if (reduced) draw()
      else raf = requestAnimationFrame(step)
    }

    const onResize = () => {
      resize()
      init()
      if (reduced) draw()
    }
    const onVisibility = () => {
      if (reduced) return
      cancelAnimationFrame(raf)
      if (!document.hidden) raf = requestAnimationFrame(step)
    }

    const first = requestAnimationFrame(start)
    window.addEventListener('resize', onResize)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return <canvas ref={ref} className="network-canvas" aria-hidden="true" />
}
