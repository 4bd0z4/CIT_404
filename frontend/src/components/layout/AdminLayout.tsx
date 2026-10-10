import { NavLink, Outlet } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BarChart3, Bell, Boxes, Flag, LogOut, Package, Radio, ScrollText, Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/store/auth-context'
import { apiGet, apiPost, ApiError } from '@/lib/api'
import { useTimeLeft } from '@/hooks/useNow'
import { cn, formatDuration } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { AdminOverview, Phase } from '@/types'

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: BarChart3, end: true },
  { to: '/admin/teams', label: 'Teams', icon: Users },
  { to: '/admin/missions', label: 'Missions', icon: Radio },
  { to: '/admin/endgame', label: 'Endgame', icon: Flag },
  { to: '/admin/alerts', label: 'Alerts', icon: Bell },
  { to: '/admin/items', label: 'Items', icon: Package },
  { to: '/admin/inventory', label: 'Inventory', icon: Boxes },
  { to: '/admin/ledger', label: 'Ledger', icon: ScrollText },
]

const PHASES: { value: Phase; short: string }[] = [
  { value: 'LOBBY', short: 'LOBBY' },
  { value: 'CHALLENGES', short: 'CHALL' },
  { value: 'MISSIONS', short: 'MISS' },
  { value: 'ENDGAME', short: 'END' },
  { value: 'CLOSED', short: 'CLOSED' },
]

export function AdminLayout() {
  const { admin, logout } = useAuth()
  const queryClient = useQueryClient()
  // Mission staff only validate field missions: the overview and phase APIs
  // are closed to them, so do not call them or show their controls.
  const missionOnly = admin?.role === 'mission_admin'
  const nav = missionOnly ? NAV.filter((n) => n.to === '/admin/missions') : NAV

  const { data } = useQuery({
    queryKey: ['admin-overview'],
    queryFn: () => apiGet<AdminOverview>('/admin/overview'),
    refetchInterval: 10_000,
    enabled: !missionOnly,
  })

  const timeLeft = useTimeLeft(data?.phase.phase_ends_at)

  const setPhase = useMutation({
    mutationFn: (target: Phase) => apiPost('/admin/phase', { phase: target }),
    onSuccess: (_res, target) => {
      toast('PROTOCOL PHASE UPDATED', { description: target })
      queryClient.invalidateQueries({ queryKey: ['admin-overview'] })
    },
    onError: (err) =>
      toast('PHASE CHANGE FAILED', {
        description: err instanceof ApiError ? err.message : 'REQUEST FAILED.',
      }),
  })

  const current = data?.phase.phase
  const openUrgent = data?.totals.open_urgent ?? 0

  return (
    <div className="relative z-10 flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-warn/30 bg-black/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-2.5">
          <div className="mr-auto">
            <div className="font-display text-sm tracking-[0.2em] text-warn">CORE SUPERVISION</div>
            <div className="text-[10px] tracking-[0.14em] text-term/40 uppercase">
              {admin?.username} · {admin?.role}
            </div>
          </div>

          {/* Switching phase is the single most consequential control here:
              it locks every other tab for every team at once. */}
          {!missionOnly && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-1 text-[10px] tracking-[0.14em] text-term/35 uppercase">Phase</span>
            {PHASES.map((p) => (
              <button
                key={p.value}
                onClick={() => setPhase.mutate(p.value)}
                disabled={setPhase.isPending}
                className={cn(
                  'border px-2 py-1 text-[10px] font-bold tracking-[0.08em] transition-colors',
                  current === p.value
                    ? 'border-warn bg-warn text-void'
                    : 'border-edge text-term/50 hover:border-warn/60 hover:text-warn'
                )}
              >
                {p.short}
              </button>
            ))}
            {timeLeft !== null && (
              <span
                className={cn(
                  'ml-2 font-display text-sm tabular-nums',
                  timeLeft < 5 * 60_000 ? 'animate-blink text-alert' : 'text-warn'
                )}
              >
                {formatDuration(timeLeft)}
              </span>
            )}
          </div>
          )}

          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOut /> Exit
          </Button>
        </div>

        <nav className="mx-auto flex max-w-7xl overflow-x-auto border-t border-edge">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex shrink-0 items-center gap-1.5 border-r border-edge px-3.5 py-2.5 text-[11px] font-bold tracking-[0.1em] uppercase transition-colors',
                  isActive
                    ? 'bg-warn/10 text-warn shadow-[inset_0_-2px_0_0_var(--color-warn)]'
                    : 'text-term/45 hover:bg-term/5 hover:text-term/80'
                )
              }
            >
              <Icon className="size-3.5" />
              {label}
              {to === '/admin/alerts' && openUrgent > 0 && (
                <span className="ml-1 border border-alert px-1 text-[9px] text-alert">{openUrgent}</span>
              )}
            </NavLink>
          ))}
          {data && (
            <div className="ml-auto flex shrink-0 items-center gap-2 px-4">
              <Badge variant="muted">{data.totals.active_sessions} devices</Badge>
              <Badge variant="info">{data.totals.circulating.toLocaleString()} CIT$ live</Badge>
            </div>
          )}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
