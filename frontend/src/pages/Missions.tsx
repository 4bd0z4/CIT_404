import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronLeft, ChevronRight, Clock, Coins, HandCoins, KeyRound, Lock,
  MapPin, Navigation, Rocket, Sparkles, Unlock, Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiGet, apiPost, ApiError } from '@/lib/api'
import { cn, DIFFICULTY_TONE, formatDuration } from '@/lib/utils'
import { useGame } from '@/store/game-context'
import { useTimeLeft } from '@/hooks/useNow'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState, ItemIcon } from '@/components/fx'
import { PhaseLocked } from '@/components/PhaseGate'
import type { Difficulty, InventoryEntry, Mission, MissionTier } from '@/types'

export function Missions() {
  const { isPhaseOpen, wallet, inventory } = useGame()

  const { data, isLoading } = useQuery({
    queryKey: ['missions'],
    queryFn: () => apiGet<{ locked: boolean; missions: Mission[] }>('/game/missions'),
    refetchInterval: 30_000,
  })

  if (!isPhaseOpen('MISSIONS') || data?.locked) {
    return <PhaseLocked title="Missions — Phase II" phase="MISSIONS" />
  }
  if (isLoading) return <EmptyState>SCANNING TERRITORY FOR RECOVERY MISSIONS…</EmptyState>

  const missions = data?.missions ?? []
  const special = missions.filter((m) => m.kind === 'SPECIAL')
  const standard = missions.filter((m) => m.kind !== 'SPECIAL')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="font-display text-lg tracking-[0.18em] text-term uppercase">
            Field Missions · Phase II
          </h2>
          <p className="mt-0.5 text-[11px] text-term/45">
            Find the location, get the access code on site, then choose how hard you want it.
          </p>
        </div>
        <Badge>{wallet.balance.toLocaleString()} CIT$</Badge>
      </div>

      {special.map((m) => (
        <MissionCard key={m.id} mission={m} balance={wallet.balance} inventory={inventory} />
      ))}

      <div className="grid gap-3 lg:grid-cols-2">
        {standard.map((m) => (
          <MissionCard key={m.id} mission={m} balance={wallet.balance} inventory={inventory} />
        ))}
      </div>
    </div>
  )
}

function MissionCard({
  mission, balance, inventory,
}: { mission: Mission; balance: number; inventory: InventoryEntry[] }) {
  const queryClient = useQueryClient()
  const isSpecial = mission.kind === 'SPECIAL'

  const tiers = mission.tiers ?? []
  const [tierIndex, setTierIndex] = useState(() => Math.min(1, Math.max(0, tiers.length - 1)))
  const tier: MissionTier | undefined = tiers[tierIndex]

  const [code, setCode] = useState('')
  const deadline = useTimeLeft(mission.deadline_at)

  const owned = mission.team_status === 'PURCHASED' || mission.team_status === 'COMPLETED'

  /** Items the team actually holds that make sense on a mission. */
  const usableItems = useMemo(
    () => inventory.filter((i) => i.quantity > 0 && (i.applies_to === 'MISSION' || i.applies_to === 'ANY')),
    [inventory]
  )

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['missions'] })
    queryClient.invalidateQueries({ queryKey: ['game-state'] })
    queryClient.invalidateQueries({ queryKey: ['items'] })
  }

  const onError = (err: unknown) =>
    toast('ACTION DENIED', {
      description: err instanceof ApiError ? err.message : 'TRANSACTION FAILED.',
    })

  const unlock = useMutation({
    mutationFn: () => apiPost('/game/missions/unlock', { missionCode: mission.code, code }),
    onSuccess: () => {
      toast('ACCESS GRANTED', { description: `${mission.mission_name} is now deployable.` })
      setCode('')
      refresh()
    },
    onError,
  })

  const buy = useMutation({
    mutationFn: () =>
      apiPost('/game/missions/purchase', { missionCode: mission.code, difficulty: tier?.difficulty }),
    onSuccess: () => {
      toast('MISSION DEPLOYED', { description: `${mission.mission_name} — ${tier?.difficulty}` })
      refresh()
    },
    onError,
  })

  const useItem = useMutation({
    mutationFn: (itemCode: string) =>
      apiPost<{ revealed?: { coordinates?: string } }>('/game/items/use', {
        itemCode,
        missionCode: mission.code,
      }),
    onSuccess: (res, itemCode) => {
      const coords = res.revealed?.coordinates
      toast(coords ? 'COORDINATES DECRYPTED' : 'ITEM APPLIED', {
        description: coords ?? `${itemCode} applied to ${mission.mission_name}.`,
      })
      refresh()
    },
    onError,
  })

  const affordable = tier ? balance >= tier.entryCost : false
  const tone = tier ? DIFFICULTY_TONE[tier.difficulty] : DIFFICULTY_TONE.EASY

  return (
    <Card
      className={cn(
        isSpecial && 'border-info/60 bg-info/5 shadow-[0_0_40px_-18px_var(--color-info)]',
        owned && !isSpecial && 'border-term/50'
      )}
    >
      {isSpecial && (
        <div className="flex items-center justify-center gap-2 border-b border-info/40 bg-info/10 px-4 py-1.5">
          <HandCoins className="size-3.5 text-info" />
          <span className="text-[10px] font-bold tracking-[0.18em] text-info uppercase">
            Out of CIT$ ? Start here
          </span>
        </div>
      )}

      {/* Title centred, price on the right. */}
      <div className="relative flex items-center border-b border-edge px-4 py-3">
        <h3
          className={cn(
            'mx-auto text-center font-display text-base tracking-[0.16em] uppercase',
            isSpecial ? 'text-info' : 'text-term'
          )}
        >
          {mission.mission_name}
        </h3>
        <span
          className={cn(
            'absolute right-4 font-display text-sm tabular-nums',
            isSpecial ? 'text-info' : 'text-warn'
          )}
        >
          {tier ? (tier.entryCost === 0 ? 'FREE' : `${tier.entryCost} CIT$`) : '--'}
        </span>
      </div>

      <CardContent className="space-y-3">
        <p className="text-[11px] leading-relaxed text-term/65">{mission.description}</p>

        {/* Location intel: what the operators need to find the place. */}
        {/* Real location name revealed after unlock */}
        {mission.unlocked && mission.location_name && (
          <div className="mb-2 flex items-center gap-2 text-xs font-bold text-term">
            <span className="text-term/50">📍</span> {mission.location_name}
          </div>
        )}

        {mission.location_hint && (
          <div className="border-l-2 border-warn/50 bg-black/40 py-2.5 pr-3 pl-3">
            <div className="flex items-center gap-1.5 text-[10px] tracking-[0.14em] text-warn/70 uppercase">
              <MapPin className="size-3" /> Location intel
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-term/70">{mission.location_hint}</p>
            {mission.coordinates && (
              <p className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-info">
                <Navigation className="size-3" /> {mission.coordinates}
              </p>
            )}
          </div>
        )}

        {/* Difficulty selector — hidden for the free supply run. */}
        {!isSpecial && tiers.length > 1 && (
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => setTierIndex((i) => Math.max(0, i - 1))}
              disabled={tierIndex === 0 || owned}
              className="border border-edge p-1.5 text-term/60 transition-colors hover:border-term hover:text-term disabled:opacity-25"
              aria-label="Easier"
            >
              <ChevronLeft className="size-4" />
            </button>

            <div
              className={cn(
                'flex h-16 w-40 flex-col items-center justify-center border-2 transition-colors',
                tone.border, tone.bg
              )}
            >
              <span className={cn('font-display text-lg tracking-[0.18em]', tone.text)}>
                {tier?.difficulty}
              </span>
              <span className="text-[9px] tracking-[0.12em] text-term/40 uppercase">
                {tierIndex + 1} / {tiers.length}
              </span>
            </div>

            <button
              onClick={() => setTierIndex((i) => Math.min(tiers.length - 1, i + 1))}
              disabled={tierIndex === tiers.length - 1 || owned}
              className="border border-edge p-1.5 text-term/60 transition-colors hover:border-term hover:text-term disabled:opacity-25"
              aria-label="Harder"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        )}

        {/* What this tier costs and pays. */}
        {tier && (
          <div className="grid grid-cols-3 gap-2 border-y border-edge py-2.5 text-center">
            <Meta icon={<Coins className="size-3" />} label="Cost" value={tier.entryCost} tone="text-warn" />
            <Meta label="Reward" value={tier.reward} tone="text-term" />
            <Meta icon={<Zap className="size-3" />} label="Energy" value={tier.coreEnergy} tone="text-info" />
          </div>
        )}

        {/* Items replace the old insurance checkbox: apply whatever you own. */}
        {!isSpecial && usableItems.length > 0 && (
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-[10px] tracking-[0.14em] text-item/70 uppercase">
              <Sparkles className="size-3" /> Apply an item
            </div>
            <div className="flex flex-wrap gap-1.5">
              {usableItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => useItem.mutate(item.code)}
                  disabled={useItem.isPending}
                  title={item.effect}
                  className="flex items-center gap-1.5 border border-item/40 bg-item/5 px-2 py-1 text-[10px] text-item transition-colors hover:bg-item/15 disabled:opacity-40"
                >
                  <ItemIcon name={item.icon} className="size-3" />
                  {item.name}
                  <span className="text-item/60">×{item.quantity}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* --------- DEPLOY BOX: amber until the location is reached --------- */}
        {owned ? (
          <div className="border border-term/50 bg-term/5 p-3 text-center">
            <div className="text-[11px] tracking-[0.14em] text-term uppercase">
              {mission.team_status === 'COMPLETED' ? 'Mission complete' : 'Mission active'}
              {mission.team_difficulty && ` · ${mission.team_difficulty}`}
            </div>
            {mission.assigned_task_label && (
              <div className="mt-3 border-2 border-warn/70 bg-warn/5 p-3 text-left">
                <div className="text-[10px] font-bold tracking-[0.16em] text-warn uppercase">
                  Your task
                </div>
                <div className="mt-1 font-display text-base tracking-[0.1em] text-warn">
                  {mission.assigned_task_label}
                </div>
                {mission.assigned_task_description && (
                  <p className="mt-1.5 text-xs leading-relaxed whitespace-pre-line text-term/80">
                    {mission.assigned_task_description}
                  </p>
                )}
              </div>
            )}
            {deadline !== null && mission.team_status === 'PURCHASED' && (
              <div
                className={cn(
                  'mt-1 flex items-center justify-center gap-1.5 font-display text-2xl tabular-nums',
                  deadline < 5 * 60_000 ? 'animate-blink text-alert' : 'text-warn'
                )}
              >
                <Clock className="size-5" />
                {formatDuration(deadline)}
              </div>
            )}
          </div>
        ) : !mission.unlocked ? (
          <div className="border-2 border-warn/70 bg-warn/5 p-3">
            <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.14em] text-warn uppercase">
              <Lock className="size-3.5" /> Location not reached
            </div>
            <p className="mt-1.5 text-[11px] leading-snug text-term/65">
              Find the location and ask an admin for the access code — or spend a{' '}
              <span className="text-info">Location Coordinates</span> item to learn where it is.
            </p>
            <form
              className="mt-2.5 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (code.trim()) unlock.mutate()
              }}
            >
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ACCESS CODE"
                className="h-9 flex-1 tracking-[0.2em]"
                autoComplete="off"
                aria-label={`Access code for ${mission.mission_name}`}
              />
              <Button type="submit" variant="warn" size="sm" disabled={unlock.isPending || !code.trim()}>
                <KeyRound /> {unlock.isPending ? '…' : 'Unlock'}
              </Button>
            </form>
          </div>
        ) : (
          <div className="border-2 border-term/70 bg-term/5 p-3">
            <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.14em] text-term uppercase">
              <Unlock className="size-3.5" /> Access granted
            </div>
            <Button
              className="mt-2.5 w-full"
              variant={affordable ? 'default' : 'outline'}
              disabled={!affordable || !tier || buy.isPending}
              onClick={() => buy.mutate()}
            >
              <Rocket />
              {!affordable
                ? 'Insufficient CIT$'
                : tier && tier.entryCost === 0
                  ? 'Claim the supply drop'
                  : `Deploy ${tier?.difficulty} — ${tier?.entryCost} CIT$`}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Meta({
  label, value, tone = 'text-term/80', icon,
}: { label: string; value: number; tone?: string; icon?: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-center gap-1 text-[10px] tracking-[0.12em] text-term/35 uppercase">
        {icon}
        {label}
      </div>
      <div className={cn('mt-0.5 font-display text-base tabular-nums', tone)}>{value}</div>
    </div>
  )
}

export type { Difficulty }
