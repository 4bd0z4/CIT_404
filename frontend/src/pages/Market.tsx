import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ShoppingCart, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { apiGet, apiPost, ApiError } from '@/lib/api'
import { cn, formatCIT } from '@/lib/utils'
import { useGame } from '@/store/game-context'
import { Badge, itemTypeVariant } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, ItemIcon } from '@/components/fx'
import { TransactionLog } from '@/components/TransactionLog'
import type { ItemType, MarketItem } from '@/types'

const GROUPS: { type: ItemType; title: string; blurb: string }[] = [
  { type: 'HINT',      title: 'Hints',           blurb: 'Stuck? Buy a hint to get unstuck. Works on CTF challenges.' },
  { type: 'INSURANCE', title: 'Insurance',      blurb: 'A failed mission without insurance is a lost investment.' },
  { type: 'BOOST',     title: 'Boosts',         blurb: 'Advantages that change how a mission plays out.' },
  { type: 'ACCESS',    title: 'Special Access', blurb: 'Unlock content locked behind the network.' },
]

export function Market() {
  const { wallet } = useGame()

  const { data, isLoading } = useQuery({
    queryKey: ['items'],
    queryFn: () => apiGet<MarketItem[]>('/game/items'),
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="font-display text-lg tracking-[0.18em] text-term uppercase">The Market</h2>
          <p className="mt-0.5 text-[11px] text-term/45">
            Everything you buy is stored on your team account, shared by all three operators.
          </p>
        </div>
        <Badge>{formatCIT(wallet.balance)} available</Badge>
      </div>

      {isLoading ? (
        <EmptyState>LOADING MARKET INDEX…</EmptyState>
      ) : (
        GROUPS.map((group) => {
          const list = data?.filter((i) => i.item_type === group.type) ?? []
          if (!list.length) return null
          return (
            <Card key={group.type}>
              <CardHeader>
                <div>
                  <CardTitle>{group.title}</CardTitle>
                  <p className="mt-0.5 text-[11px] text-term/45">{group.blurb}</p>
                </div>
                <Badge variant={itemTypeVariant(group.type)}>{group.type}</Badge>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-2">
                {list.map((item) => (
                  <MarketCard key={item.id} item={item} balance={wallet.balance} />
                ))}
              </CardContent>
            </Card>
          )
        })
      )}

      <TransactionLog />
    </div>
  )
}

function MarketCard({ item, balance }: { item: MarketItem; balance: number }) {
  const queryClient = useQueryClient()

  const buy = useMutation({
    mutationFn: () => apiPost('/game/items/purchase', { itemCode: item.code, quantity: 1 }),
    onSuccess: () => {
      toast('ACQUISITION CONFIRMED', { description: `${item.name} added to inventory.` })
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['game-state'] })
    },
    onError: (err) =>
      toast('ACQUISITION DENIED', {
        description: err instanceof ApiError ? err.message : 'TRANSACTION FAILED.',
      }),
  })

  const use = useMutation({
    mutationFn: () => apiPost('/game/items/use', { itemCode: item.code }),
    onSuccess: () => {
      toast('ITEM ACTIVATED', { description: item.effect })
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['game-state'] })
    },
    onError: (err) =>
      toast('ACTIVATION FAILED', {
        description: err instanceof ApiError ? err.message : 'ITEM UNAVAILABLE.',
      }),
  })

  const affordable = balance >= item.cost
  const atLimit = item.max_per_team !== null && item.total_bought >= item.max_per_team
  const soldOut = item.stock !== null && item.stock <= 0
  // A mission item has to name the mission it applies to, so it can only be
  // spent from that mission's panel — never from here or the inventory.
  const missionOnly = item.applies_to === 'MISSION'

  return (
    <div
      className={cn(
        'flex flex-col border bg-black/40 p-3 transition-colors',
        item.owned > 0 ? 'border-item/40' : 'border-edge'
      )}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center border border-edge text-term/70">
          <ItemIcon name={item.icon} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm font-bold text-term">{item.name}</span>
            <span className="shrink-0 font-display text-sm tabular-nums text-warn">{item.cost}</span>
          </div>
          <p className="mt-1 text-[11px] leading-snug text-term/55">{item.effect}</p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        {item.owned > 0 && (
          <Badge variant="item">
            <Check className="size-3" /> ×{item.owned}
          </Badge>
        )}
        {item.max_per_team !== null && (
          <span className="text-[10px] text-term/30">
            {item.total_bought}/{item.max_per_team} max
          </span>
        )}
        {missionOnly && <span className="text-[10px] text-term/30">use from a mission</span>}
        <div className="ml-auto flex gap-1.5">
          {item.owned > 0 && !missionOnly && (
            <Button variant="item" size="sm" onClick={() => use.mutate()} disabled={use.isPending}>
              <Sparkles /> Use
            </Button>
          )}
          <Button
            variant={affordable && !atLimit && !soldOut ? 'default' : 'outline'}
            size="sm"
            onClick={() => buy.mutate()}
            disabled={buy.isPending || !affordable || atLimit || soldOut}
          >
            <ShoppingCart />
            {soldOut ? 'Sold out' : atLimit ? 'Limit' : affordable ? 'Buy' : 'No funds'}
          </Button>
        </div>
      </div>
    </div>
  )
}
