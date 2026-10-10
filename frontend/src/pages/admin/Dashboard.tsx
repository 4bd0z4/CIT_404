import { useQuery } from '@tanstack/react-query'
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Activity, Coins, Package, Target, Users } from 'lucide-react'
import { apiGet } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/fx'
import type { AdminOverview } from '@/types'

const SERIES = {
  earned: '#22e1ff',
  spent: '#ff003c',
  CP: '#22e1ff',
  CTF: '#00e5ff',
  DATA: '#ffb000',
}

const axis = { stroke: '#232a44', tick: { fill: '#12a8c4', fontSize: 10 } }

const tooltipStyle = {
  contentStyle: {
    background: '#0b0e0b',
    border: '1px solid #232a44',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 11,
  },
  labelStyle: { color: '#22e1ff' },
}

export function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-overview'],
    queryFn: () => apiGet<AdminOverview>('/admin/overview'),
    refetchInterval: 10_000,
  })

  if (isLoading || !data) return <EmptyState>QUERYING THE CORE…</EmptyState>

  const t = data.totals
  const solveRate = t.attempts > 0 ? Math.round((t.solves / t.attempts) * 100) : 0

  const timeline = data.timeline.map((row) => ({
    t: new Date(row.t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    earned: row.earned ?? 0,
    spent: row.spent ?? 0,
  }))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi icon={<Users className="size-4" />} label="Teams" value={t.teams} sub={`${t.operators} operators`} />
        <Kpi icon={<Coins className="size-4" />} label="Circulating" value={t.circulating} sub={`${t.total_issued} issued`} tone="text-warn" />
        <Kpi icon={<Target className="size-4" />} label="Solve rate" value={`${solveRate}%`} sub={`${t.solves}/${t.attempts}`} tone="text-info" />
        <Kpi icon={<Package className="size-4" />} label="Spent" value={t.total_spent} sub="on items & missions" tone="text-item" />
        <Kpi icon={<Activity className="size-4" />} label="Missions" value={t.missions_bought} sub="purchased" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Economy flow · last 2 hours</CardTitle>
            <Badge variant="muted">per minute</Badge>
          </CardHeader>
          <CardContent className="h-64">
            {timeline.length === 0 ? (
              <EmptyState>NO ECONOMIC ACTIVITY YET.</EmptyState>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timeline} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="#1a2140" strokeDasharray="2 4" />
                  <XAxis dataKey="t" {...axis} />
                  <YAxis {...axis} />
                  <Tooltip {...tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} />
                  <Line type="monotone" dataKey="earned" stroke={SERIES.earned} strokeWidth={2} dot={false} name="Earned" />
                  <Line type="monotone" dataKey="spent" stroke={SERIES.spent} strokeWidth={2} dot={false} name="Spent" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Solves by category</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {data.byCategory.length === 0 ? (
              <EmptyState>NO SUBMISSIONS YET.</EmptyState>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.byCategory} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="#1a2140" strokeDasharray="2 4" vertical={false} />
                  <XAxis dataKey="category" {...axis} />
                  <YAxis {...axis} />
                  <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(34, 225, 255,0.06)' }} />
                  <Bar dataKey="solves" name="Solves">
                    {data.byCategory.map((row) => (
                      <Cell key={row.category} fill={SERIES[row.category]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Item demand</CardTitle>
          <Badge variant="item">what teams actually buy</Badge>
        </CardHeader>
        <CardContent className="h-72">
          {data.itemsSold.every((i) => Number(i.units_sold) === 0) ? (
            <EmptyState>NO ITEMS SOLD YET.</EmptyState>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.itemsSold.map((i) => ({ ...i, units_sold: Number(i.units_sold) }))}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 40, bottom: 0 }}
              >
                <CartesianGrid stroke="#1a2140" strokeDasharray="2 4" horizontal={false} />
                <XAxis type="number" {...axis} />
                <YAxis type="category" dataKey="name" width={120} {...axis} />
                <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(255,79,163,0.08)' }} />
                <Bar dataKey="units_sold" fill="#ff4fa3" name="Units sold" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Kpi({
  icon, label, value, sub, tone = 'text-term',
}: { icon: React.ReactNode; label: string; value: number | string; sub?: string; tone?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-1.5 text-[10px] tracking-[0.14em] text-term/45 uppercase">
          {icon} {label}
        </div>
        <div className={`mt-1.5 font-display text-2xl tabular-nums ${tone}`}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </div>
        {sub && <div className="mt-0.5 text-[10px] text-term/30">{sub}</div>}
      </CardContent>
    </Card>
  )
}
