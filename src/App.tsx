import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import IdleSessionManager from './components/common/IdleSessionManager'
import AppRouter from './routes/AppRouter'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <IdleSessionManager />
        <AppRouter />
      </AuthProvider>
    </BrowserRouter>
  )
}
