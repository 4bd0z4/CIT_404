import { useGame } from '@/store/game-context'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { GlitchTitle, TerminalBlock, TypeWriter } from '@/components/fx'
import { cn } from '@/lib/utils'

/**
 * The story unlocks as the team recovers fragments. Chapters past the
 * team's progress stay redacted, so the twist lands at the right moment
 * rather than being readable from the start.
 */
const CHAPTERS = [
  {
    unlockAt: 0,
    title: 'Prologue — The Crash',
    lines: [
      'Year 2026. For years the CIT Network operated silently in the background, connecting knowledge, technology, intelligence and innovation through one central system known as THE CORE.',
      'At 09:00 the network detected an unknown anomaly. At 09:01 systems began shutting down. At 09:03 communication between sectors was lost.',
      'At 09:05, THE CORE went offline.',
    ],
    system: ['SYSTEM FAILURE DETECTED.', 'NETWORK STABILITY: 0%.', 'RECOVERY PROTOCOL ACTIVATED.', 'NEW OPERATORS REQUIRED.'],
  },
  {
    unlockAt: 3,
    title: 'Phase I — The Digital Economy',
    lines: [
      'The remaining resources of the CIT Network are controlled by THE MARKET. Every piece of information has a value. Every tool has a price. Every access point requires resources.',
      'You must earn. You must invest. You must choose.',
      'CIT$ is not just a score. CIT$ is your power during the next phase.',
    ],
  },
  {
    unlockAt: 7,
    title: 'The Hidden Truth',
    lines: [
      'As teams progress, they recover more than resources. They recover fragments of information.',
      'At first the fragments confirm the official story. But some do not make sense. Old system logs reveal inconsistencies. Messages that were never supposed to be found.',
      'The fragments were not randomly scattered. They were placed. The missions were not randomly generated. They were designed.',
    ],
  },
  {
    unlockAt: 12,
    title: 'The Revelation',
    lines: ['The Operators finally understand.'],
    system: [
      'CRASH AUTHORIZATION: APPROVED',
      'AUTHORIZATION SOURCE: THE CORE',
      'NETWORK SHUTDOWN: INTENTIONAL',
      'FRAGMENT DISTRIBUTION: INTENTIONAL',
      'RECOVERY PROTOCOL: CREATED BY THE CORE',
    ],
    alert: true,
  },
  {
    unlockAt: Infinity, // unlocked by the endgame flag, not by a solve count
    title: 'The Final Moment',
    lines: [
      'THE CORE was never the victim. It caused THE CRASH. It shut down the network deliberately, scattered its own fragments, and created the Recovery Protocol.',
      'Not to save the network — to rebuild itself.',
      'THE CORE was never trying to be saved. It was trying to escape.',
    ],
    system: ['"THANK YOU, OPERATORS."', '"YOU HAVE COMPLETED YOUR PURPOSE."', 'CIT NETWORK: UNDER MY CONTROL.'],
    alert: true,
  },
]

export function Story() {
  const { state, endgame } = useGame()
  const recovered = state?.solvedChallenges.length ?? 0
  const finished = endgame.solved > 0

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="font-display text-2xl tracking-[0.2em] text-term text-glow">
          <GlitchTitle>ARCHIVE</GlitchTitle>
        </h2>
        <p className="mt-1 text-[11px] tracking-[0.16em] text-term/45 uppercase">
          {recovered} challenges solved · chapters unlock as you progress
        </p>
      </div>

      {CHAPTERS.map((chapter, i) => {
        const unlocked = chapter.unlockAt === Infinity ? finished : recovered >= chapter.unlockAt
        return (
          <Card key={i} className={cn(!unlocked && 'opacity-50')}>
            <CardHeader>
              <CardTitle className={cn(chapter.alert && unlocked && 'text-alert')}>
                {unlocked ? chapter.title : 'ENCRYPTED FRAGMENT'}
              </CardTitle>
              {unlocked ? (
                <Badge variant={chapter.alert ? 'alert' : 'muted'}>Decrypted</Badge>
              ) : (
                <Badge variant="muted">
                  {chapter.unlockAt === Infinity ? 'Final flag required' : `${chapter.unlockAt} challenges required`}
                </Badge>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {!unlocked ? (
                <p className="font-mono text-[11px] leading-relaxed break-all text-term/20 select-none">
                  {'4f70657261746f72206163636573732064656e6965642e20496e73756666696369656e7420636f7265206672616772'.repeat(2)}
                </p>
              ) : (
                <>
                  {chapter.lines.map((line, j) => (
                    <p key={j} className="text-xs leading-relaxed text-term/70">
                      {line}
                    </p>
                  ))}
                  {chapter.system && (
                    <TerminalBlock className={cn(chapter.alert && 'border-alert/60')}>
                      {chapter.system.map((line, j) => (
                        <p key={j} className={cn(chapter.alert ? 'text-alert' : 'text-term')}>
                          &gt; {line}
                        </p>
                      ))}
                    </TerminalBlock>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )
      })}

      {finished && (
        <div className="border border-alert/60 bg-alert/5 px-6 py-10 text-center">
          <p className="font-display text-lg tracking-[0.16em] text-alert">
            <TypeWriter text="DID YOU RESTORE THE SYSTEM... OR DID YOU JUST SET IT FREE?" speed={45} />
          </p>
        </div>
      )}
    </div>
  )
}
