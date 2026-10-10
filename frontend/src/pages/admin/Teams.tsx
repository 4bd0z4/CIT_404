import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowUpDown, Lock, Search } from 'lucide-react'
import { apiGet } from '@/lib/api'
import { cn, timeAgo } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Table, Tbody, Td, Th, Thead, TableWrap, Tr } from '@/components/ui/table'
import { EmptyState } from '@/components/fx'
import type { TeamStats } from '@/types'

type SortKey = keyof Pick<
  TeamStats,
  'team_name' | 'cit_balance' | 'core_energy' | 'total_earned' | 'total_spent' | 'items_held' | 'missions_completed'
>

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: 'team_name', label: 'Team' },
  { key: 'cit_balance', label: 'Balance', numeric: true },
  { key: 'core_energy', label: 'Energy', numeric: true },
  { key: 'total_earned', label: 'Earned', numeric: true },
  { key: 'total_spent', label: 'Spent', numeric: true },
  { key: 'items_held', label: 'Items', numeric: true },
  { key: 'missions_completed', label: 'Missions', numeric: true },
]

export function Teams() {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'core_energy',
    dir: 'desc',
  })

  const { data, isLoading } = useQuery({
    queryKey: ['admin-teams'],
    queryFn: () => apiGet<TeamStats[]>('/admin/teams'),
    refetchInterval: 10_000,
  })

  const rows = (data ?? [])
    .filter((t) => t.team_name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => {
      const av = a[sort.key]
      const bv = b[sort.key]
      const cmp = typeof av === 'string' ? av.localeCompare(String(bv)) : Number(av) - Number(bv)
      return sort.dir === 'asc' ? cmp : -cmp
    })

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>All teams</CardTitle>
        <div className="relative w-56">
          <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-term/35" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter teams…"
            className="h-8 pl-8 text-xs"
          />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-4">
            <EmptyState>LOADING TEAM REGISTRY…</EmptyState>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState>NO TEAMS MATCH.</EmptyState>
          </div>
        ) : (
          <TableWrap>
            <Table>
              <Thead>
                <tr>
                  {COLUMNS.map((col) => (
                    <Th key={col.key} className={cn(col.numeric && 'text-right')}>
                      <button
                        onClick={() => toggleSort(col.key)}
                        className={cn(
                          'inline-flex items-center gap-1 uppercase transition-colors hover:text-term',
                          sort.key === col.key && 'text-term'
                        )}
                      >
                        {col.label}
                        <ArrowUpDown className="size-3 opacity-40" />
                      </button>
                    </Th>
                  ))}
                  <Th>Progress</Th>
                  <Th className="text-right">Last seen</Th>
                </tr>
              </Thead>
              <Tbody>
                {rows.map((t) => (
                  <Tr key={t.id}>
                    <Td>
                      <Link
                        to={`/admin/teams/${t.id}`}
                        className="flex items-center gap-2 font-bold text-term hover:underline"
                      >
                        {t.is_locked && <Lock className="size-3 text-alert" />}
                        {t.team_name}
                      </Link>
                      <span className="text-[10px] text-term/30">{t.operator_count} operators</span>
                    </Td>
                    <Td className="text-right font-bold tabular-nums text-warn">
                      {t.cit_balance.toLocaleString()}
                    </Td>
                    <Td className="text-right tabular-nums text-info">{t.core_energy}</Td>
                    <Td className="text-right tabular-nums text-term/60">{t.total_earned}</Td>
                    <Td className="text-right tabular-nums text-alert/70">{t.total_spent}</Td>
                    <Td className="text-right tabular-nums text-item">{t.items_held}</Td>
                    <Td className="text-right tabular-nums">
                      {t.missions_completed}
                      <span className="text-term/25">/{t.missions_bought}</span>
                    </Td>
                    <Td>
                      <div className="flex gap-1">
                        <Badge variant="default">CP {t.solved_cp}</Badge>
                        <Badge variant="info">CTF {t.solved_ctf}</Badge>
                      </div>
                    </Td>
                    <Td className="text-right text-term/30">{timeAgo(t.last_activity_at)}</Td>
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
