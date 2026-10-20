import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import TakeAttendanceModal from './TakeAttendanceModal'

export default function TakeAttendancePage() {
  const navigate = useNavigate()
  const { role } = useAuth()
  const category = role === 'Security' ? 'Security' : 'CS'

  return (
    <div className="min-h-screen bg-neutral-100/70 sm:py-6 flex flex-col items-center justify-center">
      <TakeAttendanceModal
        category={category}
        attendanceType="masuk"
        onClose={() => navigate(role === 'Security' ? '/security' : '/cs')}
        onSuccess={() => navigate(role === 'Security' ? '/security' : '/cs')}
      />
    </div>
  )
}
