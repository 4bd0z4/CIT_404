import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Gift, Lock, LockOpen, Monitor, Trash2, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { apiDelete, apiGet, apiPost, ApiError } from '@/lib/api'
import { cn, timeAgo } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge, itemTypeVariant } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Table, Tbody, Td, Th, Thead, TableWrap, Tr } from '@/components/ui/table'
import { EmptyState, ItemIcon } from '@/components/fx'
import { KIND_LABEL } from '@/components/TransactionLog'
import type { MarketItem, TeamDetail as TeamDetailData } from '@/types'

export function TeamDetail() {
  const { id } = useParams()
  const teamId = Number(id)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['admin-team', teamId],
    queryFn: () => apiGet<TeamDetailData>(`/admin/teams/${teamId}`),
    refetchInterval: 10_000,
  })

  const { data: catalogue } = useQuery({
    queryKey: ['admin-items'],
    queryFn: () => apiGet<MarketItem[]>('/admin/items'),
  })

  const [adjustAmount, setAdjustAmount] = useState('')
  const [adjustEnergy, setAdjustEnergy] = useState('')
  const [adjustNote, setAdjustNote] = useState('')
  const [grantCode, setGrantCode] = useState('')

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-team', teamId] })
    queryClient.invalidateQueries({ queryKey: ['admin-teams'] })
  }

  const onError = (err: unknown) =>
    toast('ACTION DENIED', { description: err instanceof ApiError ? err.message : 'REQUEST FAILED.' })

  const adjust = useMutation({
    mutationFn: () =>
      apiPost(`/admin/teams/${teamId}/adjust`, {
        amount: Number(adjustAmount) || 0,
        energy: Number(adjustEnergy) || 0,
        note: adjustNote || 'Manual adjustment',
      }),
    onSuccess: () => {
      toast('BALANCE ADJUSTED', {
        description: `${adjustAmount || 0} CIT$ · ${adjustEnergy || 0} NRG · logged to the ledger`,
      })
      setAdjustAmount('')
      setAdjustEnergy('')
      setAdjustNote('')
      invalidate()
    },
    onError,
  })

  const grant = useMutation({
    mutationFn: () => apiPost(`/admin/teams/${teamId}/grant-item`, { itemCode: grantCode, quantity: 1 }),
    onSuccess: () => {
      toast('ITEM GRANTED', { description: grantCode })
      invalidate()
    },
    onError,
  })

  const lock = useMutation({
    mutationFn: (locked: boolean) => apiPost(`/admin/teams/${teamId}/lock`, { locked }),
    onSuccess: (_r, locked) => {
      toast(locked ? 'TEAM FROZEN' : 'TEAM RESTORED')
      invalidate()
    },
    onError,
  })

  const revoke = useMutation({
    mutationFn: (sessionId: string) => apiDelete(`/admin/sessions/${sessionId}`),
    onSuccess: () => {
      toast('DEVICE REVOKED')
      invalidate()
    },
    onError,
  })

  if (isLoading || !data) return <EmptyState>LOADING TEAM RECORD…</EmptyState>

  const t = data.team

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin/teams">
            <ArrowLeft /> Teams
          </Link>
        </Button>
        <h2 className="font-display text-xl tracking-[0.18em] text-term">{t.team_name}</h2>
        {t.is_locked && (
          <Badge variant="alert">
            <Lock className="size-3" /> Frozen
          </Badge>
        )}
        <div className="ml-auto">
          <Button
            variant={t.is_locked ? 'outline' : 'danger'}
            size="sm"
            onClick={() => lock.mutate(!t.is_locked)}
          >
            {t.is_locked ? <LockOpen /> : <Lock />}
            {t.is_locked ? 'Unfreeze' : 'Freeze account'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Stat label="Balance" value={t.cit_balance} tone="text-warn" />
        <Stat label="Core Energy" value={t.core_energy} tone="text-info" icon={<Zap className="size-3" />} />
        <Stat label="Earned" value={t.total_earned} />
        <Stat label="Spent" value={t.total_spent} tone="text-alert" />
        <Stat label="Items held" value={t.items_held} tone="text-item" />
        <Stat
          label="Accuracy"
          value={
            t.total_attempts > 0
              ? `${Math.round(((t.total_attempts - t.wrong_attempts) / t.total_attempts) * 100)}%`
              : '--'
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ---------------- INVENTORY ---------------- */}
        <Card>
          <CardHeader>
            <CardTitle>Inventory</CardTitle>
            <Badge variant="item">{data.items.length} distinct</Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.items.length === 0 ? (
              <EmptyState>NO ITEMS OWNED.</EmptyState>
            ) : (
              data.items.map((item) => (
                <div key={item.item_id} className="flex items-center gap-3 border border-edge bg-black/40 p-2.5">
                  <span className="flex size-8 shrink-0 items-center justify-center border border-edge text-term/60">
                    <ItemIcon name={item.icon} className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-bold">{item.name}</div>
                    <Badge variant={itemTypeVariant(item.item_type)} className="mt-0.5">
                      {item.item_type}
                    </Badge>
                  </div>
                  <div className="shrink-0 text-right text-[10px] text-term/40">
                    <div className="font-display text-base text-term">×{item.quantity}</div>
                    <div>
                      {item.total_bought} bought · {item.total_used} used
                    </div>
                  </div>
                </div>
              ))
            )}

            <div className="flex gap-2 border-t border-edge pt-3">
              <select
                value={grantCode}
                onChange={(e) => setGrantCode(e.target.value)}
                className="h-9 flex-1 border border-edge bg-black/60 px-2 text-xs text-term focus:border-term focus:outline-none"
                aria-label="Item to grant"
              >
                <option value="">Grant an item…</option>
                {catalogue?.map((i) => (
                  <option key={i.code} value={i.code}>
                    {i.name} ({i.item_type})
                  </option>
                ))}
              </select>
              <Button
                variant="item"
                size="sm"
                disabled={!grantCode || grant.isPending}
                onClick={() => grant.mutate()}
              >
                <Gift /> Grant
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ---------------- OPERATORS & DEVICES ---------------- */}
        <Card>
          <CardHeader>
            <CardTitle>Operators & devices</CardTitle>
            <Badge variant="muted">{data.sessions.length} active</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {data.operators.map((o) => (
                <Badge key={o.id}>{o.nickname}</Badge>
              ))}
              {data.operators.length === 0 && <span className="text-xs text-term/30">None yet.</span>}
            </div>

            {data.sessions.length === 0 ? (
              <EmptyState>NO ACTIVE DEVICES.</EmptyState>
            ) : (
              <ul className="space-y-1.5">
                {data.sessions.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 border border-edge bg-black/40 p-2 text-[11px]">
                    <Monitor className="size-3.5 shrink-0 text-term/40" />
                    <span className="min-w-0 flex-1 truncate text-term/60">
                      {s.user_agent?.slice(0, 48) ?? 'Unknown device'}
                    </span>
                    <span className="shrink-0 text-term/25">{timeAgo(s.created_at)}</span>
                    <button
                      onClick={() => revoke.mutate(s.id)}
                      className="shrink-0 text-alert/60 transition-colors hover:text-alert"
                      aria-label="Revoke this device"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="space-y-2 border-t border-edge pt-3">
              <Label>Manual adjustment</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                  placeholder="± CIT$"
                  className="h-9 w-24 text-xs"
                  aria-label="CIT$ adjustment"
                />
                <Input
                  type="number"
                  value={adjustEnergy}
                  onChange={(e) => setAdjustEnergy(e.target.value)}
                  placeholder="± NRG"
                  className="h-9 w-24 text-xs"
                  aria-label="Energy adjustment"
                />
                <Input
                  value={adjustNote}
                  onChange={(e) => setAdjustNote(e.target.value)}
                  placeholder="Reason (written to the ledger)"
                  className="h-9 flex-1 text-xs"
                />
                <Button
                  variant="warn"
                  size="sm"
                  disabled={(!adjustAmount && !adjustEnergy) || adjust.isPending}
                  onClick={() => adjust.mutate()}
                >
                  Apply
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ---------------- MISSIONS ---------------- */}
      <Card>
        <CardHeader>
          <CardTitle>Missions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {data.missions.length === 0 ? (
            <div className="p-4">
              <EmptyState>NO MISSIONS PURCHASED.</EmptyState>
            </div>
          ) : (
            <TableWrap>
              <Table>
                <Thead>
                  <tr>
                    <Th>Mission</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Paid</Th>
                    <Th className="text-right">Reward</Th>
                    <Th>Difficulty</Th>
                    <Th className="text-right">Purchased</Th>
                  </tr>
                </Thead>
                <Tbody>
                  {data.missions.map((m) => (
                    <Tr key={m.id}>
                      <Td className="font-bold">{m.mission_name}</Td>
                      <Td>
                        <Badge
                          variant={
                            m.status === 'COMPLETED' ? 'default' : m.status === 'FAILED' ? 'alert' : 'warn'
                          }
                        >
                          {m.status}
                        </Badge>
                      </Td>
                      <Td className="text-right tabular-nums text-alert/70">{m.paid_amount}</Td>
                      <Td className="text-right tabular-nums text-term">{m.reward}</Td>
                      <Td>
                        <Badge
                          variant={
                            m.difficulty === 'HARD' ? 'alert'
                              : m.difficulty === 'MEDIUM' ? 'warn' : 'default'
                          }
                        >
                          {m.difficulty}
                        </Badge>
                      </Td>
                      <Td className="text-right text-term/30">{timeAgo(m.purchased_at)}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </TableWrap>
          )}
        </CardContent>
      </Card>

      {/* ---------------- LEDGER ---------------- */}
      <Card>
        <CardHeader>
          <CardTitle>Ledger</CardTitle>
          <Badge variant="muted">{data.ledger.length} entries · append-only</Badge>
        </CardHeader>
        <CardContent className="p-0">
          <TableWrap className="max-h-96 overflow-y-auto">
            <Table>
              <Thead className="sticky top-0 bg-panel">
                <tr>
                  <Th>Type</Th>
                  <Th>Detail</Th>
                  <Th>Operator</Th>
                  <Th className="text-right">Amount</Th>
                  <Th className="text-right">Balance</Th>
                  <Th className="text-right">When</Th>
                </tr>
              </Thead>
              <Tbody>
                {data.ledger.map((row) => (
                  <Tr key={row.id}>
                    <Td>
                      <Badge variant={row.amount > 0 ? 'default' : row.amount < 0 ? 'warn' : 'muted'}>
                        {KIND_LABEL[row.kind] ?? row.kind}
                      </Badge>
                    </Td>
                    <Td className="max-w-56 truncate text-term/60">{row.note ?? '--'}</Td>
                    <Td className="text-term/50">{row.operator ?? 'SYSTEM'}</Td>
                    <Td
                      className={cn(
                        'text-right font-bold tabular-nums',
                        row.amount > 0 ? 'text-term' : row.amount < 0 ? 'text-alert' : 'text-term/30'
                      )}
                    >
                      {row.amount > 0 ? '+' : ''}
                      {row.amount}
                    </Td>
                    <Td className="text-right tabular-nums text-term/50">{row.balance_after}</Td>
                    <Td className="text-right text-term/30">{timeAgo(row.created_at)}</Td>
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

function Stat({
  label, value, tone = 'text-term', icon,
}: { label: string; value: number | string; tone?: string; icon?: React.ReactNode }) {
  return (
    <div className="border border-edge bg-panel/60 p-3">
      <div className="text-[10px] tracking-[0.12em] text-term/40 uppercase">{label}</div>
      <div className={cn('mt-1 flex items-center gap-1 font-display text-lg tabular-nums', tone)}>
        {icon}
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
    </div>
  )
}
