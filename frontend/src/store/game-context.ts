import { createContext, useContext } from 'react'
import type {
  EndgameProgress, GameState, InventoryEntry, Notification, Phase, PhaseState, Wallet,
} from '@/types'

/** See the note in auth-context.ts: kept apart so Fast Refresh works. */
export interface GameContextValue {
  state: GameState | undefined
  wallet: Wallet
  inventory: InventoryEntry[]
  endgame: EndgameProgress
  phase: PhaseState | undefined
  /** True when `p` is the phase currently open for play. */
  isPhaseOpen: (p: Phase) => boolean
  notifications: Notification[]
  unreadCount: number
  /** Urgent messages the operators have not dismissed yet, oldest first. */
  urgentQueue: Notification[]
  acknowledge: (id: number) => void
  markRead: (id: number) => void
  loading: boolean
  onlineOperators: string[]
}

export const GameContext = createContext<GameContextValue | null>(null)

export function useGame() {
  const ctx = useContext(GameContext)
  if (!ctx) throw new Error('useGame must be used inside <GameProvider>')
  return ctx
}
