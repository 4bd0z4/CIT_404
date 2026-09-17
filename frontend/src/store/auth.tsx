import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, refreshSession, setAccessToken, setUnauthorizedHandler } from '@/lib/api'
import { disconnectSocket } from '@/lib/socket'
import { AuthContext, type AuthContextValue } from './auth-context'
import type { Subject } from '@/types'

interface AuthResponse {
  accessToken: string
  subject: Subject
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [subject, setSubject] = useState<Subject | null>(null)
  const [booting, setBooting] = useState(true)

  const applySession = useCallback((data: AuthResponse) => {
    setAccessToken(data.accessToken)
    setSubject(data.subject)
  }, [])

  const clearSession = useCallback(() => {
    setAccessToken(null)
    setSubject(null)
    disconnectSocket()
  }, [])

  /**
   * On a hard refresh the access token is gone (it only ever lived in
   * memory), but the httpOnly refresh cookie survives. One silent call
   * restores the session without asking the operators to type the team
   * code again mid-game.
   */
  useEffect(() => {
    let cancelled = false
    // Goes through the shared single-flight helper: the refresh token is
    // rotated server-side, so two parallel calls would spend the cookie
    // twice and log the operators straight back out.
    refreshSession()
      .then((data) => {
        if (cancelled) return
        if (data) applySession(data as AuthResponse)
        else clearSession()
      })
      .finally(() => { if (!cancelled) setBooting(false) })
    return () => { cancelled = true }
  }, [applySession, clearSession])

  useEffect(() => {
    setUnauthorizedHandler(() => clearSession())
    return () => setUnauthorizedHandler(null)
  }, [clearSession])

  const loginTeam = useCallback(
    async (input: { teamName: string; joinCode: string; nickname: string }) => {
      applySession(await api<AuthResponse>('/auth/team', { method: 'POST', body: input }))
    },
    [applySession]
  )

  const loginAdmin = useCallback(
    async (input: { username: string; password: string }) => {
      applySession(await api<AuthResponse>('/auth/admin', { method: 'POST', body: input }))
    },
    [applySession]
  )

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' })
    } finally {
      clearSession()
    }
  }, [clearSession])

  const value = useMemo<AuthContextValue>(
    () => ({
      subject,
      team: subject?.kind === 'team' ? subject : null,
      admin: subject?.kind === 'admin' ? subject : null,
      booting,
      loginTeam,
      loginAdmin,
      logout,
    }),
    [subject, booting, loginTeam, loginAdmin, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
