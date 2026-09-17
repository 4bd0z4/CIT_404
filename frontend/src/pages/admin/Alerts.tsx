import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Clock, Send, Siren, Users, X } from 'lucide-react'
import { toast } from 'sonner'
import { apiGet, apiPost, ApiError } from '@/lib/api'
import { cn, formatDuration, timeAgo } from '@/lib/utils'
import { useTimeLeft } from '@/hooks/useNow'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { EmptyState } from '@/components/fx'
import type { AdminNotification, TeamStats } from '@/types'

/**
 * Where admins talk to teams.
 *
 * NORMAL lands in the team's transmissions panel. URGENT takes over their
 * screen with a countdown and cannot be dismissed by accident: if the
 * deadline passes without validation, the penalty set here is charged.
 */
export function Alerts() {
  const queryClient = useQueryClient()

  const [kind, setKind] = useState<'NORMAL' | 'URGENT'>('NORMAL')
  const [selected, setSelected] = useState<number[]>([])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [minutes, setMinutes] = useState('10')
  const [penaltyCit, setPenaltyCit] = useState('100')
  const [penaltyEnergy, setPenaltyEnergy] = useState('10')
  const [rewardCit, setRewardCit] = useState('200')

  const { data: teams } = useQuery({
    queryKey: ['admin-teams'],
    queryFn: () => apiGet<TeamStats[]>('/admin/teams'),
  })

  const { data: sent } = useQuery({
    queryKey: ['admin-notifications'],
    queryFn: () => apiGet<AdminNotification[]>('/admin/notifications'),
    refetchInterval: 5_000,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-notifications'] })
    queryClient.invalidateQueries({ queryKey: ['admin-overview'] })
    queryClient.invalidateQueries({ queryKey: ['admin-teams'] })
  }

  const onError = (err: unknown) =>
    toast('ACTION DENIED', { description: err instanceof ApiError ? err.message : 'REQUEST FAILED.' })

  const send = useMutation({
    mutationFn: () =>
      apiPost<{ sent: number }>('/admin/notifications', {
        teamIds: selected.length === teams?.length ? 'ALL' : selected,
        kind,
        title,
        body,
        minutes: kind === 'URGENT' ? Number(minutes) : undefined,
        penaltyCit: Number(penaltyCit),
        penaltyEnergy: Number(penaltyEnergy),
        rewardCit: Number(rewardCit),
      }),
    onSuccess: (res) => {
      toast('TRANSMISSION SENT', { description: `${res.sent} team(s) notified.` })
      setTitle('')
      setBody('')
      invalidate()
    },
    onError,
  })

  const resolve = useMutation({
    mutationFn: ({ id, outcome }: { id: number; outcome: 'COMPLETED' | 'FAILED' }) =>
      apiPost(`/admin/notifications/${id}/resolve`, { outcome }),
    onSuccess: (_r, { outcome }) => {
      toast(outcome === 'COMPLETED' ? 'ORDER VALIDATED' : 'ORDER FAILED', {
        description: outcome === 'COMPLETED' ? 'Reward paid.' : 'Penalty applied.',
      })
      invalidate()
    },
    onError,
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!selected.length) return toast('NO TARGET', { description: 'Select at least one team.' })
    if (!title.trim() || !body.trim()) return toast('INCOMPLETE', { description: 'Title and body required.' })
    send.mutate()
  }

  const allSelected = teams ? selected.length === teams.length : false

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_1fr]">
      {/* ---------------- COMPOSER ---------------- */}
      <Card className={cn(kind === 'URGENT' && 'border-alert/50')}>
        <CardHeader>
          <CardTitle className={cn(kind === 'URGENT' && 'text-alert')}>New transmission</CardTitle>
          <div className="flex gap-1">
            {(['NORMAL', 'URGENT'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={cn(
                  'border px-2.5 py-1 text-[10px] font-bold tracking-[0.1em] transition-colors',
                  kind === k
                    ? k === 'URGENT'
                      ? 'border-alert bg-alert text-void'
                      : 'border-term bg-term text-void'
                    : 'border-edge text-term/45 hover:text-term'
                )}
              >
                {k}
              </button>
            ))}
          </div>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div>
              <Label>Target teams</Label>
              <div className="mb-2 flex gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSelected(allSelected ? [] : (teams ?? []).map((t) => t.id))}
                >
                  <Users /> {allSelected ? 'Clear all' : 'Select all'}
                </Button>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {teams?.map((t) => {
                  const on = selected.includes(t.id)
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() =>
                        setSelected((prev) =>
                          on ? prev.filter((id) => id !== t.id) : [...prev, t.id]
                        )
                      }
                      className={cn(
                        'truncate border px-1 py-1.5 text-[10px] font-bold transition-colors',
                        on
                          ? 'border-term bg-term text-void'
                          : 'border-edge text-term/50 hover:border-term/60 hover:text-term'
                      )}
                    >
                      {t.team_name.replace('TEAM ', 'T')}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <Label htmlFor="notif-title">Title</Label>
              <Input
                id="notif-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={kind === 'URGENT' ? 'CONTAINMENT BREACH' : 'Network advisory'}
                maxLength={128}
              />
            </div>

            <div>
              <Label htmlFor="notif-body">Message</Label>
              <textarea
                id="notif-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                placeholder="What must the operators do?"
                className="w-full border border-edge bg-black/60 px-3 py-2 font-mono text-sm text-term placeholder:text-term/30 focus:border-term focus:outline-none"
              />
            </div>

            {kind === 'URGENT' && (
              <div className="space-y-3 border border-alert/40 bg-alert/5 p-3">
                <div className="flex items-center gap-1.5 text-[10px] tracking-[0.14em] text-alert uppercase">
                  <Siren className="size-3.5" /> Urgent order settings
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="notif-min">Countdown (min)</Label>
                    <Input
                      id="notif-min"
                      type="number"
                      min={1}
                      value={minutes}
                      onChange={(e) => setMinutes(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div>
                    <Label htmlFor="notif-reward">Reward if done</Label>
                    <Input
                      id="notif-reward"
                      type="number"
                      min={0}
                      value={rewardCit}
                      onChange={(e) => setRewardCit(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div>
                    <Label htmlFor="notif-pcit">Penalty CIT$</Label>
                    <Input
                      id="notif-pcit"
                      type="number"
                      min={0}
                      value={penaltyCit}
                      onChange={(e) => setPenaltyCit(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div>
                    <Label htmlFor="notif-pnrg">Penalty energy</Label>
                    <Input
                      id="notif-pnrg"
                      type="number"
                      min={0}
                      value={penaltyEnergy}
                      onChange={(e) => setPenaltyEnergy(e.target.value)}
                      className="h-9"
                    />
                  </div>
                </div>

                <p className="text-[10px] leading-snug text-term/45">
                  The penalty is charged automatically if the countdown runs out before you validate
                  the order below.
                </p>
              </div>
            )}

            <Button
              type="submit"
              variant={kind === 'URGENT' ? 'danger' : 'default'}
              className="w-full"
              disabled={send.isPending}
            >
              <Send /> {send.isPending ? 'Transmitting…' : `Send to ${selected.length} team(s)`}
            </Button>
          </CardContent>
        </form>
      </Card>

      {/* ---------------- SENT / OPEN ---------------- */}
      <Card>
        <CardHeader>
          <CardTitle>Transmissions log</CardTitle>
          <Badge variant="warn">
            {sent?.filter((n) => n.kind === 'URGENT' && n.status === 'SENT').length ?? 0} open urgent
          </Badge>
        </CardHeader>
        <CardContent className="max-h-[70vh] space-y-2 overflow-y-auto">
          {!sent?.length ? (
            <EmptyState>NOTHING SENT YET.</EmptyState>
          ) : (
            sent.map((n) => (
              <SentRow
                key={n.id}
                notification={n}
                busy={resolve.isPending}
                onResolve={(outcome) => resolve.mutate({ id: n.id, outcome })}
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function SentRow({
  notification, busy, onResolve,
}: {
  notification: AdminNotification
  busy: boolean
  onResolve: (o: 'COMPLETED' | 'FAILED') => void
}) {
  const left = useTimeLeft(notification.status === 'SENT' ? notification.deadline_at : null)
  const urgent = notification.kind === 'URGENT'
  const open = notification.status === 'SENT'

  return (
    <div
      className={cn(
        'border p-3',
        urgent ? 'border-alert/40 bg-alert/5' : 'border-edge bg-black/40'
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={urgent ? 'alert' : 'muted'}>{notification.kind}</Badge>
        <span className="text-xs font-bold text-term">{notification.team_name}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-term/70">{notification.title}</span>
        <Badge
          variant={
            notification.status === 'COMPLETED' ? 'default'
              : notification.status === 'SENT' ? 'warn' : 'alert'
          }
        >
          {notification.status}
        </Badge>
      </div>

      <p className="mt-1.5 line-clamp-2 text-[11px] text-term/50">{notification.body}</p>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-term/30">
        <span>{timeAgo(notification.created_at)}</span>
        {notification.sent_by && <span>· {notification.sent_by}</span>}
        {notification.acknowledged_at && <span className="text-term/50">· acknowledged</span>}
        {left !== null && (
          <span className={cn('flex items-center gap-1', left <= 0 ? 'text-alert' : 'text-warn')}>
            <Clock className="size-3" />
            {formatDuration(left)}
          </span>
        )}
      </div>

      {urgent && open && (
        <div className="mt-2.5 flex gap-1.5">
          <Button size="sm" disabled={busy} onClick={() => onResolve('COMPLETED')}>
            <Check /> Done · +{notification.reward_cit}
          </Button>
          <Button variant="danger" size="sm" disabled={busy} onClick={() => onResolve('FAILED')}>
            <X /> Fail · −{notification.penalty_cit}
            {notification.penalty_energy > 0 && `/−${notification.penalty_energy}`}
          </Button>
        </div>
      )}
    </div>
  )
}
