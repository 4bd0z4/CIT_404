import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCIT(n: number | null | undefined) {
  return `${(n ?? 0).toLocaleString('en-US')} CIT$`
}

export function stars(n: number) {
  return '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n))
}

export function timeAgo(iso: string | null | undefined) {
  if (!iso) return '--'
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

/** `01:23:45` past an hour, `23:45` below it. Empty deadline gives null. */
export function formatDuration(ms: number | null | undefined) {
  if (ms === null || ms === undefined) return null
  if (ms <= 0) return 'EXPIRED'
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

export function countdown(iso: string | null | undefined) {
  if (!iso) return null
  return formatDuration(new Date(iso).getTime() - Date.now())
}

export const DIFFICULTY_ORDER = ['EASY', 'MEDIUM', 'HARD'] as const

export const DIFFICULTY_LABEL: Record<string, string> = {
  EASY: 'EASY',
  MEDIUM: 'MEDIUM',
  HARD: 'HARD',
}

/** Difficulty drives colour everywhere it appears, so it is defined once. */
export const DIFFICULTY_TONE: Record<string, { text: string; border: string; bg: string }> = {
  EASY:   { text: 'text-term',  border: 'border-term',  bg: 'bg-term/10' },
  MEDIUM: { text: 'text-warn',  border: 'border-warn',  bg: 'bg-warn/10' },
  HARD:   { text: 'text-alert', border: 'border-alert', bg: 'bg-alert/10' },
}
