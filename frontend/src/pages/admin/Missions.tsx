import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Check, Clock, Copy, Eye, EyeOff, KeyRound, MapPin, Shield, X } from 'lucide-react'
import { toast } from 'sonner'
import { apiGet, apiPost, ApiError } from '@/lib/api'
import { cn, formatDuration, timeAgo } from '@/lib/utils'
import { useTimeLeft } from '@/hooks/useNow'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, Tbody, Td, Th, Thead, TableWrap, Tr } from '@/components/ui/table'
import { EmptyState } from '@/components/fx'
import type { AdminMission, Difficulty } from '@/types'

interface PendingRow {
  id: number
  purchased_at: string
  deadline_at: string | null
  difficulty: Difficulty
  paid_amount: number
  team_name: string
  team_id: number
  mission_name: string
  task_label: string | null
  task_description: string | null
  reward: number
  core_energy: number
  insured: boolean
}

export function AdminMissions() {
  const queryClient = useQueryClient()
  const [showCodes, setShowCodes] = useState(false)

  const { data: pending } = useQuery({
    queryKey: ['admin-pending'],
    queryFn: () => apiGet<PendingRow[]>('/admin/missions/pending'),
    refetchInterval: 5_000,
  })

  const { data: missions } = useQuery({
    queryKey: ['admin-missions'],
    queryFn: () => apiGet<AdminMission[]>('/admin/missions'),
    refetchInterval: 15_000,
  })

  const resolve = useMutation({
    mutationFn: ({ id, outcome }: { id: number; outcome: 'COMPLETED' | 'FAILED' }) =>
      apiPost(`/admin/missions/${id}/resolve`, { outcome }),
    onSuccess: (_r, { outcome }) => {
      toast(outcome === 'COMPLETED' ? 'MISSION VALIDATED' : 'MISSION FAILED', {
        description: 'Payout and ledger entry written.',
      })
      for (const k of ['admin-pending', 'admin-missions', 'admin-teams']) {
        queryClient.invalidateQueries({ queryKey: [k] })
      }
    },
    onError: (err) =>
      toast('ACTION DENIED', {
        description: err instanceof ApiError ? err.message : 'REQUEST FAILED.',
      }),
  })

  return (
    <div className="space-y-4">
      {/* The codes an admin reads out on site. Hidden by default so the
          screen can be shown to a team without leaking every location. */}
      <Card className="border-warn/40">
        <CardHeader>
          <div>
            <CardTitle className="text-warn">Field access codes</CardTitle>
            <p className="mt-0.5 text-[11px] text-term/45">
              Give a team its code only once they have physically reached the location.
            </p>
          </div>
          <Button variant="warn" size="sm" onClick={() => setShowCodes((v) => !v)}>
            {showCodes ? <EyeOff /> : <Eye />}
            {showCodes ? 'Hide codes' : 'Reveal codes'}
          </Button>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {missions?.map((m) => (
            <div
              key={m.id}
              className={cn(
                'border bg-black/40 p-3',
                m.kind === 'SPECIAL' ? 'border-info/50' : 'border-edge'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-bold text-term">{m.mission_name}</span>
                {m.kind === 'SPECIAL' && <Badge variant="info">FREE</Badge>}
              </div>

              <button
                onClick={() => {
                  if (!m.access_code) return
                  navigator.clipboard?.writeText(m.access_code)
                    .then(() => toast('CODE COPIED', { description: m.mission_name }))
                    .catch(() => undefined)
                }}
                className="mt-2 flex w-full items-center justify-between gap-2 border border-warn/40 bg-warn/5 px-2.5 py-2 transition-colors hover:bg-warn/15"
                title="Copy to clipboard"
              >
                <span className="flex items-center gap-1.5 text-[10px] tracking-[0.12em] text-warn/60 uppercase">
                  <KeyRound className="size-3" /> code
                </span>
                <span className="font-display text-sm tracking-[0.25em] text-warn">
                  {showCodes ? m.access_code : '••••••••'}
                </span>
                <Copy className="size-3 text-warn/50" />
              </button>

              {m.coordinates && (
                <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-snug text-term/45">
                  <MapPin className="mt-0.5 size-3 shrink-0" /> {m.coordinates}
                </p>
              )}

              <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
                <Badge variant="muted">{m.teams_unlocked} unlocked</Badge>
                <Badge variant="muted">{m.purchases} bought</Badge>
                {m.in_progress > 0 && <Badge variant="warn">{m.in_progress} active</Badge>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Field validation queue — the screen a game master keeps open. */}
      <Card>
        <CardHeader>
          <CardTitle>Awaiting field validation</CardTitle>
          <Badge variant="warn">{pending?.length ?? 0} pending</Badge>
        </CardHeader>
        <CardContent className="p-0">
          {!pending?.length ? (
            <div className="p-4">
              <EmptyState>NO MISSIONS AWAITING VALIDATION.</EmptyState>
            </div>
          ) : (
            <TableWrap>
              <Table>
                <Thead>
                  <tr>
                    <Th>Team</Th>
                    <Th>Mission</Th>
                    <Th>Difficulty</Th>
                    <Th>Assigned task</Th>
                    <Th className="text-right">Paid</Th>
                    <Th className="text-right">Reward</Th>
                    <Th>Insurance</Th>
                    <Th className="text-right">Time left</Th>
                    <Th className="text-right">Resolve</Th>
                  </tr>
                </Thead>
                <Tbody>
                  {pending.map((row) => (
                    <PendingRowView
                      key={row.id}
                      row={row}
                      busy={resolve.isPending}
                      onResolve={(outcome) => resolve.mutate({ id: row.id, outcome })}
                    />
                  ))}
                </Tbody>
              </Table>
            </TableWrap>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mission catalogue</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <TableWrap>
            <Table>
              <Thead>
                <tr>
                  <Th>Mission</Th>
                  <Th>Tiers (cost / reward / energy)</Th>
                  <Th className="text-right">Unlocked</Th>
                  <Th className="text-right">Bought</Th>
                  <Th className="text-right">Done</Th>
                  <Th className="text-right">Failed</Th>
                  <Th className="text-right">Active</Th>
                </tr>
              </Thead>
              <Tbody>
                {missions?.map((m) => (
                  <Tr key={m.id}>
                    <Td>
                      <span className="font-bold">{m.mission_name}</span>
                      {m.kind === 'SPECIAL' && <Badge variant="info" className="ml-2">SPECIAL</Badge>}
                    </Td>
                    <Td className="text-[10px] text-term/55">
                      {m.tiers.map((t) => (
                        <span key={t.difficulty} className="mr-3 inline-block">
                          <span className="text-term/35">{t.difficulty.slice(0, 1)}</span>{' '}
                          {t.entryCost}/{t.reward}/{t.coreEnergy}
                        </span>
                      ))}
                    </Td>
                    <Td className="text-right tabular-nums text-info">{m.teams_unlocked}</Td>
                    <Td className="text-right tabular-nums">{m.purchases}</Td>
                    <Td className="text-right tabular-nums text-term">{m.completed}</Td>
                    <Td className="text-right tabular-nums text-alert">{m.failed}</Td>
                    <Td className="text-right tabular-nums text-warn">{m.in_progress}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableWrap>
        </CardContent>
      </Card>
    </div>
  )
}

function PendingRowView({
  row, busy, onResolve,
}: { row: PendingRow; busy: boolean; onResolve: (o: 'COMPLETED' | 'FAILED') => void }) {
  const left = useTimeLeft(row.deadline_at)

  return (
    <Tr>
      <Td>
        <Link to={`/admin/teams/${row.team_id}`} className="font-bold text-term hover:underline">
          {row.team_name}
        </Link>
      </Td>
      <Td>{row.mission_name}</Td>
      <Td>
        <Badge variant={row.difficulty === 'HARD' ? 'alert' : row.difficulty === 'MEDIUM' ? 'warn' : 'default'}>
          {row.difficulty}
        </Badge>
      </Td>
      <Td className="max-w-xs">
        {row.task_label ? (
          <>
            <div className="font-bold text-warn">{row.task_label}</div>
            {row.task_description && (
              <div className="mt-0.5 text-[10px] leading-snug whitespace-pre-line text-term/60">
                {row.task_description}
              </div>
            )}
          </>
        ) : (
          <span className="text-term/25">--</span>
        )}
      </Td>
      <Td className="text-right tabular-nums text-alert/70">{row.paid_amount}</Td>
      <Td className="text-right tabular-nums text-term">
        {row.reward}
        <span className="ml-1 text-[10px] text-info">+{row.core_energy}</span>
      </Td>
      <Td>{row.insured ? <Badge variant="info"><Shield className="size-3" /> Insured</Badge> : '--'}</Td>
      <Td className="text-right">
        {left !== null ? (
          <span
            className={cn(
              'inline-flex items-center gap-1 tabular-nums',
              left <= 0 ? 'text-alert' : 'text-warn'
            )}
          >
            <Clock className="size-3" />
            {formatDuration(left)}
          </span>
        ) : (
          <span className="text-term/25">{timeAgo(row.purchased_at)}</span>
        )}
      </Td>
      <Td className="text-right">
        <div className="flex justify-end gap-1.5">
          <Button size="sm" disabled={busy} onClick={() => onResolve('COMPLETED')}>
            <Check /> Pass
          </Button>
          <Button variant="danger" size="sm" disabled={busy} onClick={() => onResolve('FAILED')}>
            <X /> Fail
          </Button>
        </div>
      </Td>
    </Tr>
  )
}
