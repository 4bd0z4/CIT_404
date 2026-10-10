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
import { EmptyState, GlitchTitle, TerminalBlock, TypeWriter } from '@/components/fx'
import { PhaseLocked } from '@/components/PhaseGate'
import type { EndgamePart, EndgameProgress } from '@/types'

interface EndgameResponse {
  locked: boolean
  parts: EndgamePart[]
  progress: EndgameProgress | null
}

/**
 * Phase III is a single input: the final flag, assembled from the physical
 * fragments the team collected around INPT. The backend still models it as
 * endgame part #1, so only the first part is rendered.
 */
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

  const part = data?.parts?.[0]
  if (!part) return <EmptyState>NO FINAL TRANSMISSION AVAILABLE.</EmptyState>

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="font-display text-2xl tracking-[0.2em] text-term text-glow">
          <GlitchTitle>RECOVERY PROTOCOL</GlitchTitle>
        </h2>
        <p className="mt-1 text-[11px] tracking-[0.16em] text-term/45 uppercase">
          One flag. Assemble every fragment you found.
        </p>
      </div>

      <FlagCard part={part} />

      {part.solved && (
        <div className="border-2 border-alert/70 bg-alert/5 px-6 py-10 text-center">
          <p className="font-display text-lg tracking-[0.16em] text-alert">
            <TypeWriter text="DID YOU RESTORE THE SYSTEM... OR DID YOU JUST SET IT FREE?" speed={45} />
          </p>
        </div>
      )}
    </div>
  )
}

function FlagCard({ part }: { part: EndgamePart }) {
  const queryClient = useQueryClient()
  const [flag, setFlag] = useState('')

  const solve = useMutation({
    mutationFn: () => apiPost('/game/endgame/solve', { position: part.position, code: flag.trim() }),
    onSuccess: () => {
      toast('FINAL TRANSMISSION DECRYPTED', {
        description: `+${part.reward_cit} CIT$ · +${part.reward_energy} NRG`,
      })
      setFlag('')
      queryClient.invalidateQueries({ queryKey: ['endgame'] })
      queryClient.invalidateQueries({ queryKey: ['game-state'] })
    },
    onError: (err) =>
      toast('FLAG REJECTED', {
        description: err instanceof ApiError ? err.message : 'INVALID FLAG.',
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
            {part.solved ? <Check className="size-4" /> : <Lock className="size-4" />}
          </span>
          <h3 className="truncate font-display text-sm tracking-[0.14em] text-term uppercase">
            {part.title}
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
        <p className="text-xs leading-relaxed text-term/65">{part.prompt}</p>

        {part.solved ? (
          <TerminalBlock>
            <p className="whitespace-pre-wrap">{part.story_fragment}</p>
          </TerminalBlock>
        ) : (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (flag.trim()) solve.mutate()
            }}
          >
            <Input
              value={flag}
              onChange={(e) => setFlag(e.target.value)}
              placeholder="CIT{...}"
              className="h-11 font-mono text-sm"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              aria-label="Final flag"
            />
            <Button type="submit" className="w-full" disabled={solve.isPending || !flag.trim()}>
              <KeyRound /> {solve.isPending ? 'Verifying…' : 'Submit final flag'}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
