import * as DialogPrimitive from '@radix-ui/react-dialog'
import { AlertTriangle, Bell, Check, Clock, Mail, MailOpen, Siren, X } from 'lucide-react'
import { useGame } from '@/store/game-context'
import { useTimeLeft } from '@/hooks/useNow'
import { cn, formatDuration, timeAgo } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/fx'
import type { Notification } from '@/types'

/**
 * Blocking overlay for urgent orders from the admins.
 *
 * It deliberately ignores Escape and outside clicks: the whole point is
 * that operators cannot let one flash past unread, because ignoring it
 * costs them CIT$ and energy when the countdown runs out.
 */
export function UrgentOverlay() {
  const { urgentQueue, acknowledge } = useGame()
  const current = urgentQueue[0]
  const timeLeft = useTimeLeft(current?.deadline_at)

  if (!current) return null

  const expired = timeLeft !== null && timeLeft <= 0

  return (
    <DialogPrimitive.Root open>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[90] bg-alert/10 backdrop-blur-md" />
        <DialogPrimitive.Content
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          className="fixed top-1/2 left-1/2 z-[95] w-[94vw] max-w-lg -translate-x-1/2 -translate-y-1/2
                     border-2 border-alert bg-void shadow-[0_0_80px_-10px_var(--color-alert)]
                     data-[state=open]:animate-boot"
        >
          <div className="flex items-center gap-2 border-b-2 border-alert bg-alert/15 px-5 py-3">
            <Siren className="size-5 animate-blink text-alert" />
            <DialogPrimitive.Title className="font-display text-base tracking-[0.2em] text-alert uppercase">
              Priority Transmission
            </DialogPrimitive.Title>
            {urgentQueue.length > 1 && (
              <Badge variant="alert" className="ml-auto">
                +{urgentQueue.length - 1} queued
              </Badge>
            )}
          </div>

          <div className="space-y-4 p-5">
            <div>
              <h3 className="font-display text-lg text-alert">{current.title}</h3>
              <p className="mt-2 text-xs leading-relaxed whitespace-pre-wrap text-term/85">
                {current.body}
              </p>
            </div>

            <div className="border border-alert/50 bg-alert/5 p-3 text-center">
              <div className="text-[10px] tracking-[0.18em] text-alert/70 uppercase">
                {expired ? 'Deadline passed' : 'Time remaining'}
              </div>
              <div className="mt-1 font-display text-3xl tabular-nums text-alert">
                {formatDuration(timeLeft)}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="border border-edge bg-black/40 p-2.5">
                <div className="text-[10px] tracking-[0.12em] text-term/45 uppercase">On success</div>
                <div className="mt-1 font-bold text-term">+{current.reward_cit} CIT$</div>
              </div>
              <div className="border border-alert/40 bg-black/40 p-2.5">
                <div className="text-[10px] tracking-[0.12em] text-alert/60 uppercase">On failure</div>
                <div className="mt-1 font-bold text-alert">
                  −{current.penalty_cit} CIT$
                  {current.penalty_energy > 0 && ` · −${current.penalty_energy} NRG`}
                </div>
              </div>
            </div>

            <p className="text-center text-[10px] text-term/40">
              Closing this message does not complete the order. An admin validates it on site.
            </p>

            <Button variant="danger" size="lg" className="w-full" onClick={() => acknowledge(current.id)}>
              <Check /> Acknowledged — order received
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

const STATUS_VARIANT: Record<Notification['status'], 'default' | 'alert' | 'warn' | 'muted'> = {
  SENT: 'warn',
  COMPLETED: 'default',
  FAILED: 'alert',
  EXPIRED: 'alert',
}

/** One row, shared by the header panel and the home page. */
export function NotificationRow({
  notification, onOpen,
}: { notification: Notification; onOpen?: (n: Notification) => void }) {
  const timeLeft = useTimeLeft(
    notification.status === 'SENT' ? notification.deadline_at : null
  )
  const urgent = notification.kind === 'URGENT'
  const unread = urgent ? notification.status === 'SENT' : !notification.read_at

  return (
    <button
      type="button"
      onClick={() => onOpen?.(notification)}
      className={cn(
        'w-full border p-3 text-left transition-colors',
        urgent ? 'border-alert/50 bg-alert/5 hover:bg-alert/10' : 'border-edge bg-black/40 hover:bg-term/5',
        unread && !urgent && 'border-term/40'
      )}
    >
      <div className="flex items-start gap-2">
        {urgent ? (
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-alert" />
        ) : unread ? (
          <Mail className="mt-0.5 size-4 shrink-0 text-term" />
        ) : (
          <MailOpen className="mt-0.5 size-4 shrink-0 text-term/35" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn('truncate text-xs font-bold', urgent ? 'text-alert' : 'text-term')}>
              {notification.title}
            </span>
            {urgent && <Badge variant={STATUS_VARIANT[notification.status]}>{notification.status}</Badge>}
          </div>
          <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-term/55">{notification.body}</p>
          <div className="mt-1.5 flex items-center gap-2 text-[10px] text-term/30">
            <span>{timeAgo(notification.created_at)}</span>
            {timeLeft !== null && (
              <span className="flex items-center gap-1 text-alert">
                <Clock className="size-3" />
                {formatDuration(timeLeft)}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}

/** The list shown in the header dropdown and on the home page. */
export function NotificationList({ limit }: { limit?: number }) {
  const { notifications, markRead } = useGame()
  const shown = limit ? notifications.slice(0, limit) : notifications

  if (!shown.length) {
    return <EmptyState>NO TRANSMISSIONS FROM THE CORE.</EmptyState>
  }

  return (
    <div className="space-y-2">
      {shown.map((n) => (
        <NotificationRow
          key={n.id}
          notification={n}
          onOpen={(item) => {
            if (item.kind === 'NORMAL' && !item.read_at) markRead(item.id)
          }}
        />
      ))}
    </div>
  )
}

/** Home-page card. Admin messages only — the activity feed is separate. */
export function NotificationsCard() {
  const { unreadCount } = useGame()
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Transmissions</CardTitle>
          <p className="mt-0.5 text-[11px] text-term/45">Direct messages from THE CORE operators.</p>
        </div>
        <Badge variant={unreadCount > 0 ? 'alert' : 'muted'}>
          <Bell className="size-3" /> {unreadCount} new
        </Badge>
      </CardHeader>
      <CardContent className="p-3">
        <NotificationList limit={6} />
      </CardContent>
    </Card>
  )
}

/** Close button used by the header panel. */
export function PanelClose({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-term/50 hover:text-alert" aria-label="Close">
      <X className="size-4" />
    </button>
  )
}
