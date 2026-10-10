import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { Backpack, Bell, Lock, LogOut, Users, Zap } from 'lucide-react'
import { useAuth } from '@/store/auth-context'
import { useGame } from '@/store/game-context'
import { useTimeLeft } from '@/hooks/useNow'
import { cn, formatDuration } from '@/lib/utils'
import { Badge, itemTypeVariant } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Progress, StatMeter } from '@/components/ui/progress'
import { EmptyState, ItemIcon } from '@/components/fx'
import { NotificationList, UrgentOverlay } from '@/components/Notifications'
import type { Phase } from '@/types'

/**
 * Only one phase is playable at a time. The tabs for the others carry a
 * padlock, and the pages themselves render a locked state — the server
 * refuses the requests anyway, this just makes the rule visible.
 */
const TABS: { to: string; label: string; end?: boolean; phase?: Phase }[] = [
  { to: '/', label: 'HOME', end: true },
  { to: '/challenges', label: 'CHALLENGES', phase: 'CHALLENGES' },
  { to: '/missions', label: 'MISSIONS', phase: 'MISSIONS' },
  { to: '/endgame', label: 'ENDGAME', phase: 'ENDGAME' },
  { to: '/market', label: 'MARKET' },
  { to: '/story', label: 'STORY' },
]

const PHASE_LABEL: Record<Phase, string> = {
  LOBBY: 'STANDBY — ALL PHASES SEALED',
  CHALLENGES: 'PHASE I — DIGITAL ARENA',
  MISSIONS: 'PHASE II — FIELD OPERATIONS',
  ENDGAME: 'PHASE III — RECOVERY PROTOCOL',
  CLOSED: 'NETWORK LOCKED',
}

export function OperatorLayout() {
  const { team, logout } = useAuth()
  const location = useLocation()
  const { wallet, inventory, state, endgame, phase, unreadCount, onlineOperators } = useGame()
  const [openPanel, setOpenPanel] = useState<'team' | 'inventory' | 'alerts' | null>(null)

  const timeLeft = useTimeLeft(phase?.phase_ends_at)
  const solved = state?.solvedChallenges ?? []
  const count = (c: string) => solved.filter((s) => s.category === c).length
  const itemCount = inventory.reduce((sum, i) => sum + i.quantity, 0)
  const active = phase?.phase ?? 'LOBBY'
  const endgamePct = endgame.total > 0 ? Math.round((endgame.solved / endgame.total) * 100) : 0

  return (
    <div className="relative z-10 flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-term/30 bg-black/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-2.5 sm:px-4">
          {/* Wallet: CIT$ with Core Energy directly underneath. */}
          <button
            onClick={() => setOpenPanel('team')}
            className="group flex items-center gap-2.5 text-left sm:gap-3"
            aria-label="Open team panel"
          >
            <span className="flex size-10 shrink-0 items-center justify-center border border-warn/60 bg-black text-warn transition-colors group-hover:border-warn sm:size-11">
              <Users className="size-5" />
            </span>
            <span className="leading-tight">
              <span className="block font-display text-[11px] tracking-[0.14em] text-term/60">
                {team?.teamName ?? 'TEAM --'}
              </span>
              <span className="block text-sm font-bold tabular-nums text-term">
                {wallet.balance.toLocaleString()} CIT$
              </span>
              <span className="flex items-center gap-1 text-[11px] tabular-nums text-info">
                <Zap className="size-3" />
                {wallet.coreEnergy} NRG
              </span>
            </span>
          </button>

          <div className="flex items-center gap-2">
            <IconButton
              label="Open transmissions"
              onClick={() => setOpenPanel('alerts')}
              tone="alert"
              badge={unreadCount}
            >
              <Bell className="size-5" />
            </IconButton>

            <IconButton
              label="Open inventory"
              onClick={() => setOpenPanel('inventory')}
              tone="item"
              badge={itemCount}
            >
              <Backpack className="size-5" />
            </IconButton>
          </div>
        </div>

        {/* Phase strip: what is open, and how long is left. */}
        <div className="border-t border-edge bg-black/60">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-3 py-1.5 sm:px-4">
            <span
              className={cn(
                'truncate text-[10px] tracking-[0.16em] uppercase',
                active === 'LOBBY' || active === 'CLOSED' ? 'text-term/40' : 'text-term'
              )}
            >
              {PHASE_LABEL[active]}
            </span>
            {timeLeft !== null && (
              <span
                className={cn(
                  'shrink-0 font-display text-sm tabular-nums',
                  timeLeft < 5 * 60_000 ? 'animate-blink text-alert' : 'text-warn'
                )}
              >
                {formatDuration(timeLeft)}
              </span>
            )}
          </div>
        </div>

        <nav className="mx-auto flex max-w-6xl overflow-x-auto border-t border-edge">
          {TABS.map((tab) => {
            const locked = tab.phase !== undefined && tab.phase !== active
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  cn(
                    'nav-tab flex flex-1 shrink-0 items-center justify-center gap-1 border-r border-edge px-3 py-2.5 text-[10px] font-bold tracking-[0.12em] whitespace-nowrap uppercase last:border-r-0 sm:text-[11px]',
                    isActive
                      ? 'text-term text-glow'
                      : locked
                        ? 'text-term/20 hover:text-term/40'
                        : 'text-term/45 hover:text-term/80'
                  )
                }
              >
                {({ isActive }) => (
                  <span className="flex items-center gap-1">
                    {locked && <Lock className="size-3" />}
                    {tab.label}
                    {isActive && null}
                  </span>
                )}
              </NavLink>
            )
          })}
        </nav>
      </header>

      <main key={location.pathname} className="page-transition mx-auto w-full max-w-6xl flex-1 px-3 py-5 sm:px-4 sm:py-6">
        <Outlet />
      </main>

      <footer className="border-t border-edge px-4 py-3 text-center text-[10px] tracking-[0.16em] text-term/30 uppercase">
        CIT: 404 — Recovery Protocol · Operator {team?.nickname}
      </footer>

      {/* ---------------- TEAM PANEL ---------------- */}
      <Dialog open={openPanel === 'team'} onOpenChange={(o) => setOpenPanel(o ? 'team' : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{team?.teamName}</DialogTitle>
            <DialogDescription>Shared account · {team?.nickname}</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="border border-edge bg-black/40 p-3">
                <div className="text-[10px] tracking-[0.14em] text-term/50 uppercase">Wallet</div>
                <div className="mt-1 font-display text-xl tabular-nums text-term text-glow">
                  {wallet.balance.toLocaleString()}
                </div>
                <div className="text-[10px] text-term/40">CIT$</div>
              </div>
              <div className="border border-edge bg-black/40 p-3">
                <div className="text-[10px] tracking-[0.14em] text-term/50 uppercase">Core Energy</div>
                <div className="mt-1 flex items-center gap-1 font-display text-xl tabular-nums text-info">
                  <Zap className="size-4" />
                  {wallet.coreEnergy}
                </div>
                <div className="text-[10px] text-term/40">Restoration progress</div>
              </div>
            </div>

            {/* Endgame progress lives here as well as on its own tab. */}
            <div className="border border-edge bg-black/40 p-3">
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] tracking-[0.14em] text-term/50 uppercase">
                  Story recovered
                </span>
                <span className="font-display text-lg tabular-nums text-warn">{endgamePct}%</span>
              </div>
              <Progress
                value={endgame.solved}
                max={Math.max(1, endgame.total)}
                tone="warn"
                className="mt-2"
                label="Endgame progress"
              />
              <div className="mt-1 text-[10px] text-term/35">
                {endgame.solved} / {endgame.total} fragments
              </div>
            </div>

            <div className="space-y-3">
              <StatMeter label="CP Solved" value={count('CP')} max={7} />
              <StatMeter label="CTF Solved" value={count('CTF')} max={15} tone="info" />
              <StatMeter
                label="Missions Deployed"
                value={state?.missions.length ?? 0}
                max={4}
                tone="item"
              />
            </div>

            {onlineOperators.length > 0 && (
              <div>
                <div className="mb-2 text-[10px] tracking-[0.14em] text-term/50 uppercase">
                  Operators online
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {onlineOperators.map((n) => (
                    <Badge key={n}>{n}</Badge>
                  ))}
                </div>
              </div>
            )}

            <Button variant="danger" className="w-full" onClick={logout}>
              <LogOut /> Disconnect operator
            </Button>
          </DialogBody>
        </DialogContent>
      </Dialog>

      {/* ---------------- TRANSMISSIONS ---------------- */}
      <Dialog open={openPanel === 'alerts'} onOpenChange={(o) => setOpenPanel(o ? 'alerts' : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transmissions</DialogTitle>
            <DialogDescription>Messages sent to your team by THE CORE.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <NotificationList />
          </DialogBody>
        </DialogContent>
      </Dialog>

      {/* ---------------- INVENTORY ---------------- */}
      <Dialog open={openPanel === 'inventory'} onOpenChange={(o) => setOpenPanel(o ? 'inventory' : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Inventory</DialogTitle>
            <DialogDescription>
              Shared across all three operators · apply items from here or from a mission panel
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {inventory.length === 0 ? (
              <EmptyState>NO ASSETS ACQUIRED. VISIT THE MARKET.</EmptyState>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {inventory.map((item) => (
                  <li key={item.id} className="flex gap-3 border border-edge bg-black/40 p-3">
                    <span className="flex size-9 shrink-0 items-center justify-center border border-edge text-term/70">
                      <ItemIcon name={item.icon} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-bold">{item.name}</span>
                        <span className="text-xs font-bold tabular-nums text-term">×{item.quantity}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Badge variant={itemTypeVariant(item.item_type)}>{item.item_type}</Badge>
                        {item.applies_to === 'MISSION' && <Badge variant="muted">use on a mission</Badge>}
                      </div>
                      <p className="mt-1.5 text-[11px] leading-snug text-term/50">{item.effect}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>

      <UrgentOverlay />
    </div>
  )
}

function IconButton({
  children, label, onClick, tone, badge,
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
  tone: 'alert' | 'item'
  badge: number
}) {
  const colour = tone === 'alert'
    ? 'border-alert/60 text-alert group-hover:border-alert'
    : 'border-item/60 text-item group-hover:border-item'
  const badgeColour = tone === 'alert' ? 'border-alert text-alert' : 'border-item text-item'

  return (
    <button onClick={onClick} className="group relative" aria-label={label}>
      <span
        className={cn(
          'flex size-10 items-center justify-center border bg-black transition-colors sm:size-11',
          colour
        )}
      >
        {children}
      </span>
      {badge > 0 && (
        <span
          className={cn(
            'absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center border bg-black text-[10px] font-bold',
            badgeColour
          )}
        >
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  )
}
