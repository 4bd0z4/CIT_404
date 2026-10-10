import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api'
import { cn, timeAgo } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/fx'
import { Table, Tbody, Td, Th, Thead, TableWrap, Tr } from '@/components/ui/table'
import type { LedgerRow } from '@/types'

export const KIND_LABEL: Record<string, string> = {
  CHALLENGE_REWARD: 'Challenge',
  FIRST_BLOOD: 'First blood',
  DCR_REWARD: 'Data core',
  ENDGAME_REWARD: 'Endgame',
  NOTIF_REWARD: 'Bonus',
  NOTIF_PENALTY: 'Penalty',
  ITEM_PURCHASE: 'Item',
  ITEM_USE: 'Used',
  MISSION_PURCHASE: 'Mission',
  MISSION_REWARD: 'Payout',
  INSURANCE_REFUND: 'Insurance',
  ADMIN_ADJUST: 'Adjust',
  SEED: 'Initial',
}

/**
 * The team's own slice of the ledger. Three operators share a wallet, so
 * "where did our money go" needs an answer that names who spent it.
 */
export function TransactionLog() {
  const { data } = useQuery({
    queryKey: ['ledger'],
    queryFn: () => apiGet<LedgerRow[]>('/game/ledger'),
    refetchInterval: 20_000,
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transaction Log</CardTitle>
        <Badge variant="muted">{data?.length ?? 0} entries</Badge>
      </CardHeader>
      <CardContent className="p-0">
        {!data?.length ? (
          <div className="p-4">
            <EmptyState>NO TRANSACTIONS RECORDED.</EmptyState>
          </div>
        ) : (
          <TableWrap className="max-h-80 overflow-y-auto">
            <Table>
              <Thead className="sticky top-0 bg-panel">
                <tr>
                  <Th>Type</Th>
                  <Th>Detail</Th>
                  <Th>Operator</Th>
                  <Th className="text-right">Amount</Th>
                  <Th className="text-right">Balance</Th>
                  <Th className="text-right">When</Th>
                </tr>
              </Thead>
              <Tbody>
                {data.map((row) => (
                  <Tr key={row.id}>
                    <Td>
                      <Badge variant={row.amount > 0 ? 'default' : row.amount < 0 ? 'warn' : 'muted'}>
                        {KIND_LABEL[row.kind] ?? row.kind}
                      </Badge>
                    </Td>
                    <Td className="max-w-48 truncate text-term/60">{row.note ?? '--'}</Td>
                    <Td className="text-term/50">{row.operator ?? 'SYSTEM'}</Td>
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
