import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import IdleSessionManager from './components/common/IdleSessionManager'
import AppRouter from './routes/AppRouter'
import DevMockClockBanner from './components/common/DevMockClockBanner'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <IdleSessionManager />
        <AppRouter />
        {import.meta.env.DEV && <DevMockClockBanner />}
      </AuthProvider>
    </BrowserRouter>
  )
}

