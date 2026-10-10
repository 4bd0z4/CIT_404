import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Check, ChevronRight, Crown, Lock } from 'lucide-react'
import { apiGet } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useGame } from '@/store/game-context'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/fx'
import { PhaseLocked } from '@/components/PhaseGate'

/**
 * DCR mission list — the second screen of the DCR module (reached from the
 * DCR section of Challenges). It shows one row per mission in id order and
 * never leaks the story or the question: those appear only on the mission
 * page itself.
 *
 * ROUTING (wired by the main agent): mount at `/challenges/dcr` behind the
 * same operator layout as the other phase pages. Mission rows link to
 * `/challenges/dcr/:id` (see DcrMission).
 */
export interface DcrMissionSummary {
  id: string
  level: number
  title: string
  rewardCit: number
  rewardCe: number
  firstBloodEligible: boolean
  status: 'OPEN' | 'SOLVED' | 'LOCKED'
  requires: string | null
}

const LEVEL_LABEL: Record<number, string> = { 1: 'EASY', 2: 'MEDIUM', 3: 'HARD', 4: 'EXPERT' }
const LEVEL_VARIANT: Record<number, 'default' | 'warn' | 'alert' | 'info'> = {
  1: 'default',
  2: 'warn',
  3: 'alert',
  4: 'info',
}

export function DcrList() {
  const { isPhaseOpen } = useGame()

  const { data, isLoading } = useQuery({
    queryKey: ['dcr-missions'],
    queryFn: () => apiGet<{ missions: DcrMissionSummary[] }>('/dcr/missions'),
  })

  // DCR lives inside the CHALLENGES phase, so it shares the same lock.
  if (!isPhaseOpen('CHALLENGES')) {
    return <PhaseLocked title="Data Crime Reconstruction" phase="CHALLENGES" />
  }

  const list = data?.missions ?? []
  const solved = list.filter((m) => m.status === 'SOLVED')
  const earned = solved.reduce((sum, m) => sum + m.rewardCit, 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg tracking-[0.18em] text-term uppercase">
          Data Crime Reconstruction
        </h2>
        <div className="flex items-center gap-2">
          <Badge>
            {solved.length} / {list.length} solved
          </Badge>
          <Badge variant="info">+{earned} CIT$ earned</Badge>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-2">
          {isLoading ? (
            <EmptyState>DECRYPTING MISSION INDEX…</EmptyState>
          ) : list.length === 0 ? (
            <EmptyState>NO DCR MISSIONS AVAILABLE.</EmptyState>
          ) : (
            list.map((m) => <MissionRow key={m.id} mission={m} />)
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function MissionRow({ mission }: { mission: DcrMissionSummary }) {
  const locked = mission.status === 'LOCKED'
  const solved = mission.status === 'SOLVED'

  const body = (
    <div
      className={cn(
        'flex items-center justify-between gap-3 border p-3 transition-colors',
        locked && 'cursor-not-allowed border-edge bg-black/40 opacity-55',
        solved && 'border-term/40 bg-term/5',
        !locked && !solved && 'border-edge bg-black/40 hover:border-term hover:bg-term/5'
      )}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] tracking-[0.14em] text-term/40">{mission.id}</span>
          <Badge variant={LEVEL_VARIANT[mission.level] ?? 'default'}>
            {LEVEL_LABEL[mission.level] ?? `L${mission.level}`}
          </Badge>
          {solved && (
            <Badge>
              <Check className="size-3" /> Solved
            </Badge>
          )}
          {mission.firstBloodEligible && !solved && (
            <Badge variant="warn">
              <Crown className="size-3" /> First blood +50%
            </Badge>
          )}
        </div>
        <div className="mt-0.5 truncate text-sm font-bold text-term">{mission.title}</div>
        {locked && mission.requires && (
          <div className="mt-0.5 text-[11px] text-term/45">
            <Lock className="mr-1 inline size-3" /> Solve {mission.requires} first
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <div className="text-right">
          <div className="font-display text-sm tabular-nums text-term">
            +{mission.rewardCit}
            <span className="ml-1 text-[10px] text-term/35">CIT$</span>
          </div>
          <div className="font-display text-[11px] tabular-nums text-info">
            +{mission.rewardCe} CE
          </div>
        </div>
        {locked ? (
          <Lock className="size-4 text-term/40" />
        ) : (
          <ChevronRight className="size-4 text-term/50" />
        )}
      </div>
    </div>
  )

  if (locked) {
    return (
      <div aria-disabled title={mission.requires ? `Solve ${mission.requires} first` : 'Locked'}>
        {body}
      </div>
    )
  }

  return (
    <Link to={`/challenges/dcr/${mission.id}`} className="block" aria-label={`${mission.id} ${mission.title}`}>
      {body}
    </Link>
  )
}
