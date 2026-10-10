import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, Crown, Play, Send, Trophy, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { apiGet, apiPost, ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useGame } from '@/store/game-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableWrap, Tbody, Td, Th, Thead, Tr } from '@/components/ui/table'
import { Dialog, DialogBody, DialogContent } from '@/components/ui/dialog'
import { EmptyState, GlitchTitle, TerminalBlock } from '@/components/fx'
import { PhaseLocked } from '@/components/PhaseGate'

/**
 * DCR mission page — statement, a read-only SQL console against the DCR
 * data database, and a separate free-text answer box. The SQL result is
 * information only; it never validates anything. Only the typed answer is
 * graded, server-side, against a hash the client never sees.
 *
 * ROUTING (wired by the main agent): mount at `/challenges/dcr/:id` behind
 * the operator layout, inside the CHALLENGES phase.
 */
const LEVEL_LABEL: Record<number, string> = { 1: 'EASY', 2: 'MEDIUM', 3: 'HARD', 4: 'EXPERT' }
const LEVEL_VARIANT: Record<number, 'default' | 'warn' | 'alert' | 'info'> = {
  1: 'default',
  2: 'warn',
  3: 'alert',
  4: 'info',
}

interface MissionDetail {
  id: string
  level: number
  title: string
  story: string
  question: string
  answerFormat: string
  rewardCit: number
  rewardCe: number
  firstBloodEligible: boolean
  solved: boolean
  epilogue: string | null
}

interface QueryResult {
  columns: string[]
  rows: Record<string, unknown>[]
  truncated: boolean
  ms: number
}

interface AnswerResult {
  correct: boolean
  firstBlood?: boolean
  reward?: { cit: number; ce: number }
  credited?: boolean
  epilogue?: string | null
}

const draftKey = (id: string) => `dcr:draft:${id}`

export function DcrMission() {
  const { id = '' } = useParams()
  const { isPhaseOpen } = useGame()
  const queryClient = useQueryClient()

  const { data: mission, isLoading, error } = useQuery({
    queryKey: ['dcr-mission', id],
    queryFn: () => apiGet<MissionDetail>(`/dcr/missions/${id}`),
    retry: false,
  })

  if (!isPhaseOpen('CHALLENGES')) {
    return <PhaseLocked title="Data Crime Reconstruction" phase="CHALLENGES" />
  }

  // A 403 means the prerequisite is not solved yet: send the operator back.
  if (error instanceof ApiError && error.status === 403) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Card>
          <CardContent>
            <EmptyState>{error.message || 'Solve the previous mission first.'}</EmptyState>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isLoading || !mission) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Card>
          <CardContent>
            <EmptyState>DECRYPTING MISSION…</EmptyState>
          </CardContent>
        </Card>
      </div>
    )
  }

  return <MissionView mission={mission} onSolved={() => {
    queryClient.invalidateQueries({ queryKey: ['dcr-missions'] })
    queryClient.invalidateQueries({ queryKey: ['dcr-mission', id] })
    queryClient.invalidateQueries({ queryKey: ['game-state'] })
  }} />
}

function BackLink() {
  return (
    <Link
      to="/challenges/dcr"
      className="inline-flex items-center gap-1 text-[11px] tracking-[0.14em] text-term/60 uppercase transition-colors hover:text-term"
    >
      <ArrowLeft className="size-3" /> Back to missions
    </Link>
  )
}

function MissionView({ mission, onSolved }: { mission: MissionDetail; onSolved: () => void }) {
  const [firstBlood, setFirstBlood] = useState<AnswerResult | null>(null)
  const [epilogue, setEpilogue] = useState<string | null>(null)

  return (
    <div className="space-y-4">
      <BackLink />

      {/* 1. Title bar */}
      <Card>
        <CardHeader className="flex-wrap">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] tracking-[0.14em] text-term/40">{mission.id}</span>
            <CardTitle>{mission.title}</CardTitle>
            <Badge variant={LEVEL_VARIANT[mission.level] ?? 'default'}>
              {LEVEL_LABEL[mission.level] ?? `L${mission.level}`}
            </Badge>
            {mission.firstBloodEligible && !mission.solved && (
              <Badge variant="warn">
                <Crown className="size-3" /> First blood +50%
              </Badge>
            )}
            {mission.solved && (
              <Badge>
                <Check className="size-3" /> Solved
              </Badge>
            )}
          </div>
          <div className="text-right">
            <div className="font-display text-sm tabular-nums text-term">
              +{mission.rewardCit}
              <span className="ml-1 text-[10px] text-term/35">CIT$</span>
            </div>
            <div className="font-display text-[11px] tabular-nums text-info">+{mission.rewardCe} CE</div>
          </div>
        </CardHeader>
      </Card>

      {/* Two columns on desktop, one on phone. */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* 2. Statement */}
        <Card>
          <CardHeader>
            <CardTitle>Briefing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <TerminalBlock className="whitespace-pre-wrap">{mission.story}</TerminalBlock>
            <div className="border border-term/30 bg-term/5 p-3 text-sm leading-relaxed text-term">
              {mission.question}
            </div>
            <p className="text-[11px] text-term/45">Answer format: {mission.answerFormat}</p>
          </CardContent>
        </Card>

        {/* 3 + 4. SQL console and result */}
        <SqlConsole missionId={mission.id} />
      </div>

      {/* 5. Answer box */}
      <AnswerBox
        mission={mission}
        onFirstBlood={setFirstBlood}
        onEpilogue={setEpilogue}
        onSolved={onSolved}
      />

      <FirstBloodModal result={firstBlood} title={mission.title} onClose={() => setFirstBlood(null)} />
      <EpilogueModal text={epilogue} onClose={() => setEpilogue(null)} />
    </div>
  )
}

/** The read-only SQL editor + result table. One query at a time. */
function SqlConsole({ missionId }: { missionId: string }) {
  const [sql, setSql] = useState('')

  // A per-mission draft survives tab switches, kept in sessionStorage so it
  // never outlives the session (and never touches localStorage).
  useEffect(() => {
    const saved = sessionStorage.getItem(draftKey(missionId))
    setSql(saved ?? '')
  }, [missionId])

  useEffect(() => {
    sessionStorage.setItem(draftKey(missionId), sql)
  }, [missionId, sql])

  const run = useMutation({
    mutationFn: () => apiPost<QueryResult>('/data/query', { sql }),
  })

  const error = run.error instanceof ApiError ? run.error.message : run.error ? 'QUERY FAILED.' : null
  const result = run.data

  function submit() {
    if (sql.trim() && !run.isPending) run.mutate()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>SQL Console</CardTitle>
        <span className="text-[10px] tracking-[0.12em] text-term/35 uppercase">read-only</span>
      </CardHeader>
      <CardContent className="space-y-3">
        <textarea
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault()
              submit()
            }
          }}
          placeholder="SELECT ..."
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          rows={6}
          aria-label="SQL query"
          className={cn(
            'min-h-[8rem] w-full resize-y border border-edge bg-black/60 p-3 font-mono text-xs leading-relaxed text-term',
            'placeholder:text-term/30 transition-colors',
            'focus:border-term focus:shadow-[0_0_18px_-6px_var(--color-term)] focus:outline-none'
          )}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-term/35">Ctrl+Enter to run</span>
          <Button size="sm" onClick={submit} disabled={run.isPending || !sql.trim()}>
            <Play /> {run.isPending ? 'Running…' : 'Run'}
          </Button>
        </div>

        <ResultArea error={error} result={result} />
      </CardContent>
    </Card>
  )
}

function ResultArea({ error, result }: { error: string | null; result: QueryResult | undefined }) {
  if (error) {
    return (
      <div className="border border-alert/50 bg-alert/10 p-3 font-mono text-[11px] leading-relaxed text-alert">
        {error}
      </div>
    )
  }
  if (!result) {
    return <EmptyState>Run a query to inspect the DCR database.</EmptyState>
  }
  if (result.rows.length === 0) {
    return (
      <div>
        <EmptyState>0 rows</EmptyState>
        <ResultFooter result={result} />
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <TableWrap className="max-h-80 overflow-y-auto border border-edge">
        <Table>
          <Thead>
            <Tr>
              {result.columns.map((c) => (
                <Th key={c}>{c}</Th>
              ))}
            </Tr>
          </Thead>
          <Tbody>
            {result.rows.map((row, i) => (
              <Tr key={i}>
                {result.columns.map((c) => (
                  <Td key={c} className="font-mono">
                    {formatCell(row[c])}
                  </Td>
                ))}
              </Tr>
            ))}
          </Tbody>
        </Table>
      </TableWrap>
      <ResultFooter result={result} />
    </div>
  )
}

function ResultFooter({ result }: { result: QueryResult }) {
  return (
    <div className="text-[10px] tracking-[0.12em] text-term/40 uppercase">
      {result.rows.length} rows · {result.ms} ms
      {result.truncated && ' · showing the first 200 rows'}
    </div>
  )
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return '∅'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/** The separate, graded answer field. Never shares state with the SQL box. */
function AnswerBox({
  mission,
  onFirstBlood,
  onEpilogue,
  onSolved,
}: {
  mission: MissionDetail
  onFirstBlood: (r: AnswerResult) => void
  onEpilogue: (text: string) => void
  onSolved: () => void
}) {
  const [answer, setAnswer] = useState('')
  const [solved, setSolved] = useState(mission.solved)
  // Set to a timestamp (ms) until which the box is disabled after a 429.
  const [cooldownUntil, setCooldownUntil] = useState(0)
  const [, forceTick] = useState(0)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const cooling = cooldownUntil > Date.now()

  useEffect(() => {
    if (!cooling) return
    timer.current = setInterval(() => forceTick((n) => n + 1), 1000)
    return () => {
      if (timer.current) clearInterval(timer.current)
    }
  }, [cooling, cooldownUntil])

  const submit = useMutation({
    mutationFn: () => apiPost<AnswerResult>(`/dcr/missions/${mission.id}/answer`, { answer }),
    onSuccess: (res) => {
      if (!res.correct) {
        toast('INCORRECT', { description: 'Incorrect. Keep investigating.' })
        return
      }
      setSolved(true)
      setAnswer('')
      onSolved()
      if (res.firstBlood) {
        onFirstBlood(res)
      } else {
        toast('MISSION SOLVED', {
          description: `+${res.reward?.cit ?? 0} CIT$ · +${res.reward?.ce ?? 0} CE — ${mission.title}`,
        })
      }
      if (res.epilogue) onEpilogue(res.epilogue)
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setSolved(true)
          toast('ALREADY SOLVED', { description: 'Your team already solved this mission.' })
          onSolved()
          return
        }
        if (err.status === 429) {
          setCooldownUntil(Date.now() + 60_000)
          toast('THROTTLED', { description: err.message })
          return
        }
        toast('REJECTED', { description: err.message })
        return
      }
      toast('REJECTED', { description: 'Submission failed.' })
    },
  })

  if (solved) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 text-sm text-term">
          <Check className="size-4 text-term" /> Solved — this mission is complete for your team.
        </CardContent>
      </Card>
    )
  }

  const cooldownSeconds = cooling ? Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000)) : 0
  const disabled = submit.isPending || cooling

  return (
    <Card>
      <CardHeader>
        <CardTitle>Submit your answer</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (answer.trim() && !disabled) submit.mutate()
          }}
        >
          <Label htmlFor="dcr-answer">Your answer</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="dcr-answer"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Type your answer"
              maxLength={200}
              autoComplete="off"
              disabled={disabled}
              className="flex-1"
            />
            <Button type="submit" disabled={disabled || !answer.trim()}>
              <Send /> {submit.isPending ? '…' : cooling ? `Wait ${cooldownSeconds}s` : 'Submit'}
            </Button>
          </div>
          <p className="text-[11px] text-term/40">
            The SQL result above is for investigation only — it does not submit anything.
          </p>
        </form>
      </CardContent>
    </Card>
  )
}

/** Reuses the whole-screen first-blood celebration from the Challenges page. */
function FirstBloodModal({
  result,
  title,
  onClose,
}: {
  result: AnswerResult | null
  title: string
  onClose: () => void
}) {
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
              Your team was the <span className="font-bold text-warn">first</span> to solve
              <br />
              <span className="font-bold text-term">{title}</span>
            </p>
          </div>
          <div className="border border-warn/50 bg-warn/5 p-3">
            <div className="text-[10px] tracking-[0.12em] text-warn/70 uppercase">Reward (incl. bonus)</div>
            <div className="mt-1 font-display text-lg tabular-nums text-warn">
              +{result?.reward?.cit ?? 0} CIT$
            </div>
            <div className="flex items-center justify-center gap-1 text-[11px] text-info">
              <Zap className="size-3" />+{result?.reward?.ce ?? 0} CE
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

/** The M15 epilogue takes the whole screen once the final mission is solved. */
function EpilogueModal({ text, onClose }: { text: string | null; onClose: () => void }) {
  return (
    <Dialog open={Boolean(text)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg border-alert/60 shadow-[0_0_80px_-10px_var(--color-alert)]">
        <DialogBody className="space-y-5 py-8">
          <h2 className="text-center font-display text-xl tracking-[0.16em] text-alert text-glow">
            <GlitchTitle>THE CORE</GlitchTitle>
          </h2>
          <TerminalBlock className="whitespace-pre-wrap border-alert/50 text-term">
            {text}
          </TerminalBlock>
          <Button variant="danger" size="lg" className="w-full" onClick={onClose}>
            …
          </Button>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
