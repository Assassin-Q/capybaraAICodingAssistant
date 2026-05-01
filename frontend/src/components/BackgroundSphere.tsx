import React, { useRef, useEffect } from 'react'

const STRENGTH = 0.5

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

const DARK_LINE = [120, 200, 255] as const
const DARK_DOT = [180, 220, 255] as const
const LIGHT_LINE = [60, 100, 150] as const
const LIGHT_DOT = [40, 80, 130] as const

function makeColor(r: number, g: number, b: number): string[] {
  const c: string[] = []
  for (let i = 0; i <= 20; i++) {
    c.push(`rgba(${r},${g},${b},${(i / 20).toFixed(3)})`)
  }
  return c
}

const darkLineColors = makeColor(...DARK_LINE)
const darkDotColors = makeColor(...DARK_DOT)
const lightLineColors = makeColor(...LIGHT_LINE)
const lightDotColors = makeColor(...LIGHT_DOT)

type PointData = { px: number; py: number; z: number }

const BackgroundSphere: React.FC<{ isDark: boolean }> = ({ isDark }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef = useRef({ x: -9999, y: -9999 })
  const smoothRef = useRef({ x: -9999, y: -9999 })
  const isDarkRef = useRef(isDark)

  useEffect(() => {
    isDarkRef.current = isDark
  }, [isDark])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let W = 0, H = 0
    let animId = 0
    let time = 0
    let spacing = 22
    let radius = 100

    // Reusable grid buffer
    let grid: PointData[] = []

    const ensureGrid = (rows: number, cols: number) => {
      const needed = rows * cols
      if (grid.length < needed) {
        grid = new Array(needed)
        for (let i = 0; i < needed; i++) grid[i] = { px: 0, py: 0, z: 0 }
      }
    }

    const calcParams = () => {
      const minDim = Math.min(W, H)
      spacing = Math.max(16, minDim / 50)
      radius = Math.max(60, minDim / 12)
    }

    const resize = () => {
      W = window.innerWidth
      H = window.innerHeight
      canvas!.width = W
      canvas!.height = H
      calcParams()
    }
    resize()
    window.addEventListener('resize', resize)

    window.addEventListener('mousemove', (e: MouseEvent) => {
      mouseRef.current.x = e.clientX
      mouseRef.current.y = e.clientY
    })
    window.addEventListener('mouseleave', () => {
      mouseRef.current.x = -9999
      mouseRef.current.y = -9999
    })

    const draw = (_now: number) => {
      const mx = lerp(smoothRef.current.x, mouseRef.current.x, 0.08)
      const my = lerp(smoothRef.current.y, mouseRef.current.y, 0.08)
      smoothRef.current.x = mx
      smoothRef.current.y = my

      ctx!.clearRect(0, 0, W, H)

      const breathe = 0.85 + 0.15 * Math.sin(time)
      const breatheSize = 1 + 0.3 * (0.5 + 0.5 * Math.sin(time + 0.5))
      const bAlpha = breathe

      const cols = Math.ceil(W / spacing) + 3
      const rows = Math.ceil(H / spacing) + 3
      const offsetX = (W % spacing) / 2
      const offsetY = (H % spacing) / 2

      ensureGrid(rows, cols)

      const lineColors = isDarkRef.current ? darkLineColors : lightLineColors
      const dotColors = isDarkRef.current ? darkDotColors : lightDotColors

      // Phase 1: compute displacements
      for (let r = 0; r < rows; r++) {
        const baseY = r * spacing + offsetY
        for (let c = 0; c < cols; c++) {
          const baseX = c * spacing + offsetX
          const dx = baseX - mx
          const dy = baseY - my
          const dist2 = dx * dx + dy * dy
          const p = grid[r * cols + c]
          let z = 0
          if (dist2 < radius * radius) {
            const dist = Math.sqrt(dist2)
            const ratio = dist / radius
            z = Math.sqrt(Math.max(0, 1 - ratio * ratio))
            const displacement = z * radius * STRENGTH * 0.06
            if (dist > 0.5) {
              const nx = dx / dist
              const ny = dy / dist
              p.px = baseX + nx * displacement
              p.py = baseY + ny * displacement
            } else {
              p.px = baseX
              p.py = baseY
            }
          } else {
            p.px = baseX
            p.py = baseY
          }
          p.z = z
        }
      }

      // Phase 2: draw horizontal lines - batch by alpha
      for (let r = 0; r < rows; r++) {
        const row = r * cols
        ctx!.beginPath()
        let started = false
        for (let c = 0; c < cols - 1; c++) {
          const a = grid[row + c]
          const b = grid[row + c + 1]
          const avgZ = (a.z + b.z) / 2
          const alpha = (0.08 + avgZ * 0.22) * bAlpha
          if (alpha < 0.01) continue
          const idx = Math.round(alpha * 20)
          ctx!.strokeStyle = lineColors[Math.min(idx, 20)]
          ctx!.lineWidth = 0.5 / (1 + avgZ * 0.6)
          if (started) ctx!.stroke()
          ctx!.beginPath()
          ctx!.moveTo(a.px, a.py)
          ctx!.lineTo(b.px, b.py)
          started = true
        }
        if (started) ctx!.stroke()
      }

      // Phase 3: draw vertical lines - batch by alpha
      for (let c = 0; c < cols; c++) {
        ctx!.beginPath()
        let started = false
        for (let r = 0; r < rows - 1; r++) {
          const a = grid[r * cols + c]
          const b = grid[(r + 1) * cols + c]
          const avgZ = (a.z + b.z) / 2
          const alpha = (0.08 + avgZ * 0.22) * bAlpha
          if (alpha < 0.01) continue
          const idx = Math.round(alpha * 20)
          ctx!.strokeStyle = lineColors[Math.min(idx, 20)]
          ctx!.lineWidth = 0.5 / (1 + avgZ * 0.6)
          if (started) ctx!.stroke()
          ctx!.beginPath()
          ctx!.moveTo(a.px, a.py)
          ctx!.lineTo(b.px, b.py)
          started = true
        }
        if (started) ctx!.stroke()
      }

      // Phase 4: draw dots
      for (let r = 0; r < rows; r++) {
        const row = r * cols
        for (let c = 0; c < cols; c++) {
          const { px, py, z } = grid[row + c]
          const alpha = (0.15 + z * 0.5) * bAlpha
          if (alpha < 0.02) continue
          const idx = Math.round(alpha * 20)
          ctx!.fillStyle = dotColors[Math.min(idx, 20)]
          const dotSize = (0.6 + z * 0.6) * breatheSize
          ctx!.beginPath()
          ctx!.arc(px, py, dotSize, 0, Math.PI * 2)
          ctx!.fill()
        }
      }

      time += 0.008
      animId = requestAnimationFrame(draw)
    }

    animId = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(animId)
    }
  }, [])

  return (
    <>
      <div className="fluid-bg-v2 blue" />
      <div className="fluid-bg-v2 violet" />
      <div className="fluid-bg-v2 accent" />
      <div className="bg-noise-v2" />
      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
        }}
      />
    </>
  )
}

export default BackgroundSphere
