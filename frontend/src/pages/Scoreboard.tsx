import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Crown, Radio, Zap } from 'lucide-react'
import { apiGet } from '@/lib/api'
import { ScoreGraph } from '@/components/ScoreGraph'

interface Row {
  team_name: string
  core_energy: number
  total_solved: number
  first_bloods: number
  missions_completed: number
  rank: number
}

const variantOf = (rank: number) =>
  rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : undefined

/**
 * Venue projector view: /scoreboard. Public and read-only, no login, sized
 * for a big screen. Polls every 10 seconds.
 */
export function Scoreboard() {
  const { data: board } = useQuery({
    queryKey: ['public-leaderboard'],
    queryFn: () => apiGet<Row[]>('/public/leaderboard'),
    refetchInterval: 10_000,
  })
  const [clock, setClock] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const rows = board ?? []
  const maxEnergy = Math.max(1, ...rows.map((r) => r.core_energy))

  return (
    <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-[1800px] flex-col gap-5 px-6 py-6 lg:px-10">
      <header className="flex items-end justify-between border-b border-edge pb-4">
        <div>
          <h1 className="font-display text-4xl tracking-[0.22em] text-term text-glow lg:text-6xl">
            CIT: 404
          </h1>
          <p className="mt-1 text-xs tracking-[0.3em] text-term/55 uppercase lg:text-sm">
            Recovery Protocol — Live Standings
          </p>
        </div>
        <div className="flex items-center gap-5 text-right">
          <span className="flex items-center gap-2 text-xs tracking-[0.2em] text-alert uppercase">
            <Radio className="size-4 animate-pulse" /> Live
          </span>
          <span className="font-display text-3xl tabular-nums text-term/80 lg:text-5xl">
            {clock.toLocaleTimeString('en-GB')}
          </span>
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 gap-5 xl:grid-cols-5">
        <section className="xl:col-span-3">
          <div className="mb-2 text-[11px] tracking-[0.24em] text-term/50 uppercase">
            Core Energy over time
          </div>
          <ScoreGraph endpoint="/public/score-history" height={460} />
        </section>

        <section className="space-y-1.5 xl:col-span-2">
          <div className="mb-2 text-[11px] tracking-[0.24em] text-term/50 uppercase">
            Teams
          </div>
          {!rows.length ? (
            <div className="score-graph-empty">STANDINGS NOT YET CALCULATED.</div>
          ) : (
            rows.slice(0, 12).map((row, i) => {
              const variant = variantOf(row.rank)
              return (
                <div
                  key={row.team_name}
                  className="rank-row"
                  {...(variant ? { 'data-variant': variant } : {})}
                  style={{ animationDelay: `${i * 45}ms` }}
                >
                  <span className="rank-num">{row.rank}</span>
                  <div className="rank-identity">
                    <div className="flex items-center gap-2">
                      <span className="rank-name text-base">{row.team_name}</span>
                      {row.first_bloods > 0 && (
                        <span className="flex items-center gap-0.5 text-warn" title="First bloods">
                          <Crown className="size-3.5" />
                          {row.first_bloods}
                        </span>
                      )}
                    </div>
                    <div className="rank-bar" aria-hidden>
                      <span style={{ width: `${(row.core_energy / maxEnergy) * 100}%` }} />
                    </div>
                  </div>
                  <div className="rank-trailing">
                    <Zap className="size-4 text-info" />
                    <span className="rank-pts text-lg">{row.core_energy}</span>
                    <span className="rank-pts-label">NRG</span>
                  </div>
                  <span className="w-16 shrink-0 text-right text-xs tabular-nums text-term/45">
                    {row.total_solved} solved
                  </span>
                </div>
              )
            })
          )}
        </section>
      </div>
    </div>
  )
}
