export type Phase = 'LOBBY' | 'CHALLENGES' | 'MISSIONS' | 'ENDGAME' | 'CLOSED'
export type PlayablePhase = 'CHALLENGES' | 'MISSIONS' | 'ENDGAME'
export type ItemType = 'HINT' | 'INSURANCE' | 'BOOST' | 'ACCESS'
export type AppliesTo = 'ANY' | 'MISSION' | 'CHALLENGE' | 'ENDGAME'
export type Category = 'CP' | 'CTF' | 'DATA'
export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD'

export type LedgerKind =
  | 'CHALLENGE_REWARD' | 'FIRST_BLOOD' | 'ITEM_PURCHASE' | 'ITEM_USE'
  | 'MISSION_PURCHASE' | 'MISSION_REWARD' | 'ENDGAME_REWARD'
  | 'NOTIF_REWARD' | 'NOTIF_PENALTY' | 'DCR_REWARD' | 'ADMIN_ADJUST' | 'SEED'

export interface TeamSubject {
  kind: 'team'
  teamId: number
  teamName: string
  operatorId: number
  nickname: string
}

export interface AdminSubject {
  kind: 'admin'
  adminId: number
  username: string
  role: 'admin' | 'mission_admin' | 'superadmin'
}

export type Subject = TeamSubject | AdminSubject

export interface Team {
  id: number
  team_name: string
  cit_balance: number
  core_energy: number
}

export interface Wallet {
  balance: number
  coreEnergy: number
}

export interface PhaseConfigRow {
  phase: PlayablePhase
  duration_min: number
  label: string
}

export interface PhaseState {
  phase: Phase
  phase_started_at: string | null
  phase_ends_at: string | null
  config: PhaseConfigRow[]
}

export interface InventoryEntry {
  id: number
  code: string
  name: string
  item_type: ItemType
  icon: string
  cost: number
  effect: string
  payload: Record<string, unknown>
  applies_to: AppliesTo
  quantity: number
  total_bought: number
  total_used: number
}

export interface MarketItem {
  id: number
  code: string
  name: string
  item_type: ItemType
  cost: number
  icon: string
  effect: string
  payload: Record<string, unknown>
  applies_to: AppliesTo
  max_per_team: number | null
  stock: number | null
  owned: number
  total_bought: number
}

export interface Challenge {
  id: number
  code: string
  category: Category
  subcategory: 'Crypto' | 'OSINT' | 'Misc' | 'Steganography' | 'Web' | null
  difficulty: number
  reward: number
  core_energy: number
  first_blood_cit: number
  first_blood_energy: number
  title: string
  description: string | null
  resource_type: 'STATIC' | 'EXTERNAL' | 'DOWNLOAD' | 'SERVICE'
  resource_url: string | null
  instructions: string | null
  solved: boolean
  first_blood_taken: boolean
  has_hint1: boolean
  has_hint2: boolean
  hint1_revealed: boolean
  hint2_revealed: boolean
  hint1_text: string | null
  hint2_text: string | null
}

export interface MissionTier {
  difficulty: Difficulty
  entryCost: number
  reward: number
  coreEnergy: number
  timeLimitMin: number | null
}

export interface Mission {
  id: number
  code: string
  mission_name: string
  kind: 'STANDARD' | 'SPECIAL'
  description: string
  location_hint: string | null
  position: number
  unlocked: boolean
  /** Only present once the team spent a Location Coordinates item on it. */
  coordinates: string | null
  team_status: 'PURCHASED' | 'COMPLETED' | 'FAILED' | 'REFUNDED' | null
  team_difficulty: Difficulty | null
  deadline_at: string | null
  /** Random task the platform assigned at deploy time; null until deployed. */
  assigned_task_label: string | null
  assigned_task_description: string | null
  tiers: MissionTier[]
}

export interface EndgamePart {
  id: number
  position: number
  title: string
  prompt: string
  reward_cit: number
  reward_energy: number
  solved: boolean
  solved_at: string | null
  /** Null until this team has recovered the fragment. */
  story_fragment: string | null
}

export interface EndgameProgress {
  solved: number
  total: number
}

export interface Notification {
  id: number
  kind: 'NORMAL' | 'URGENT'
  title: string
  body: string
  deadline_at: string | null
  penalty_cit: number
  penalty_energy: number
  reward_cit: number
  status: 'SENT' | 'COMPLETED' | 'FAILED' | 'EXPIRED'
  read_at: string | null
  acknowledged_at: string | null
  resolved_at: string | null
  created_at: string
}

export interface GameState {
  team: Team
  phase: PhaseState
  inventory: InventoryEntry[]
  solvedChallenges: { id: number; code: string; category: Category }[]
  missions: {
    id: number
    status: string
    difficulty: Difficulty
    paid_amount: number
    purchased_at: string
    deadline_at: string | null
    code: string
    mission_name: string
  }[]
  endgame: EndgameProgress
  notifications: { unread: number; pending_urgent: number }
}

export interface LedgerRow {
  id: number
  kind: LedgerKind
  amount: number
  balance_after: number
  energy_delta: number
  energy_after: number
  quantity: number
  note: string | null
  created_at: string
  operator: string | null
  item_name?: string | null
  team_name?: string
}

export interface LeaderboardRow {
  team_name: string
  core_energy: number
  total_solved: number
  first_bloods: number
  missions_completed: number
  endgame_solved: number
  endgame_total: number
  rank: number
}

export interface TeamStats {
  id: number
  team_name: string
  cit_balance: number
  core_energy: number
  is_locked: boolean
  solved_cp: number
  solved_ctf: number
  solved_data: number
  first_bloods: number
  total_attempts: number
  wrong_attempts: number
  missions_bought: number
  missions_completed: number
  missions_failed: number
  endgame_solved: number
  endgame_total: number
  items_held: number
  items_bought: number
  total_earned: number
  total_spent: number
  open_urgent: number
  last_activity_at: string | null
  operator_count: number
}

export interface TeamItemRow {
  team_id: number
  team_name: string
  item_id: number
  code: string
  name: string
  item_type: ItemType
  icon: string
  cost: number
  quantity: number
  total_bought: number
  total_used: number
  updated_at: string
}

export interface AdminOverview {
  totals: {
    teams: number
    operators: number
    circulating: number
    energy_total: number
    total_issued: number
    total_spent: number
    solves: number
    attempts: number
    missions_bought: number
    endgame_solves: number
    open_urgent: number
    active_sessions: number
  }
  phase: PhaseState
  byCategory: { category: Category; solves: number; attempts: number }[]
  itemsSold: {
    code: string; name: string; item_type: ItemType
    units_sold: number; revenue: number; teams_owning: number
  }[]
  timeline: { t: string; earned: number | null; spent: number | null }[]
}

export interface AdminMission {
  id: number
  code: string
  mission_name: string
  kind: 'STANDARD' | 'SPECIAL'
  position: number
  description: string
  location_hint: string | null
  coordinates: string | null
  /** Admin-only: read out on site to a team that has reached the spot. */
  access_code: string | null
  is_active: boolean
  tiers: MissionTier[]
  purchases: number
  completed: number
  failed: number
  in_progress: number
  teams_unlocked: number
}

export interface AdminEndgamePart {
  id: number
  position: number
  title: string
  prompt: string
  access_code: string
  reward_cit: number
  reward_energy: number
  is_active: boolean
  teams_solved: number
  solved_by: string[]
}

export interface AdminNotification extends Notification {
  team_id: number
  team_name: string
  sent_by: string | null
}

export interface TeamDetail {
  team: TeamStats
  items: TeamItemRow[]
  ledger: LedgerRow[]
  missions: {
    id: number; status: string; difficulty: Difficulty; paid_amount: number
    purchased_at: string; deadline_at: string | null; resolved_at: string | null
    mission_name: string; code: string; reward: number
  }[]
  operators: { id: number; nickname: string; created_at: string }[]
  sessions: { id: string; user_agent: string | null; ip: string | null; created_at: string; expires_at: string }[]
  submissions: {
    code: string; category: Category; reward: number; is_correct: boolean
    is_first_blood: boolean; submitted_at: string; nickname: string | null
  }[]
  endgame: { position: number; title: string; solved_at: string | null }[]
  notifications: AdminNotification[]
  missionAccess: { code: string; mission_name: string; method: string; unlocked_at: string }[]
}
