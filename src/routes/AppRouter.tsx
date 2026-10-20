import { Routes, Route, Navigate } from 'react-router-dom'
import SplashScreen from '../pages/public/SplashScreen'
import LoginPage from '../pages/admin/LoginPage'
import EmployeeLayout from '../components/employee/EmployeeLayout'
import CSAttendancePage from '../pages/cs/CSAttendancePage'
import SecurityAttendancePage from '../pages/security/SecurityAttendancePage'
import TakeAttendancePage from '../pages/attendance/TakeAttendancePage'
import AttendanceDetailPage from '../pages/attendance/AttendanceDetailPage'
import AttendanceHistoryPage from '../pages/employee/AttendanceHistoryPage'
import SchedulePage from '../pages/employee/SchedulePage'
import ReportsPage from '../pages/employee/ReportsPage'
import ProfilePage from '../pages/employee/ProfilePage'

// Admin pages
import AdminLayout from '../components/admin/AdminLayout'
import DashboardPage from '../pages/admin/DashboardPage'
import AttendanceListPage from '../pages/admin/AttendanceListPage'
import EmployeesPage from '../pages/admin/EmployeesPage'
import RecapDailyPage from '../pages/admin/RecapDailyPage'
import RecapMonthlyPage from '../pages/admin/RecapMonthlyPage'
import AdminReportsPage from '../pages/admin/AdminReportsPage'
import ReviewPage from '../pages/admin/ReviewPage'
import SettingsSchedulePage from '../pages/admin/SettingsSchedulePage'
import SettingsLocationPage from '../pages/admin/SettingsLocationPage'
import AuditLogPage from '../pages/admin/AuditLogPage'

import ProtectedRoute from './ProtectedRoute'

export default function AppRouter() {
  return (
    <Routes>
      {/* 1. Splash Screen ShiftTrack (Reference Panel 1) */}
      <Route path="/" element={<SplashScreen />} />

      {/* 2. Unified Enterprise Login (Reference Panel 2) */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/admin/login" element={<Navigate to="/login" replace />} />

      {/* 3. Customer Service Employee Portal (Reference Panel 3 & sub-pages) */}
      <Route
        path="/cs"
        element={
          <ProtectedRoute allowedRoles={['CS', 'admin']}>
            <EmployeeLayout category="CS" />
          </ProtectedRoute>
        }
      >
        <Route index element={<CSAttendancePage />} />
        <Route path="history" element={<AttendanceHistoryPage />} />
        <Route path="schedule" element={<SchedulePage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>

      {/* 4. Security Officers Employee Portal (Reference Panel 4 & sub-pages) */}
      <Route
        path="/security"
        element={
          <ProtectedRoute allowedRoles={['Security', 'admin']}>
            <EmployeeLayout category="Security" />
          </ProtectedRoute>
        }
      >
        <Route index element={<SecurityAttendancePage />} />
        <Route path="history" element={<AttendanceHistoryPage />} />
        <Route path="schedule" element={<SchedulePage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>

      {/* 5. Direct attendance flow (Reference Panel 5) */}
      <Route
        path="/absen"
        element={
          <ProtectedRoute allowedRoles={['CS', 'Security', 'admin']}>
            <TakeAttendancePage />
          </ProtectedRoute>
        }
      />

      {/* 6. Universal Direct Routes */}
      <Route
        path="/attendance/:id"
        element={
          <ProtectedRoute allowedRoles={['CS', 'Security', 'admin']}>
            <AttendanceDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/history"
        element={
          <ProtectedRoute allowedRoles={['CS', 'Security', 'admin']}>
            <AttendanceHistoryPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/schedule"
        element={
          <ProtectedRoute allowedRoles={['CS', 'Security', 'admin']}>
            <SchedulePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedRoute allowedRoles={['CS', 'Security', 'admin']}>
            <ReportsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute allowedRoles={['CS', 'Security', 'admin']}>
            <ProfilePage />
          </ProtectedRoute>
        }
      />

      {/* 7. Protected Admin Dashboard & Management Routes (Reference Panel 12) */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="attendance" element={<AttendanceListPage />} />
        <Route path="attendance/detail" element={<AttendanceDetailPage />} />
        <Route path="attendance/:id" element={<AttendanceDetailPage />} />
        <Route path="employees" element={<EmployeesPage />} />
        <Route path="reports" element={<AdminReportsPage />} />
        <Route path="recap" element={<AdminReportsPage />} />
        <Route path="recap/daily" element={<RecapDailyPage />} />
        <Route path="recap/monthly" element={<RecapMonthlyPage />} />
        <Route path="review" element={<ReviewPage />} />
        <Route path="settings/schedule" element={<SettingsSchedulePage />} />
        <Route path="settings/location" element={<SettingsLocationPage />} />
        <Route path="audit" element={<AuditLogPage />} />
        <Route path="audit-log" element={<AuditLogPage />} />
      </Route>

      {/* Catch-all redirect */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
