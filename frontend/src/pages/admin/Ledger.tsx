import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api'
import { cn, timeAgo } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, Tbody, Td, Th, Thead, TableWrap, Tr } from '@/components/ui/table'
import { EmptyState } from '@/components/fx'
import { KIND_LABEL } from '@/components/TransactionLog'
import type { LedgerKind, LedgerRow } from '@/types'

const KINDS: (LedgerKind | 'ALL')[] = [
  'ALL', 'CHALLENGE_REWARD', 'FIRST_BLOOD', 'ITEM_PURCHASE', 'ITEM_USE',
  'MISSION_PURCHASE', 'MISSION_REWARD', 'ENDGAME_REWARD',
  'NOTIF_REWARD', 'NOTIF_PENALTY', 'ADMIN_ADJUST',
]

/**
 * The global audit trail. Nothing in the game changes a balance without
 * leaving a row here, so this page is the ground truth when a team
 * disputes what happened.
 */
export function Ledger() {
  const [kind, setKind] = useState<(typeof KINDS)[number]>('ALL')

  const { data, isLoading } = useQuery({
    queryKey: ['admin-ledger', kind],
    queryFn: () => apiGet<LedgerRow[]>(`/admin/ledger?limit=300${kind === 'ALL' ? '' : `&kind=${kind}`}`),
    refetchInterval: 8_000,
  })

  return (
    <Card>
      <CardHeader className="flex-wrap">
        <CardTitle>Global ledger</CardTitle>
        <div className="flex flex-wrap gap-1">
          {KINDS.map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={cn(
                'border px-2 py-1 text-[10px] font-bold tracking-[0.08em] transition-colors',
                kind === k
                  ? 'border-term bg-term text-void'
                  : 'border-edge text-term/45 hover:border-term/60 hover:text-term'
              )}
            >
              {k === 'ALL' ? 'ALL' : (KIND_LABEL[k] ?? k)}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-4">
            <EmptyState>READING THE JOURNAL…</EmptyState>
          </div>
        ) : !data?.length ? (
          <div className="p-4">
            <EmptyState>NO ENTRIES OF THIS TYPE.</EmptyState>
          </div>
        ) : (
          <TableWrap className="max-h-[70vh] overflow-y-auto">
            <Table>
              <Thead className="sticky top-0 bg-panel">
                <tr>
                  <Th>Team</Th>
                  <Th>Type</Th>
                  <Th>Detail</Th>
                  <Th>Operator</Th>
                  <Th className="text-right">Qty</Th>
                  <Th className="text-right">Amount</Th>
                  <Th className="text-right">Balance</Th>
                  <Th className="text-right">When</Th>
                </tr>
              </Thead>
              <Tbody>
                {data.map((row) => (
                  <Tr key={row.id}>
                    <Td className="font-bold text-term">{row.team_name}</Td>
                    <Td>
                      <Badge variant={row.amount > 0 ? 'default' : row.amount < 0 ? 'warn' : 'muted'}>
                        {KIND_LABEL[row.kind] ?? row.kind}
                      </Badge>
                    </Td>
                    <Td className="max-w-64 truncate text-term/60">{row.note ?? '--'}</Td>
                    <Td className="text-term/50">{row.operator ?? 'SYSTEM'}</Td>
                    <Td className="text-right tabular-nums text-term/40">{row.quantity}</Td>
                    <Td
                      className={cn(
                        'text-right font-bold tabular-nums',
                        row.amount > 0 ? 'text-term' : row.amount < 0 ? 'text-alert' : 'text-term/30'
                      )}
                    >
                      {row.amount > 0 ? '+' : ''}
                      {row.amount}
                    </Td>
                    <Td className="text-right tabular-nums text-term/50">{row.balance_after}</Td>
                    <Td className="text-right text-term/30">{timeAgo(row.created_at)}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableWrap>
        )}
      </CardContent>
    </Card>
  )
}
