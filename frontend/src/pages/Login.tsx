import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ShieldAlert, Terminal } from 'lucide-react'
import { useAuth } from '@/store/auth-context'
import { apiGet, ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { GlitchTitle, TerminalBlock, TypeWriter } from '@/components/fx'

export function Login() {
  const { loginTeam } = useAuth()
  const [teams, setTeams] = useState<string[]>([])
  const [teamName, setTeamName] = useState('')
  const [nickname, setNickname] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Team names come from the server, so the dropdown always matches the
  // real roster (12, 17, or custom names) with no hardcoded count.
  useEffect(() => {
    apiGet<{ teams: string[] }>('/auth/teams')
      .then((d) => setTeams(d.teams))
      .catch(() => setTeams([]))
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (!nickname.trim()) return setError('CALLSIGN REQUIRED.')
    if (!teamName) return setError('SELECT YOUR TEAM.')
    if (!joinCode.trim()) return setError('TEAM ACCESS CODE REQUIRED.')

    setBusy(true)
    try {
      await loginTeam({ teamName, joinCode: joinCode.trim(), nickname: nickname.trim() })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'CONNECTION TO THE CORE FAILED.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative z-10 flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-6 text-center">
          <h1 className="font-display text-5xl tracking-[0.2em] text-term text-glow">
            <GlitchTitle>CIT: 404</GlitchTitle>
          </h1>
          <p className="mt-2 text-[11px] tracking-[0.24em] text-term/50 uppercase">
            <TypeWriter text="OPERATOR AUTHENTICATION REQUIRED" />
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="relative border border-term/40 bg-panel/90 p-6 shadow-[0_0_60px_-24px_var(--color-term)] backdrop-blur-sm"
        >
          <TerminalBlock className="mb-6">
            <p>&gt; SYSTEM FAILURE DETECTED.</p>
            <p>&gt; NETWORK STABILITY: 0%.</p>
            <p>&gt; RECOVERY PROTOCOL ACTIVATED.</p>
            <p className="text-term">&gt; NEW OPERATORS REQUIRED.</p>
          </TerminalBlock>

          <div className="mb-5">
            <Label htmlFor="nickname">Callsign</Label>
            <Input
              id="nickname"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Your operator name"
              maxLength={24}
              autoComplete="off"
              autoFocus
            />
          </div>

          <div className="mb-5">
            <Label htmlFor="team">Select team</Label>
            <div className="relative">
              <select
                id="team"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                className="h-10 w-full appearance-none border border-edge bg-black/60 px-3 pr-9 font-mono text-sm text-term transition-colors focus:border-term focus:shadow-[0_0_18px_-6px_var(--color-term)] focus:outline-none"
              >
                <option value="" disabled>
                  {teams.length ? 'Choose your team…' : 'Loading teams…'}
                </option>
                {teams.map((name) => (
                  <option key={name} value={name} className="bg-panel text-term">
                    {name}
                  </option>
                ))}
              </select>
              <Terminal className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-term/40" />
            </div>
          </div>

          <div className="mb-6">
            <Label htmlFor="code">Team access code</Label>
            <Input
              id="code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="XXXXXXXX"
              maxLength={16}
              autoComplete="off"
              className="tracking-[0.3em]"
            />
            <p className="mt-1.5 text-[10px] text-term/35">
              The same code for all three operators of your team.
            </p>
          </div>

          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            <Terminal /> {busy ? 'CONNECTING…' : 'ENTER THE NETWORK'}
          </Button>

          <p className="mt-3 min-h-4 text-center text-[11px] text-alert" role="alert">
            {error}
          </p>
        </form>

        <div className="mt-4 text-center">
          <Link
            to="/admin/login"
            className="inline-flex items-center gap-1.5 text-[10px] tracking-[0.16em] text-term/35 uppercase transition-colors hover:text-warn"
          >
            <ShieldAlert className="size-3" /> Core supervision access
          </Link>
        </div>
      </div>
    </div>
  )
}
