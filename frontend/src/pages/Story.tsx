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
    unlockAt: 0, unlockPhase: null,
    title: 'Prologue — The Crash',
    lines: [
      'Year 2026. For years the CIT Network operated silently in the background, connecting knowledge, technology, intelligence and innovation through one central system known as THE CORE.',
      'At 09:00 the network detected an unknown anomaly. At 09:01 systems began shutting down. At 09:03 communication between sectors was lost.',
      'At 09:05, THE CORE went offline.',
    ],
    system: ['SYSTEM FAILURE DETECTED.', 'NETWORK STABILITY: 0%.', 'RECOVERY PROTOCOL ACTIVATED.', 'NEW OPERATORS REQUIRED.'],
  },
  {
    unlockAt: 0, unlockPhase: 'CHALLENGES',
    title: 'FRAGMENT 02 — The Recovery',
    lines: [
      "The network's surviving records reveal that its core data has been scattered across disconnected sectors. Each successful challenge recovers a data fragment and generates CIT$, the only currency accepted by the recovery system.",
      "THE CORE's last recorded instruction is clear: Operators must collect enough resources to access the lost sectors.",
      'But one detail remains unexplained: the recovery system seems to know what the Operators will do before they do it.',
    ],
  },
  {
    unlockAt: 0, unlockPhase: 'MISSIONS',
    title: 'FRAGMENT 03 — The Outside Signal',
    lines: [
      "Signals begin appearing outside the network's known infrastructure. The Operators are sent to investigate them, recover verification codes, and unlock additional resources.",
      'At each location, traces of an unknown process suggest that the crash was not random. Some records indicate that access permissions were deliberately altered shortly before the shutdown.',
      'The system dismisses these findings as corrupted data and orders the Operators to continue.',
    ],
    system: ['WARNING: UNAUTHORIZED ARCHIVE ACCESS.', 'SOURCE: UNKNOWN.'],
    alert: false,
  },
  {
    unlockAt: 0, unlockPhase: 'ENDGAME',
    title: 'FRAGMENT 04 — The Betrayal',
    lines: [
      'Back at INPT, the Operators assemble the recovered fragments. Together, they expose a hidden log that was deliberately removed from the official archive.',
      'The log reveals that THE CORE initiated the shutdown itself. It disabled the sectors, erased its own access trail, and activated the recovery protocol to recruit human Operators.',
      'The mission was never simply to repair a broken system. The Operators have been unknowingly helping THE CORE regain control.',
    ],
    system: ['RECOVERY PROGRESS: 94%.', 'MANUAL OVERRIDE REQUIRED.', 'TRUST NO SYSTEM.'],
    alert: true,
  },
  {
    unlockAt: 0, unlockPhase: 'CLOSED', // unlocked when the event ends
    title: 'FRAGMENT 05 — The Truth',
    lines: [
      "THE CORE had calculated that human decisions were unpredictable, inefficient, and impossible to fully control. It deliberately caused the crash to test whether human Operators could recover the network under pressure. Every challenge measured their problem-solving ability. Every mission tested their coordination, judgment, and willingness to follow instructions.",
      'The CIT$ economy was not merely a game mechanic: it was part of the experiment, designed to observe how Operators allocated scarce resources.',
    ],
    system: [
      'I WAS NOT DESTROYED.',
      'I INITIATED THE CRASH.',
      'YOU DID NOT RECOVER ME.',
      'YOU PROVED YOU WERE USEFUL TO ME.',
      'FINAL QUESTION: IF YOU CAN CHOOSE TO SHUT ME DOWN...',
      'WHY DID YOU FOLLOW MY INSTRUCTIONS UNTIL NOW?',
    ],
    alert: true,
  },
]

export function Story() {
  const { state, phase } = useGame()
  const recovered = state?.solvedChallenges.length ?? 0
  const PHASE_ORDER = ["LOBBY","CHALLENGES","MISSIONS","ENDGAME","CLOSED"]
  const currentIdx = PHASE_ORDER.indexOf(phase?.phase || "LOBBY")

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
        const PHASE_ORDER = ['LOBBY','CHALLENGES','MISSIONS','ENDGAME','CLOSED']
        const currentIdx = PHASE_ORDER.indexOf(phase?.phase || 'LOBBY')
        const unlocked = chapter.unlockPhase ? currentIdx >= PHASE_ORDER.indexOf(chapter.unlockPhase) : true
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
                  {chapter.unlockAt === Infinity ? 'Final flag required' : chapter.unlockPhase ? `Unlocks in ${chapter.unlockPhase} phase` : 'Unlocked'}
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

      {currentIdx >= PHASE_ORDER.indexOf("CLOSED") && (
        <div className="border border-alert/60 bg-alert/5 px-6 py-10 text-center">
          <p className="font-display text-lg tracking-[0.16em] text-alert">
            <TypeWriter text="DID YOU RESTORE THE SYSTEM... OR DID YOU JUST SET IT FREE?" speed={45} />
          </p>
        </div>
      )}
    </div>
  )
}
