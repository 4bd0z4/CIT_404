import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, KeyRound, Lock, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { apiGet, apiPost, ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useGame } from '@/store/game-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { EmptyState, GlitchTitle, TerminalBlock, TypeWriter } from '@/components/fx'
import { PhaseLocked } from '@/components/PhaseGate'
import type { EndgamePart, EndgameProgress } from '@/types'

interface EndgameResponse {
  locked: boolean
  parts: EndgamePart[]
  progress: EndgameProgress | null
}

export function Endgame() {
  const { isPhaseOpen } = useGame()

  const { data, isLoading } = useQuery({
    queryKey: ['endgame'],
    queryFn: () => apiGet<EndgameResponse>('/game/endgame'),
  })

  if (!isPhaseOpen('ENDGAME') || data?.locked) {
    return <PhaseLocked title="Endgame — Phase III" phase="ENDGAME" />
  }
  if (isLoading) return <EmptyState>ESTABLISHING CORE CONNECTION…</EmptyState>

  const parts = data?.parts ?? []
  const progress = data?.progress ?? { solved: 0, total: parts.length }
  const pct = progress.total > 0 ? Math.round((progress.solved / progress.total) * 100) : 0
  const complete = progress.total > 0 && progress.solved === progress.total

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="font-display text-2xl tracking-[0.2em] text-term text-glow">
          <GlitchTitle>RECOVERY PROTOCOL</GlitchTitle>
        </h2>
        <p className="mt-1 text-[11px] tracking-[0.16em] text-term/45 uppercase">
          Six fragments. Six codes. One truth.
        </p>
      </div>

      {/* Progress is the headline of this phase, so it sits above everything. */}
      <Card>
        <CardContent className="space-y-2 p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] tracking-[0.16em] text-term/50 uppercase">
              Story recovered
            </span>
            <span className="font-display text-3xl tabular-nums text-warn text-glow">{pct}%</span>
          </div>
          <Progress value={progress.solved} max={Math.max(1, progress.total)} tone="warn" label="Endgame progress" />
          <div className="flex justify-between text-[10px] text-term/35">
            <span>
              {progress.solved} / {progress.total} fragments
            </span>
            <span>{progress.total - progress.solved} remaining</span>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {parts.map((part) => (
          <PartCard key={part.id} part={part} />
        ))}
      </div>

      {complete && (
        <div className="border-2 border-alert/70 bg-alert/5 px-6 py-10 text-center">
          <p className="font-display text-lg tracking-[0.16em] text-alert">
            <TypeWriter text="DID YOU RESTORE THE SYSTEM... OR DID YOU JUST SET IT FREE?" speed={45} />
          </p>
        </div>
      )}
    </div>
  )
}

function PartCard({ part }: { part: EndgamePart }) {
  const queryClient = useQueryClient()
  const [code, setCode] = useState('')

  const solve = useMutation({
    mutationFn: () => apiPost('/game/endgame/solve', { position: part.position, code }),
    onSuccess: () => {
      toast('FRAGMENT RECOVERED', {
        description: `+${part.reward_cit} CIT$ · +${part.reward_energy} NRG — ${part.title}`,
      })
      setCode('')
      queryClient.invalidateQueries({ queryKey: ['endgame'] })
      queryClient.invalidateQueries({ queryKey: ['game-state'] })
    },
    onError: (err) =>
      toast('CODE REJECTED', {
        description: err instanceof ApiError ? err.message : 'INVALID FRAGMENT CODE.',
      }),
  })

  return (
    <Card className={cn(part.solved && 'border-term/50 bg-term/5')}>
      <div className="flex items-center justify-between gap-3 border-b border-edge px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              'flex size-8 shrink-0 items-center justify-center border font-display text-sm',
              part.solved ? 'border-term bg-term/10 text-term' : 'border-edge text-term/40'
            )}
          >
            {part.solved ? <Check className="size-4" /> : String(part.position).padStart(2, '0')}
          </span>
          <h3
            className={cn(
              'truncate font-display text-sm tracking-[0.14em] uppercase',
              part.solved ? 'text-term' : 'text-term/60'
            )}
          >
            {part.solved ? part.title : 'ENCRYPTED FRAGMENT'}
          </h3>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Badge variant="muted">+{part.reward_cit}</Badge>
          <Badge variant="info">
            <Zap className="size-3" />+{part.reward_energy}
          </Badge>
        </div>
      </div>

      <CardContent className="space-y-3">
        <p className="text-[11px] leading-relaxed text-term/60">{part.prompt}</p>

        {part.solved ? (
          <TerminalBlock>
            <p className="whitespace-pre-wrap">{part.story_fragment}</p>
          </TerminalBlock>
        ) : (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (code.trim()) solve.mutate()
            }}
          >
            <div className="relative flex-1">
              <Lock className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-term/30" />
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="FRAGMENT CODE"
                className="h-9 pl-8 tracking-[0.2em]"
                autoComplete="off"
                aria-label={`Code for fragment ${part.position}`}
              />
            </div>
            <Button type="submit" size="sm" disabled={solve.isPending || !code.trim()}>
              <KeyRound /> {solve.isPending ? '…' : 'Decrypt'}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
