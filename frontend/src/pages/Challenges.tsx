import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronDown, Crown, Database, Download, ExternalLink, Flag, Radio, Trophy, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { apiGet, apiPost, ApiError } from '@/lib/api'
import { cn, stars } from '@/lib/utils'
import { useGame } from '@/store/game-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogBody, DialogContent } from '@/components/ui/dialog'
import { EmptyState, GlitchTitle } from '@/components/fx'
import { PhaseLocked } from '@/components/PhaseGate'
import type { Challenge } from '@/types'

const CATEGORIES: { key: 'CP' | 'CTF'; title: string; blurb: string; tone: 'default' | 'info' }[] = [
  { key: 'CP',  title: 'Competitive Programming', blurb: 'Solve on HackerRank, then submit the completion key here.', tone: 'default' },
  { key: 'CTF', title: 'Capture the Flag', blurb: 'Crypto, OSINT, Misc, Steganography and Web challenges.', tone: 'info' },
]
const CTF_FILTERS = ['ALL', 'Crypto', 'OSINT', 'Misc', 'Steganography', 'Web'] as const

interface SolveResult {
  reward: number
  energy: number
  isFirstBlood: boolean
  bonus: { cit: number; energy: number } | null
  challenge: { code: string; title: string }
}

export function Challenges() {
  const { isPhaseOpen } = useGame()
  const [open, setOpen] = useState<'CP' | 'CTF' | 'DCR' | null>('CP')
  const [ctfFilter, setCtfFilter] = useState<(typeof CTF_FILTERS)[number]>('ALL')
  const [firstBlood, setFirstBlood] = useState<SolveResult | null>(null)
  const { data, isLoading } = useQuery({ queryKey: ['challenges'], queryFn: () => apiGet<{ locked: boolean; challenges: Challenge[] }>('/game/challenges') })
  if (!isPhaseOpen('CHALLENGES') || data?.locked) return <PhaseLocked title="Challenges — Phase I" phase="CHALLENGES" />
  const list = data?.challenges ?? []
  return <div className="space-y-4">
    <div className="flex items-baseline justify-between"><h2 className="font-display text-lg tracking-[0.18em] text-term uppercase">Challenges · Phase I</h2><Badge>{list.filter(c => c.solved).length} / {list.length} recovered</Badge></div>
    {CATEGORIES.map(cat => {
      const allItems = list.filter(c => c.category === cat.key)
      const items = cat.key === 'CTF' && ctfFilter !== 'ALL' ? allItems.filter(c => c.subcategory === ctfFilter) : allItems
      const isOpen = open === cat.key
      return <Card key={cat.key}>
        <button className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-term/5" onClick={() => setOpen(isOpen ? null : cat.key)} aria-expanded={isOpen}>
          <div><div className="font-display text-sm tracking-[0.16em] text-term uppercase">{cat.title}</div><div className="mt-0.5 text-[11px] text-term/45">{cat.blurb}</div></div>
          <div className="flex shrink-0 items-center gap-2"><Badge variant={cat.tone}>{allItems.filter(c => c.solved).length}/{allItems.length}</Badge><ChevronDown className={cn('size-4 text-term/50 transition-transform', isOpen && 'rotate-180')} /></div>
        </button>
        {isOpen && <CardContent className="space-y-2 border-t border-edge pt-4">
          {cat.key === 'CTF' && <div className="mb-3 flex flex-wrap gap-1.5">{CTF_FILTERS.map(filter => <button key={filter} onClick={() => setCtfFilter(filter)} className={cn('border px-2 py-1 text-[10px] font-bold tracking-[0.08em]', ctfFilter === filter ? 'border-info bg-info text-void' : 'border-edge text-term/50 hover:border-info/60')}>{filter}</button>)}</div>}
          {isLoading ? <EmptyState>DECRYPTING CHALLENGE INDEX…</EmptyState> : items.length === 0 ? <EmptyState>NO CHALLENGES AVAILABLE.</EmptyState> : items.map(c => <ChallengeCard key={c.id} challenge={c} onFirstBlood={setFirstBlood} />)}
        </CardContent>}
      </Card>
    })}
    <Card>
      <button className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-warn/5" onClick={() => setOpen(open === 'DCR' ? null : 'DCR')} aria-expanded={open === 'DCR'}>
        <div className="flex items-start gap-3"><Database className="mt-0.5 size-5 text-warn" /><div><div className="font-display text-sm tracking-[0.16em] text-warn uppercase">Data Core Retrieval</div><div className="mt-0.5 text-[11px] text-term/45">Investigate a read-only database with SQL. 15 missions, 4 levels.</div></div></div>
        <ChevronDown className={cn('size-4 text-warn/60 transition-transform', open === 'DCR' && 'rotate-180')} />
      </button>
      {open === 'DCR' && <CardContent className="border-t border-edge pt-4"><p className="mb-3 text-[11px] leading-relaxed text-term/60">Run SQL to investigate the data, then submit the short answer your query helped you discover. The query and answer are always separate.</p><Button asChild className="w-full"><Link to="/challenges/dcr"><Database /> Open DCR missions</Link></Button></CardContent>}
    </Card>
    <FirstBloodModal result={firstBlood} onClose={() => setFirstBlood(null)} />
  </div>
}

function ChallengeCard({
  challenge, onFirstBlood,
}: { challenge: Challenge; onFirstBlood: (r: SolveResult) => void }) {
  const queryClient = useQueryClient()
  const [flag, setFlag] = useState('')

  const submit = useMutation({
    mutationFn: () =>
      apiPost<SolveResult & { success: boolean }>('/game/submit-flag', {
        challengeCode: challenge.code,
        flag,
      }),
    onSuccess: (res) => {
      setFlag('')
      queryClient.invalidateQueries({ queryKey: ['challenges'] })
      queryClient.invalidateQueries({ queryKey: ['game-state'] })

      if (res.isFirstBlood) {
        onFirstBlood(res)
      } else {
        toast('FRAGMENT RECOVERED', {
          description: `+${res.reward} CIT$ · +${res.energy} NRG — ${challenge.title}`,
        })
      }
    },
    onError: (err) =>
      toast('SUBMISSION REJECTED', {
        description: err instanceof ApiError ? err.message : 'INVALID FLAG OR CORRUPTED DATA.',
      }),
  })

  const bountyOpen = !challenge.first_blood_taken && challenge.first_blood_cit > 0

  const useHint = useMutation({
    mutationFn: (level: 1 | 2) =>
      apiPost<{ revealed?: { hint?: string } }>('/game/items/use', {
        itemCode: level === 1 ? 'HINT_L1' : 'HINT_L2',
        challengeId: challenge.id,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['challenges'] })
      queryClient.invalidateQueries({ queryKey: ['game-state'] })
      toast('HINT DECRYPTED', { description: 'Check the challenge card.' })
    },
    onError: (err) =>
      toast('HINT DENIED', {
        description: err instanceof ApiError ? err.message : 'FAILED TO USE HINT.',
      }),
  })

  return (
    <div
      className={cn(
        'card-live border bg-black/40 p-3',
        challenge.solved ? 'solved-live border-term/40 bg-term/5' : 'border-edge'
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] tracking-[0.14em] text-term/40">{challenge.code}</span>
            {challenge.solved && (
              <Badge>
                <Check className="size-3" /> Recovered
              </Badge>
            )}
            {bountyOpen && !challenge.solved && (
              <Badge variant="warn">
                <Crown className="size-3" /> First blood +{challenge.first_blood_cit}
              </Badge>
            )}
          </div>
          <div className="mt-0.5 text-sm font-bold text-term">{challenge.title}</div>
          {challenge.description && (
            <p className="mt-1 text-[11px] leading-snug text-term/55">{challenge.description}</p>
          )}
        </div>

        <div className="shrink-0 text-right">
          <div className="text-[11px] text-warn">{stars(challenge.difficulty)}</div>
          <div className="mt-0.5 font-display text-sm tabular-nums text-term">
            +{challenge.reward}
            <span className="ml-1 text-[10px] text-term/35">CIT$</span>
          </div>
          <div className="flex items-center justify-end gap-1 font-display text-sm tabular-nums text-info">
            <Zap className="size-3" />+{challenge.core_energy}
            <span className="text-[10px] text-term/35">NRG</span>
          </div>
        </div>
      </div>

      {challenge.resource_url && <a href={challenge.resource_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 border border-info/50 bg-info/5 px-2.5 py-1.5 text-[10px] font-bold tracking-[0.08em] text-info uppercase hover:bg-info/10">
        {challenge.resource_type === 'DOWNLOAD' ? <Download className="size-3.5" /> : challenge.resource_type === 'SERVICE' ? <Radio className="size-3.5" /> : <ExternalLink className="size-3.5" />}
        {challenge.resource_type === 'DOWNLOAD' ? 'Download artifact' : challenge.resource_type === 'SERVICE' ? 'Open service' : 'Open challenge'}
      </a>}

      {/* Revealed hints */}
      {challenge.hint1_text && (
        <div className="mt-2 border-l-2 border-warn/50 bg-warn/5 py-2 pr-3 pl-3">
          <div className="text-[10px] font-bold tracking-[0.12em] text-warn/70 uppercase">Hint 1</div>
          <p className="mt-0.5 text-[11px] leading-snug text-term/75">{challenge.hint1_text}</p>
        </div>
      )}
      {challenge.hint2_text && (
        <div className="mt-2 border-l-2 border-item/50 bg-item/5 py-2 pr-3 pl-3">
          <div className="text-[10px] font-bold tracking-[0.12em] text-item/70 uppercase">Hint 2</div>
          <p className="mt-0.5 text-[11px] leading-snug text-term/75">{challenge.hint2_text}</p>
        </div>
      )}

      {/* Hint buy buttons (CTF only, not solved, hint available but not yet revealed) */}
      {!challenge.solved && (challenge.has_hint1 || challenge.has_hint2) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {challenge.has_hint1 && !challenge.hint1_revealed && (
            <Button variant="warn" size="sm" disabled={useHint.isPending} onClick={() => useHint.mutate(1)}>
              💡 Hint 1 (30 CIT$)
            </Button>
          )}
          {challenge.has_hint2 && !challenge.hint2_revealed && (
            <Button variant="item" size="sm" disabled={useHint.isPending} onClick={() => useHint.mutate(2)}>
              💡 Hint 2 (75 CIT$)
            </Button>
          )}
        </div>
      )}

      {!challenge.solved && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (flag.trim()) submit.mutate()
          }}
        >
          <Input
            value={flag}
            onChange={(e) => setFlag(e.target.value)}
            placeholder="CIT{...}"
            className="h-9 flex-1"
            autoComplete="off"
            aria-label={`Flag for ${challenge.code}`}
          />
          <Button type="submit" size="sm" disabled={submit.isPending || !flag.trim()}>
            <Flag /> {submit.isPending ? '…' : 'Submit'}
          </Button>
        </form>
      )}
    </div>
  )
}

/**
 * The first team to crack a challenge gets the whole screen for a moment.
 * Only one team ever sees this per challenge — the server decides, under a
 * row lock, so a tie cannot produce two winners.
 */
function FirstBloodModal({
  result, onClose,
}: { result: SolveResult | null; onClose: () => void }) {
  return (
    <Dialog open={Boolean(result)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md border-warn/60 shadow-[0_0_80px_-10px_var(--color-warn)]">
        <DialogBody className="space-y-5 py-8 text-center">
          <Trophy className="mx-auto size-12 text-warn" />

          <div>
            <h2 className="font-display text-2xl tracking-[0.16em] text-warn text-glow">
              <GlitchTitle>FIRST BLOOD</GlitchTitle>
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-term/75">
              Congratulations, Operators — you are the{' '}
              <span className="font-bold text-warn">first team</span> to solve
              <br />
              <span className="font-bold text-term">{result?.challenge.title}</span>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="border border-term/40 bg-term/5 p-3">
              <div className="text-[10px] tracking-[0.12em] text-term/50 uppercase">Reward</div>
              <div className="mt-1 font-display text-lg tabular-nums text-term">
                +{result?.reward}
              </div>
              <div className="flex items-center justify-center gap-1 text-[11px] text-info">
                <Zap className="size-3" />+{result?.energy} NRG
              </div>
            </div>
            <div className="border border-warn/50 bg-warn/5 p-3">
              <div className="text-[10px] tracking-[0.12em] text-warn/70 uppercase">Bonus</div>
              <div className="mt-1 font-display text-lg tabular-nums text-warn">
                +{result?.bonus?.cit ?? 0}
              </div>
              <div className="flex items-center justify-center gap-1 text-[11px] text-info">
                <Zap className="size-3" />+{result?.bonus?.energy ?? 0} NRG
              </div>
            </div>
          </div>

          <Button variant="warn" size="lg" className="w-full" onClick={onClose}>
            Continue the recovery
          </Button>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
