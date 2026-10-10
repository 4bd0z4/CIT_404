import { useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api'

/**
 * Live Core-Energy progression graph for the top teams. Data comes from
 * /api/game/score-history (built from the ledger). Pure SVG step lines,
 * vivid palette, no dependency. Adapted from the IBC CTF score graph.
 */
interface TeamSeries {
  name: string
  points: { t: number; score: number }[]
}

// Vivid, high-contrast lines — leader is electric cyan, then magenta/amber/violet.
const LINE_COLORS = [
  '#22e1ff', '#ff4fa3', '#ffb020', '#a78bfa', '#4ade80',
  '#fb7185', '#38bdf8', '#f472b6', '#facc15', '#2dd4bf',
]

const W = 900
const H = 200
const PAD = { top: 14, right: 14, bottom: 22, left: 46 }

export function ScoreGraph({
  endpoint = '/game/score-history',
  height = 200,
}: {
  endpoint?: string
  height?: number
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)

  const { data: series } = useQuery({
    queryKey: ['score-history', endpoint],
    queryFn: () => apiGet<TeamSeries[]>(endpoint),
    refetchInterval: 20_000,
  })

  const model = useMemo(() => {
    if (!series) return null
    const active = series.filter((s) => s.points.length > 0)
    if (active.length === 0) return null

    let tMin = Infinity, tMax = -Infinity, sMax = 0
    for (const s of active) {
      for (const p of s.points) {
        if (p.t < tMin) tMin = p.t
        if (p.t > tMax) tMax = p.t
        if (p.score > sMax) sMax = p.score
      }
    }
    if (tMax === tMin) tMax = tMin + 1
    if (sMax === 0) sMax = 1

    const plotW = W - PAD.left - PAD.right
    const plotH = H - PAD.top - PAD.bottom
    const x = (t: number) => PAD.left + ((t - tMin) / (tMax - tMin)) * plotW
    const y = (v: number) => PAD.top + plotH - (v / sMax) * plotH

    const lines = active
      .map((s, i) => {
        const pts: [number, number][] = [[x(tMin), y(0)]]
        for (const p of s.points) pts.push([x(p.t), y(p.score)])
        pts.push([x(tMax), y(s.points[s.points.length - 1].score)])
        let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`
        for (let k = 1; k < pts.length; k++) d += ` H ${pts[k][0].toFixed(1)} V ${pts[k][1].toFixed(1)}`
        return {
          name: s.name,
          color: LINE_COLORS[i % LINE_COLORS.length],
          d,
          last: s.points[s.points.length - 1].score,
        }
      })
      .sort((a, b) => b.last - a.last)

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ yv: y(sMax * f), label: Math.round(sMax * f) }))
    return { lines, plotW, tMin, tMax, yTicks }
  }, [series])

  if (!series) return <div className="score-graph-empty">LOADING PROGRESSION…</div>
  if (!model) return <div className="score-graph-empty">THE GRAPH APPEARS ONCE TEAMS GAIN ENERGY.</div>

  return (
    <div className="score-graph" style={{ ["--sg-h" as string]: `${height}px` }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Core Energy progression for the top teams"
        onMouseMove={(e) => {
          const svg = svgRef.current
          if (!svg) return
          const rect = svg.getBoundingClientRect()
          setHover(((e.clientX - rect.left) / rect.width) * W)
        }}
        onMouseLeave={() => setHover(null)}
      >
        {model.yTicks.map((tick, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={tick.yv} x2={W - PAD.right} y2={tick.yv}
              stroke="rgba(34, 225, 255,0.07)" strokeWidth="1" />
            <text x={PAD.left - 8} y={tick.yv + 3} textAnchor="end" fontSize="9"
              fontFamily="monospace" fill="rgba(34, 225, 255,0.4)">{tick.label}</text>
          </g>
        ))}

        {model.lines.map((ln) => (
          <path
            key={ln.name}
            d={ln.d}
            fill="none"
            stroke={ln.color}
            strokeWidth={ln.name === model.lines[0].name ? 3 : 1.75}
            strokeLinejoin="round"
            opacity={ln.name === model.lines[0].name ? 1 : 0.9}
          />
        ))}

        {hover !== null && hover >= PAD.left && hover <= W - PAD.right && (
          <line x1={hover} y1={PAD.top} x2={hover} y2={H - PAD.bottom}
            stroke="rgba(255,255,255,0.3)" strokeWidth="1" strokeDasharray="3 3" />
        )}
      </svg>

      <div className="score-graph-legend">
        {model.lines.slice(0, 8).map((ln) => (
          <span key={ln.name} className="sg-legend-item">
            <span className="sg-swatch" style={{ background: ln.color, boxShadow: `0 0 8px ${ln.color}` }} aria-hidden />
            <span className="sg-legend-name">{ln.name}</span>
            <span className="sg-legend-val">{ln.last}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
