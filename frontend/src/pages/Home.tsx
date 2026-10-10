import { useQuery } from '@tanstack/react-query'
import { Activity, Crown, Radio, Wallet, Zap } from 'lucide-react'
import { apiGet } from '@/lib/api'
import { formatCIT, timeAgo } from '@/lib/utils'
import { useGame } from '@/store/game-context'
import { useAuth } from '@/store/auth-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState, GlitchTitle, TerminalBlock } from '@/components/fx'
import { NotificationsCard } from '@/components/Notifications'
import { ScoreGraph } from '@/components/ScoreGraph'
import type { LeaderboardRow } from '@/types'

interface FeedRow {
  team_name: string
  kind: string
  note: string | null
  created_at: string
}

const KIND_TEXT: Record<string, string> = {
  CHALLENGE_REWARD: 'recovered',
  FIRST_BLOOD: 'took first blood on',
  ITEM_PURCHASE: 'acquired',
  MISSION_PURCHASE: 'deployed on',
  MISSION_REWARD: 'completed',
  ENDGAME_REWARD: 'decrypted',
}

export function Home() {
  const { wallet, state, endgame } = useGame()
  const { team } = useAuth()

  const { data: feed } = useQuery({
    queryKey: ['feed'],
    queryFn: () => apiGet<FeedRow[]>('/game/feed'),
    refetchInterval: 15_000,
  })

  const { data: board } = useQuery({
    queryKey: ['leaderboard'],
    queryFn: () => apiGet<LeaderboardRow[]>('/game/leaderboard'),
    refetchInterval: 20_000,
  })

  const solved = state?.solvedChallenges.length ?? 0

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden border border-term/30 bg-gradient-to-b from-term/5 to-transparent px-6 py-8 text-center sm:py-10">
        <h1 className="font-display text-4xl tracking-[0.2em] text-term text-glow sm:text-6xl">
          <GlitchTitle>CIT: 404</GlitchTitle>
        </h1>
        <p className="mt-3 text-[11px] tracking-[0.24em] text-alert uppercase">The Core has fallen</p>
        <p className="mx-auto mt-5 max-w-2xl text-xs leading-relaxed text-term/70">
          The CIT Network has collapsed and its core systems are offline. As newly recruited
          Operators, you must earn resources, recover lost data, and complete critical missions to
          restore the network.
        </p>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={<Wallet className="size-4" />} label="Wallet" value={formatCIT(wallet.balance)} />
        <StatTile
          icon={<Zap className="size-4" />}
          label="Core Energy"
          value={String(wallet.coreEnergy)}
          tone="text-info"
        />
        <StatTile
          icon={<Activity className="size-4" />}
          label="Fragments"
          value={String(solved)}
          tone="text-warn"
        />
        <StatTile
          icon={<Radio className="size-4" />}
          label="Story"
          value={`${endgame.total > 0 ? Math.round((endgame.solved / endgame.total) * 100) : 0}%`}
          tone="text-item"
        />
      </div>

      {/* Admin messages, kept separate from the public activity feed. */}
      <NotificationsCard />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Network Activity</CardTitle>
              <p className="mt-0.5 text-[11px] text-term/45">What every team is doing right now.</p>
            </div>
            <Badge variant="muted">LIVE</Badge>
          </CardHeader>
          <CardContent className="space-y-2 p-3">
            {!feed?.length ? (
              <EmptyState>NO TRANSMISSIONS DETECTED.</EmptyState>
            ) : (
              feed.map((row, i) => (
                <div
                  key={`${row.created_at}-${i}`}
                  className="flex items-baseline gap-2 border-l border-term/25 py-1 pl-3 text-[11px]"
                >
                  <span className="font-bold text-term">{row.team_name}</span>
                  <span className="text-term/45">{KIND_TEXT[row.kind] ?? 'logged'}</span>
                  <span className="truncate text-term/70">{row.note}</span>
                  <span className="ml-auto shrink-0 text-term/25">{timeAgo(row.created_at)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recovery Standings</CardTitle>
            <Crown className="size-4 text-warn" />
          </CardHeader>
          <div className="border-b border-edge px-3 pt-3">
            <ScoreGraph />
          </div>
          <CardContent className="space-y-1.5 p-3">
            {!board?.length ? (
              <EmptyState>STANDINGS NOT YET CALCULATED.</EmptyState>
            ) : (() => {
                const top = board.slice(0, 8)
                const maxEnergy = Math.max(1, ...top.map((r) => r.core_energy))
                const medal = (rank: number) =>
                  Number(rank) === 1 ? 'gold' : Number(rank) === 2 ? 'silver' : Number(rank) === 3 ? 'bronze' : undefined
                return top.map((row, i) => {
                  const isMine = row.team_name === team?.teamName
                  const variant = medal(row.rank)
                  return (
                    <div
                      key={row.team_name}
                      className="rank-row"
                      {...(variant ? { 'data-variant': variant } : {})}
                      {...(isMine ? { 'data-mine': '' } : {})}
                      style={{ animationDelay: `${i * 45}ms` }}
                    >
                      <span className="rank-num">{row.rank}</span>
                      <div className="rank-identity">
                        <div className="flex items-center gap-2">
                          <span className="rank-name">{row.team_name}</span>
                          {row.first_bloods > 0 && (
                            <span className="flex items-center gap-0.5 text-warn" title="First bloods">
                              <Crown className="size-3" />
                              {row.first_bloods}
                            </span>
                          )}
                        </div>
                        <div className="rank-bar" aria-hidden>
                          <span style={{ width: `${(row.core_energy / maxEnergy) * 100}%` }} />
                        </div>
                      </div>
                      <div className="rank-trailing">
                        <Zap className="size-3 text-info" />
                        <span className="rank-pts">{row.core_energy}</span>
                        <span className="rank-pts-label">NRG</span>
                      </div>
                      <span className="w-14 shrink-0 text-right text-[11px] tabular-nums text-term/40">
                        {row.total_solved} solved
                      </span>
                    </div>
                  )
                })
              })()
            }
          </CardContent>
        </Card>
      </div>

      <TerminalBlock>
        <p className="text-term/60">
          &gt; CIT$ is not just a score. CIT$ is your power during the next phase.
        </p>
      </TerminalBlock>
    </div>
  )
}

function StatTile({
  icon, label, value, tone = 'text-term',
}: { icon: React.ReactNode; label: string; value: string; tone?: string }) {
  return (
    <div className="border border-edge bg-panel/60 p-3">
      <div className="flex items-center gap-1.5 text-[10px] tracking-[0.14em] text-term/45 uppercase">
        {icon} {label}
      </div>
      <div className={`mt-1.5 font-display text-lg tabular-nums ${tone}`}>{value}</div>
    </div>
  )
}
