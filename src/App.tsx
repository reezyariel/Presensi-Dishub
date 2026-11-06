import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import IdleSessionManager from './components/common/IdleSessionManager'
import AppRouter from './routes/AppRouter'
import DevMockClockBanner from './components/common/DevMockClockBanner'
import TestingModeIndicator from './components/common/TestingModeIndicator'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        {import.meta.env.DEV && <TestingModeIndicator />}
        <IdleSessionManager />
        <AppRouter />
        {import.meta.env.DEV && <DevMockClockBanner />}
      </AuthProvider>
    </BrowserRouter>
  )
}
