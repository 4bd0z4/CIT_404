import { Lock } from 'lucide-react'
import { useGame } from '@/store/game-context'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/fx'
import type { Phase } from '@/types'

const PHASE_NAME: Record<Phase, string> = {
  LOBBY: 'STANDBY',
  CHALLENGES: 'PHASE I — DIGITAL ARENA',
  MISSIONS: 'PHASE II — FIELD OPERATIONS',
  ENDGAME: 'PHASE III — RECOVERY PROTOCOL',
  CLOSED: 'NETWORK LOCKED',
}

/**
 * The locked state every phase tab shows when another phase is running.
 * Kept in one place so all three read identically.
 */
export function PhaseLocked({ title, phase }: { title: string; phase: Phase }) {
  const { phase: state } = useGame()
  const active = state?.phase ?? 'LOBBY'

  const explanation =
    active === 'LOBBY'
      ? 'THE RECOVERY PROTOCOL HAS NOT STARTED. EVERY PHASE IS SEALED UNTIL THE CORE OPENS ONE.'
      : active === 'CLOSED'
        ? 'THE NETWORK IS CLOSED. THE LEADERBOARD IS FROZEN.'
        : `ONLY ONE PHASE RUNS AT A TIME. ${PHASE_NAME[active]} IS CURRENTLY ACTIVE.`

  return (
    <Card className="opacity-90">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <Badge variant="alert">
          <Lock className="size-3" /> Sealed
        </Badge>
      </CardHeader>
      <CardContent>
        <EmptyState>
          {explanation}
          <br />
          <span className="mt-2 block text-term/25">
            {PHASE_NAME[phase]} will unlock when THE CORE switches to it.
          </span>
        </EmptyState>
      </CardContent>
    </Card>
  )
}
