import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { apiGet, apiPost } from '@/lib/api'
import { connectSocket, disconnectSocket } from '@/lib/socket'
import { formatCIT } from '@/lib/utils'
import { GameContext, type GameContextValue } from './game-context'
import type {
  EndgameProgress, InventoryEntry, Notification, Phase, Wallet,
} from '@/types'
import type { GameState } from '@/types'

const EMPTY_ENDGAME: EndgameProgress = { solved: 0, total: 0 }

/**
 * Three operators share one wallet, so the balance shown on each phone has
 * to be the server's number, not a local guess. REST gives the first value;
 * the socket keeps it true after that. Optimistic local arithmetic is
 * deliberately avoided — two simultaneous purchases would drift apart.
 */
export function GameProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [wallet, setWallet] = useState<Wallet>({ balance: 0, coreEnergy: 0 })
  const [inventory, setInventory] = useState<InventoryEntry[]>([])
  const [onlineOperators, setOnlineOperators] = useState<string[]>([])

  const { data, isLoading } = useQuery({
    queryKey: ['game-state'],
    queryFn: () => apiGet<GameState>('/game/state'),
    refetchOnWindowFocus: true,
  })

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => apiGet<Notification[]>('/game/notifications'),
    refetchInterval: 30_000,
  })

  useEffect(() => {
    if (!data) return
    setWallet({ balance: data.team.cit_balance, coreEnergy: data.team.core_energy })
    setInventory(data.inventory)
  }, [data])

  const invalidateAll = useCallback(() => {
    for (const key of ['game-state', 'challenges', 'missions', 'endgame', 'items', 'notifications']) {
      queryClient.invalidateQueries({ queryKey: [key] })
    }
  }, [queryClient])

  useEffect(() => {
    const socket = connectSocket()

    socket.on('wallet_update', (payload: Wallet) => setWallet(payload))
    socket.on('inventory_update', ({ inventory: inv }: { inventory: InventoryEntry[] }) => setInventory(inv))

    socket.on('phase_change', () => {
      invalidateAll()
      toast('SYSTEM MESSAGE', { description: 'THE CORE HAS CHANGED THE PROTOCOL PHASE.' })
    })

    socket.on('mission_unlocked', () => {
      queryClient.invalidateQueries({ queryKey: ['missions'] })
    })

    socket.on('mission_resolved', ({ outcome, missionName }: { outcome: string; missionName: string }) => {
      invalidateAll()
      toast(outcome === 'COMPLETED' ? 'MISSION COMPLETE' : 'MISSION FAILED', { description: missionName })
    })

    // Urgent messages drive a blocking modal, so the list has to refresh
    // the instant one lands rather than on the next poll.
    socket.on('notification', (notif: Notification) => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      if (notif.kind === 'NORMAL') {
        toast('MESSAGE FROM THE CORE', { description: notif.title })
      }
    })

    socket.on('notification_resolved', ({ outcome, title }: { outcome: string; title: string }) => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['game-state'] })
      toast(
        outcome === 'COMPLETED' ? 'ORDER COMPLETE' : outcome === 'EXPIRED' ? 'ORDER EXPIRED' : 'ORDER FAILED',
        { description: title }
      )
    })

    socket.on('team_locked', ({ locked }: { locked: boolean }) => {
      toast(locked ? 'ACCOUNT FROZEN' : 'ACCOUNT RESTORED', {
        description: locked ? 'THE CORE HAS SUSPENDED YOUR TEAM.' : 'ACCESS REESTABLISHED.',
      })
    })

    socket.on('operator_online', ({ nickname }: { nickname: string }) =>
      setOnlineOperators((prev) => (prev.includes(nickname) ? prev : [...prev, nickname]))
    )
    socket.on('operator_offline', ({ nickname }: { nickname: string }) =>
      setOnlineOperators((prev) => prev.filter((n) => n !== nickname))
    )

    return () => {
      socket.removeAllListeners()
      disconnectSocket()
    }
  }, [queryClient, invalidateAll])

  /**
   * A teammate spending money is worth a heads-up, not a silent number
   * change. The ref starts unset so the jump from the placeholder zero to
   * the first real balance is not announced as a credit on every page load.
   */
  const lastBalance = useRef<number | null>(null)
  useEffect(() => {
    if (!data) return
    const previous = lastBalance.current
    lastBalance.current = wallet.balance
    if (previous === null || previous === wallet.balance) return

    const delta = wallet.balance - previous
    toast(delta > 0 ? 'CREDIT RECEIVED' : 'DEBIT REGISTERED', {
      description: `${delta > 0 ? '+' : ''}${delta} CIT$ — balance ${formatCIT(wallet.balance)}`,
    })
  }, [wallet.balance, data])

  const acknowledge = useCallback(
    (id: number) => {
      apiPost(`/game/notifications/${id}/ack`)
        .catch(() => undefined)
        .finally(() => queryClient.invalidateQueries({ queryKey: ['notifications'] }))
    },
    [queryClient]
  )

  const markRead = useCallback(
    (id: number) => {
      apiPost(`/game/notifications/${id}/read`)
        .catch(() => undefined)
        .finally(() => queryClient.invalidateQueries({ queryKey: ['notifications'] }))
    },
    [queryClient]
  )

  const phase = data?.phase
  const isPhaseOpen = useCallback((p: Phase) => phase?.phase === p, [phase])

  const urgentQueue = useMemo(
    () =>
      notifications
        .filter((n) => n.kind === 'URGENT' && n.status === 'SENT' && !n.acknowledged_at)
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [notifications]
  )

  const unreadCount = useMemo(
    () =>
      notifications.filter((n) => (n.kind === 'URGENT' ? n.status === 'SENT' : !n.read_at)).length,
    [notifications]
  )

  const value = useMemo<GameContextValue>(
    () => ({
      state: data,
      wallet,
      inventory,
      endgame: data?.endgame ?? EMPTY_ENDGAME,
      phase,
      isPhaseOpen,
      notifications,
      unreadCount,
      urgentQueue,
      acknowledge,
      markRead,
      loading: isLoading,
      onlineOperators,
    }),
    [
      data, wallet, inventory, phase, isPhaseOpen, notifications,
      unreadCount, urgentQueue, acknowledge, markRead, isLoading, onlineOperators,
    ]
  )

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}
