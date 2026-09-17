/**
 * The access token lives in this module's closure, never in localStorage.
 * An XSS payload can still call the API while the tab is open, but it
 * cannot lift a durable credential off disk, and the token dies in 15
 * minutes. The refresh token is an httpOnly cookie JS cannot read at all.
 */
let accessToken: string | null = null
let onUnauthorized: (() => void) | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function getAccessToken() {
  return accessToken
}

export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export interface SessionPayload {
  accessToken: string
  subject: unknown
}

let refreshInFlight: Promise<SessionPayload | null> | null = null

/**
 * Swaps the refresh cookie for a fresh access token.
 *
 * Single-flight, and every caller must come through here. The server
 * rotates the refresh token on each use, so two parallel calls would see
 * the second one present an already-spent cookie and get logged out —
 * which is exactly what React StrictMode's double-mount used to cause.
 */
export async function refreshSession(): Promise<SessionPayload | null> {
  if (!refreshInFlight) {
    refreshInFlight = fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    })
      .then(async (res) => {
        if (!res.ok) return null
        const data: SessionPayload = await res.json()
        accessToken = data.accessToken
        return data
      })
      .catch(() => null)
      .finally(() => {
        refreshInFlight = null
      })
  }
  return refreshInFlight
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
  /** Internal: prevents an infinite refresh loop. */
  _retried?: boolean
}

const REFRESH_PATH = '/auth/refresh'

export async function api<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, _retried, headers, ...rest } = options

  const res = await fetch(path.startsWith('/api') ? path : `/api${path}`, {
    ...rest,
    credentials: 'include',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  // A 401 usually just means the 15-minute access token aged out.
  // Refresh once, transparently, then replay the original request.
  // The refresh call itself is exempt: retrying it on 401 would just ask
  // the same dead cookie a second time.
  if (res.status === 401 && !_retried && !path.endsWith(REFRESH_PATH)) {
    if (await refreshSession()) {
      return api<T>(path, { ...options, _retried: true })
    }
    accessToken = null
    onUnauthorized?.()
  }

  const text = await res.text()
  const data = text ? JSON.parse(text) : null

  if (!res.ok) {
    throw new ApiError(data?.message || data?.error || 'SYSTEM FAILURE DETECTED.', res.status)
  }
  return data as T
}

export const apiGet = <T>(path: string) => api<T>(path)
export const apiPost = <T>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body })
export const apiPatch = <T>(path: string, body?: unknown) => api<T>(path, { method: 'PATCH', body })
export const apiDelete = <T>(path: string) => api<T>(path, { method: 'DELETE' })
