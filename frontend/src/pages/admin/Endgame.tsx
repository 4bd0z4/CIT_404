import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Copy, Eye, EyeOff, KeyRound, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { apiGet } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { EmptyState } from '@/components/fx'
import type { AdminEndgamePart, TeamStats } from '@/types'

/**
 * The six endgame codes, plus who has already recovered each fragment.
 * Same reveal toggle as the mission codes: the screen is often visible to
 * whoever is standing at the desk.
 */
export function AdminEndgame() {
  const [showCodes, setShowCodes] = useState(false)

  const { data: parts, isLoading } = useQuery({
    queryKey: ['admin-endgame'],
    queryFn: () => apiGet<AdminEndgamePart[]>('/admin/endgame'),
    refetchInterval: 10_000,
  })

  const { data: teams } = useQuery({
    queryKey: ['admin-teams'],
    queryFn: () => apiGet<TeamStats[]>('/admin/teams'),
    refetchInterval: 10_000,
  })

  if (isLoading) return <EmptyState>LOADING RECOVERY PROTOCOL…</EmptyState>

  const totalParts = parts?.length ?? 0

  return (
    <div className="space-y-4">
      <Card className="border-warn/40">
        <CardHeader>
          <div>
            <CardTitle className="text-warn">Endgame fragment codes</CardTitle>
            <p className="mt-0.5 text-[11px] text-term/45">
              Hand a code over once the team has earned it. Each one pays CIT$, energy and a piece
              of the truth.
            </p>
          </div>
          <Button variant="warn" size="sm" onClick={() => setShowCodes((v) => !v)}>
            {showCodes ? <EyeOff /> : <Eye />}
            {showCodes ? 'Hide codes' : 'Reveal codes'}
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {parts?.map((part) => (
            <div key={part.id} className="border border-edge bg-black/40 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex size-7 shrink-0 items-center justify-center border border-warn/50 font-display text-xs text-warn">
                  {String(part.position).padStart(2, '0')}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs font-bold text-term">{part.title}</span>
                <Badge variant="muted">+{part.reward_cit} CIT$</Badge>
                <Badge variant="info">
                  <Zap className="size-3" />+{part.reward_energy}
                </Badge>
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(part.access_code)
                      .then(() => toast('CODE COPIED', { description: part.title }))
                      .catch(() => undefined)
                  }}
                  className="flex items-center gap-2 border border-warn/40 bg-warn/5 px-2.5 py-1 transition-colors hover:bg-warn/15"
                  title="Copy to clipboard"
                >
                  <KeyRound className="size-3 text-warn/60" />
                  <span className="font-display text-sm tracking-[0.25em] text-warn">
                    {showCodes ? part.access_code : '•••••••'}
                  </span>
                  <Copy className="size-3 text-warn/50" />
                </button>
              </div>

              <p className="mt-2 text-[11px] leading-snug text-term/50">{part.prompt}</p>

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] tracking-[0.12em] text-term/35 uppercase">
                  {part.teams_solved} recovered
                </span>
                {part.solved_by.map((name) => (
                  <Badge key={name}>{name}</Badge>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Story progress by team</CardTitle>
          <Badge variant="muted">{totalParts} fragments</Badge>
        </CardHeader>
        <CardContent className="space-y-2">
          {teams?.map((t) => {
            const pct = t.endgame_total > 0 ? Math.round((t.endgame_solved / t.endgame_total) * 100) : 0
            return (
              <div key={t.id} className="flex items-center gap-3">
                <span className="w-20 shrink-0 truncate text-xs font-bold text-term">{t.team_name}</span>
                <Progress
                  value={t.endgame_solved}
                  max={Math.max(1, t.endgame_total)}
                  tone="warn"
                  className="flex-1"
                  label={`${t.team_name} endgame progress`}
                />
                <span className="w-20 shrink-0 text-right text-[11px] tabular-nums text-term/60">
                  {t.endgame_solved}/{t.endgame_total} · {pct}%
                </span>
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
