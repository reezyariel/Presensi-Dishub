import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { normalizeName } from '../lib/utils'
import type { AdminProfile, EmployeeProfile, UserRole, ShiftType, EmployeeRole } from '../types/attendance'

export interface AuthContextType {
  user: User | null
  profile: AdminProfile | null
  employeeProfile: EmployeeProfile | null
  role: UserRole | null
  isAdmin: boolean
  isLoading: boolean
  isAuthenticated: boolean
  authError: string | null
  signIn: (identifier: string, password: string) => Promise<any>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<AdminProfile | null>(null)
  const [employeeProfile, setEmployeeProfile] = useState<EmployeeProfile | null>(null)
  const [role, setRole] = useState<UserRole | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  const loadUserProfile = useCallback(async (authUser: User) => {
    try {
      // 1. Primary Check: Is user a verified administrator?
      const { data: adminData, error: adminErr } = await supabase
        .from('admin_profiles')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle()

      if (!adminErr && adminData) {
        if (adminData.is_active === false) {
          return {
            profile: null,
            employeeProfile: null,
            role: null,
            isAdmin: false,
            error: 'Akun Administrator Anda telah dinonaktifkan. Hubungi Administrator lain.',
          }
        }
        return {
          profile: {
            ...adminData,
            email: adminData.email || authUser.email || null,
          } as AdminProfile,
          employeeProfile: null,
          role: 'admin' as UserRole,
          isAdmin: true,
          error: null,
        }
      }

      // 2. Secondary Check: Is user an active CS or Security employee in employee_profiles?
      const { data: empData, error: empErr } = await supabase
        .from('employee_profiles')
        .select('*')
        .or(`auth_uid.eq.${authUser.id},id.eq.${authUser.id}`)
        .maybeSingle()

      if (!empErr && empData) {
        const emp = empData as EmployeeProfile
        return {
          profile: {
            id: emp.id,
            full_name: emp.full_name,
            created_at: emp.created_at,
            updated_at: emp.updated_at,
          },
          employeeProfile: emp,
          role: emp.employee_role as UserRole,
          isAdmin: false,
          error: null,
        }
      }

      // 3. Fallback: Check active_employees_directory
      const { data: employees } = await supabase
        .from('active_employees_directory')
        .select('id, full_name, normalized_name, employee_role, default_shift, auth_uid, email, employee_code')

      if (employees && employees.length > 0) {
        const email = authUser.email?.toLowerCase() || ''
        const metaEmpId = authUser.user_metadata?.employee_id as string | undefined
        const metaRole = authUser.user_metadata?.role as ('CS' | 'Security') | undefined
        const metaName = authUser.user_metadata?.full_name ? normalizeName(authUser.user_metadata.full_name) : ''
        const emailPrefix = email.split('@')[0].replace(/[._-]/g, ' ')
        const normEmailPrefix = normalizeName(emailPrefix)

        const empList = employees as unknown as (EmployeeProfile & { auth_uid?: string; email?: string; employee_code?: string })[]

        // Match by auth_uid, exact id, metadata employee_id, or email
        let matched = empList.find(
          e => (e.auth_uid && e.auth_uid === authUser.id) ||
            e.id === authUser.id ||
            (metaEmpId && (e.id === metaEmpId || e.employee_code === metaEmpId)) ||
            (e.email && e.email.toLowerCase() === email),
        )

        // Match by normalized full name
        if (!matched && metaName) {
          matched = empList.find(e => e.normalized_name === metaName)
        }

        // Match by email prefix
        if (!matched && normEmailPrefix) {
          matched = empList.find(
            e => e.normalized_name === normEmailPrefix || normEmailPrefix.includes(e.normalized_name),
          )
        }

        if (matched) {
          return {
            profile: {
              id: matched.id,
              full_name: matched.full_name,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            employeeProfile: matched,
            role: matched.employee_role as UserRole,
            isAdmin: false,
            error: null,
          }
        }

        // Match by user_metadata role
        if (metaRole === 'CS' || metaRole === 'Security') {
          return {
            profile: {
              id: authUser.id,
              full_name: authUser.user_metadata?.full_name || authUser.email || (metaRole === 'CS' ? 'Petugas CS' : 'Petugas Security'),
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            employeeProfile: {
              id: authUser.id,
              full_name: authUser.user_metadata?.full_name || (metaRole === 'CS' ? 'Demo CS Officer' : 'Demo Security Officer'),
              normalized_name: normalizeName(authUser.user_metadata?.full_name || (metaRole === 'CS' ? 'demo cs officer' : 'demo security officer')),
              employee_role: metaRole as EmployeeRole,
              default_shift: (metaRole === 'Security' ? 'Shift I' : null) as ShiftType | null,
              is_active: true,
              notes: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            role: metaRole as UserRole,
            isAdmin: false,
            error: null,
          }
        }

        if (email.startsWith('cs')) {
          return {
            profile: { id: authUser.id, full_name: 'Petugas CS', created_at: '', updated_at: '' },
            employeeProfile: {
              id: authUser.id,
              full_name: 'Petugas CS',
              normalized_name: 'petugas cs',
              employee_role: 'CS' as EmployeeRole,
              default_shift: null as ShiftType | null,
              is_active: true,
              notes: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            role: 'CS' as UserRole,
            isAdmin: false,
            error: null,
          }
        }

        if (email.startsWith('security') || email.startsWith('sec')) {
          return {
            profile: { id: authUser.id, full_name: 'Petugas Security', created_at: '', updated_at: '' },
            employeeProfile: {
              id: authUser.id,
              full_name: 'Petugas Security',
              normalized_name: 'petugas security',
              employee_role: 'Security' as EmployeeRole,
              default_shift: 'Shift I' as ShiftType | null,
              is_active: true,
              notes: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            role: 'Security' as UserRole,
            isAdmin: false,
            error: null,
          }
        }
      }

      // Metadata fallback
      const metaRole = authUser.user_metadata?.role as ('CS' | 'Security') | undefined
      if (metaRole === 'CS' || metaRole === 'Security') {
        const name = authUser.user_metadata?.full_name || (metaRole === 'CS' ? 'Demo CS Officer' : 'Demo Security Officer')
        return {
          profile: { id: authUser.id, full_name: name, created_at: '', updated_at: '' },
          employeeProfile: {
            id: authUser.id,
            full_name: name,
            normalized_name: normalizeName(name),
            employee_role: metaRole as EmployeeRole,
            default_shift: (metaRole === 'Security' ? 'Shift I' : null) as ShiftType | null,
            is_active: true,
            notes: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          role: metaRole as UserRole,
          isAdmin: false,
          error: null,
        }
      }

      // User exists in auth but no profile in tables
      return {
        profile: null,
        employeeProfile: null,
        role: 'user' as UserRole,
        isAdmin: false,
        error: null,
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown profile error'
      return { profile: null, employeeProfile: null, role: 'user' as UserRole, isAdmin: false, error: msg }
    }
  }, [])

  const applyAuthData = useCallback((
    authUser: User | null,
    userProfile: AdminProfile | null,
    empProf: EmployeeProfile | null,
    userRole: UserRole | null,
    adminStatus: boolean,
    err: string | null,
  ) => {
    setUser(authUser)
    setProfile(userProfile)
    setEmployeeProfile(empProf)
    setRole(userRole)
    setIsAdmin(adminStatus)
    setIsAuthenticated(!!authUser)
    setAuthError(err)
    setIsLoading(false)
  }, [])

  useEffect(() => {
    let isMounted = true

    // 1. Get initial session
    supabase.auth.getSession().then(async ({ data: { session }, error: sessionErr }) => {
      if (!isMounted) return

      if (sessionErr) {
        setIsLoading(false)
        setAuthError(sessionErr.message)
        return
      }

      if (session?.user) {
        const { profile: p, employeeProfile: ep, role: r, isAdmin: adm, error: err } = await loadUserProfile(session.user)
        if (isMounted) {
          applyAuthData(session.user, p, ep, r, adm, err)
        }
      } else {
        if (isMounted) {
          applyAuthData(null, null, null, null, false, null)
        }
      }
    })

    // 2. Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!isMounted) return

      if (session?.user) {
        const { profile: p, employeeProfile: ep, role: r, isAdmin: adm, error: err } = await loadUserProfile(session.user)
        if (isMounted) {
          applyAuthData(session.user, p, ep, r, adm, err)
        }
      } else {
        if (isMounted) {
          applyAuthData(null, null, null, null, false, null)
        }
      }
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [loadUserProfile, applyAuthData])

  const refreshProfile = useCallback(async () => {
    if (user) {
      setIsLoading(true)
      const { profile: p, employeeProfile: ep, role: r, isAdmin: adm, error: err } = await loadUserProfile(user)
      applyAuthData(user, p, ep, r, adm, err)
    }
  }, [user, loadUserProfile, applyAuthData])

  const signIn = useCallback(async (identifier: string, password: string) => {
    const cleanId = identifier.trim()
    let emailToAuth = cleanId

    if (!cleanId.includes('@')) {
      let resolved = false

      // 1. PostgreSQL RPC
      try {
        const { data: rpcEmail, error: rpcErr } = await supabase.rpc('resolve_employee_identifier', {
          p_identifier: cleanId,
        })
        if (!rpcErr && rpcEmail && typeof rpcEmail === 'string' && rpcEmail.includes('@')) {
          emailToAuth = rpcEmail
          resolved = true
        }
      } catch (e) {
        console.warn('RPC resolve_employee_identifier exception:', e)
      }

      // 2. Edge Function fallback
      if (!resolved) {
        try {
          const { data: mapData, error: mapErr } = await supabase.functions.invoke('resolve-employee-id', {
            body: { identifier: cleanId },
          })
          if (!mapErr && mapData?.success && mapData?.email) {
            emailToAuth = mapData.email
            resolved = true
          }
        } catch {
          // ignore
        }
      }

      // 3. Fallback aliases
      if (!resolved) {
        const lower = cleanId.toLowerCase()
        if (lower === 'cs001' || lower === 'cs' || lower === 'cs-demo' || lower === 'demo-cs') {
          emailToAuth = 'cs@SIPATEN.app'
          resolved = true
        } else if (lower === 'sec001' || lower === 'security' || lower === 'sec' || lower === 'security001' || lower === 'demo-sec') {
          emailToAuth = 'security@SIPATEN.app'
          resolved = true
        }
      }

      // 4. Active directory lookup
      if (!resolved) {
        try {
          const { data: empMatch } = await supabase
            .from('active_employees_directory')
            .select('id, full_name, normalized_name, employee_role')
            .or(`id.eq.${cleanId},normalized_name.eq.${cleanId.toLowerCase().trim()}`)
            .maybeSingle()

          if (!empMatch) {
            throw new Error(
              `ID Karyawan "${cleanId}" tidak ditemukan dalam sistem. Pastikan ID benar (contoh: CS001, SEC001) atau gunakan Email akun terdaftar.`,
            )
          }

          if (empMatch.employee_role === 'CS') {
            emailToAuth = 'cs@SIPATEN.app'
          } else if (empMatch.employee_role === 'Security') {
            emailToAuth = 'security@SIPATEN.app'
          } else {
            throw new Error(`Karyawan "${empMatch.full_name}" terdaftar, silakan gunakan Email resmi Anda untuk masuk.`)
          }
        } catch (err: unknown) {
          if (err instanceof Error) throw err
          throw new Error('Gagal memverifikasi ID Karyawan.')
        }
      }
    }

    const authResult = await supabase.auth.signInWithPassword({
      email: emailToAuth,
      password,
    })

    if (authResult.error) throw authResult.error

    if (authResult.data.user) {
      const { profile: p, employeeProfile: ep, role: r, isAdmin: adm, error: profErr } = await loadUserProfile(
        authResult.data.user,
      )
      applyAuthData(authResult.data.user, p, ep, r, adm, profErr)
      return { ...authResult.data, role: r, isAdmin: adm, profile: p, employeeProfile: ep }
    }

    return { ...authResult.data, role: 'user' as UserRole, isAdmin: false, profile: null, employeeProfile: null }
  }, [loadUserProfile, applyAuthData])

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut()
    } catch (err) {
      console.warn('[SIPATEN Auth] signOut error:', err)
    } finally {
      try {
        sessionStorage.clear()
        localStorage.removeItem('SIPATEN_active_role')
        localStorage.removeItem('shifttrack_last_activity_ts')
        localStorage.removeItem('shifttrack_active_user_id')
        localStorage.removeItem('shifttrack_active_user_role')
      } catch {
        // ignore
      }
      applyAuthData(null, null, null, null, false, null)
    }
  }, [applyAuthData])

  const value = useMemo<AuthContextType>(() => ({
    user,
    profile,
    employeeProfile,
    role,
    isAdmin,
    isLoading,
    isAuthenticated,
    authError,
    signIn,
    signOut,
    refreshProfile,
  }), [
    user,
    profile,
    employeeProfile,
    role,
    isAdmin,
    isLoading,
    isAuthenticated,
    authError,
    signIn,
    signOut,
    refreshProfile,
  ])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
