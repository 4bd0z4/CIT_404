import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from '@/store/auth-context'
import { GameProvider } from '@/store/game'
import { BootScreen } from '@/components/fx'
import { OperatorLayout } from '@/components/layout/OperatorLayout'
import { Login } from '@/pages/Login'
import { Home } from '@/pages/Home'
import { Challenges } from '@/pages/Challenges'
import { DcrList } from '@/pages/DcrList'
import { DcrMission } from '@/pages/DcrMission'
import { Missions } from '@/pages/Missions'
import { Endgame } from '@/pages/Endgame'
import { Market } from '@/pages/Market'
import { Story } from '@/pages/Story'

/**
 * The admin platform pulls in Recharts and the big data tables. Operators
 * play on phones over venue wifi and never open it, so it is split out of
 * the main bundle and fetched only when an admin actually signs in.
 */
const AdminLayout = lazy(() => import('@/components/layout/AdminLayout').then((m) => ({ default: m.AdminLayout })))
const AdminLogin = lazy(() => import('@/pages/admin/AdminLogin').then((m) => ({ default: m.AdminLogin })))
const Dashboard = lazy(() => import('@/pages/admin/Dashboard').then((m) => ({ default: m.Dashboard })))
const Teams = lazy(() => import('@/pages/admin/Teams').then((m) => ({ default: m.Teams })))
const TeamDetail = lazy(() => import('@/pages/admin/TeamDetail').then((m) => ({ default: m.TeamDetail })))
const Items = lazy(() => import('@/pages/admin/Items').then((m) => ({ default: m.Items })))
const Inventory = lazy(() => import('@/pages/admin/Inventory').then((m) => ({ default: m.Inventory })))
const AdminMissions = lazy(() => import('@/pages/admin/Missions').then((m) => ({ default: m.AdminMissions })))
const AdminEndgame = lazy(() => import('@/pages/admin/Endgame').then((m) => ({ default: m.AdminEndgame })))
const Alerts = lazy(() => import('@/pages/admin/Alerts').then((m) => ({ default: m.Alerts })))
const Ledger = lazy(() => import('@/pages/admin/Ledger').then((m) => ({ default: m.Ledger })))

export function App() {
  const { subject, booting } = useAuth()

  // The session is restored from the httpOnly cookie before anything
  // renders, so a refresh mid-game never bounces operators to the login.
  if (booting) return <BootScreen />

  return (
    <Suspense fallback={<BootScreen message="LOADING MODULE" />}>
      <Routes>
        {/* ---------------- OPERATOR ---------------- */}
      <Route
        path="/"
        element={
          subject?.kind === 'team' ? (
            <GameProvider>
              <OperatorLayout />
            </GameProvider>
          ) : subject?.kind === 'admin' ? (
            <Navigate to="/admin" replace />
          ) : (
            <Login />
          )
        }
      >
        {subject?.kind === 'team' && (
          <>
            <Route index element={<Home />} />
            <Route path="challenges" element={<Challenges />} />
            <Route path="challenges/dcr" element={<DcrList />} />
            <Route path="challenges/dcr/:id" element={<DcrMission />} />
            <Route path="missions" element={<Missions />} />
            <Route path="endgame" element={<Endgame />} />
            <Route path="market" element={<Market />} />
            <Route path="story" element={<Story />} />
          </>
        )}
      </Route>

      {/* ---------------- ADMIN ---------------- */}
      <Route
        path="/admin/login"
        element={subject?.kind === 'admin' ? <Navigate to="/admin" replace /> : <AdminLogin />}
      />

      <Route
        path="/admin"
        element={subject?.kind === 'admin' ? <AdminLayout /> : <Navigate to="/admin/login" replace />}
      >
        <Route index element={<Dashboard />} />
        <Route path="teams" element={<Teams />} />
        <Route path="teams/:id" element={<TeamDetail />} />
        <Route path="items" element={<Items />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="missions" element={<AdminMissions />} />
        <Route path="endgame" element={<AdminEndgame />} />
        <Route path="alerts" element={<Alerts />} />
        <Route path="ledger" element={<Ledger />} />
      </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
