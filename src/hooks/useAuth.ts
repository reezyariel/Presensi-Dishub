import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { normalizeName } from '../lib/utils'
import type { AdminProfile, EmployeeProfile, UserRole, ShiftType, EmployeeRole } from '../types/attendance'

interface AuthState {
  user: import('@supabase/supabase-js').User | null
  profile: AdminProfile | null
  employeeProfile: EmployeeProfile | null
  role: UserRole | null
  isAdmin: boolean
  isLoading: boolean
  isAuthenticated: boolean
  authError: string | null
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    profile: null,
    employeeProfile: null,
    role: null,
    isAdmin: false,
    isLoading: true,
    isAuthenticated: false,
    authError: null,
  })

  const loadUserProfile = useCallback(async (user: import('@supabase/supabase-js').User) => {
    try {
      // 1. Primary Check: Is user a verified administrator?
      const { data: adminData, error: adminErr } = await supabase
        .from('admin_profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()

      if (!adminErr && adminData) {
        return {
          profile: adminData as AdminProfile,
          employeeProfile: null,
          role: 'admin' as UserRole,
          isAdmin: true,
          error: null,
        }
      }

      // 2. Secondary Check: Is user an active CS or Security employee?
      // First try direct lookup by auth_uid or id from employee_profiles
      const { data: empData, error: empErr } = await supabase
        .from('employee_profiles')
        .select('*')
        .or(`auth_uid.eq.${user.id},id.eq.${user.id}`)
        .maybeSingle()

      if (!empErr && empData) {
        return {
          profile: {
            id: empData.id,
            full_name: empData.full_name,
            created_at: empData.created_at,
            updated_at: empData.updated_at,
          },
          employeeProfile: empData as EmployeeProfile,
          role: empData.employee_role as UserRole,
          isAdmin: false,
          error: null,
        }
      }

      // 3. Fallback: Check active_employees_directory with auth_uid matching
      const { data: employees } = await supabase
        .from('active_employees_directory')
        .select('id, full_name, normalized_name, employee_role, default_shift, auth_uid')

      if (employees && employees.length > 0) {
        const email = user.email?.toLowerCase() || ''
        const metaEmpId = user.user_metadata?.employee_id as string | undefined
        const metaRole = user.user_metadata?.role as ('CS' | 'Security') | undefined
        const metaName = user.user_metadata?.full_name ? normalizeName(user.user_metadata.full_name) : ''
        const emailPrefix = email.split('@')[0].replace(/[._-]/g, ' ')
        const normEmailPrefix = normalizeName(emailPrefix)

        // a. Match by auth_uid, exact UUID, or metadata employee_id
        const empList = employees as unknown as (EmployeeProfile & { auth_uid?: string })[]
        let matched = empList.find(
          e => (e.auth_uid && e.auth_uid === user.id) || e.id === user.id || (metaEmpId && e.id === metaEmpId),
        )

        // b. Match by normalized full name in user metadata
        if (!matched && metaName) {
          matched = empList.find(e => e.normalized_name === metaName)
        }

        // c. Match by email username prefix
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

        // d. Match by user_metadata role or standard email prefix
        if (metaRole === 'CS' || metaRole === 'Security') {
          return {
            profile: {
              id: user.id,
              full_name: user.user_metadata?.full_name || user.email || (metaRole === 'CS' ? 'Petugas CS' : 'Petugas Security'),
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            employeeProfile: {
              id: user.id,
              full_name: user.user_metadata?.full_name || (metaRole === 'CS' ? 'Demo CS Officer' : 'Demo Security Officer'),
              normalized_name: normalizeName(user.user_metadata?.full_name || (metaRole === 'CS' ? 'demo cs officer' : 'demo security officer')),
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
            profile: { id: user.id, full_name: 'Petugas CS', created_at: '', updated_at: '' },
            employeeProfile: {
              id: user.id,
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
            profile: { id: user.id, full_name: 'Petugas Security', created_at: '', updated_at: '' },
            employeeProfile: {
              id: user.id,
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

      // 4. Final metadata fallback if active directory is unreachable
      const metaRole = user.user_metadata?.role as ('CS' | 'Security') | undefined
      if (metaRole === 'CS' || metaRole === 'Security') {
        const name = user.user_metadata?.full_name || (metaRole === 'CS' ? 'Demo CS Officer' : 'Demo Security Officer')
        return {
          profile: { id: user.id, full_name: name, created_at: '', updated_at: '' },
          employeeProfile: {
            id: user.id,
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

      // User exists in auth.users but has no entry in admin_profiles or employee_profiles
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

  useEffect(() => {
    // 1. Get initial session
    supabase.auth.getSession().then(async ({ data: { session }, error: sessionErr }) => {
      if (sessionErr) {
        setState(s => ({ ...s, isLoading: false, authError: sessionErr.message }))
        return
      }

      if (session?.user) {
        const { profile, employeeProfile, role, isAdmin, error } = await loadUserProfile(session.user)
        setState({
          user: session.user,
          profile,
          employeeProfile,
          role,
          isAdmin,
          isLoading: false,
          isAuthenticated: true,
          authError: error,
        })
      } else {
        setState(s => ({
          ...s,
          user: null,
          profile: null,
          employeeProfile: null,
          role: null,
          isAdmin: false,
          isLoading: false,
          isAuthenticated: false,
          authError: null,
        }))
      }
    })

    // 2. Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const { profile, employeeProfile, role, isAdmin, error } = await loadUserProfile(session.user)
        setState({
          user: session.user,
          profile,
          employeeProfile,
          role,
          isAdmin,
          isLoading: false,
          isAuthenticated: true,
          authError: error,
        })
      } else {
        setState({
          user: null,
          profile: null,
          employeeProfile: null,
          role: null,
          isAdmin: false,
          isLoading: false,
          isAuthenticated: false,
          authError: null,
        })
      }
    })

    return () => subscription.unsubscribe()
  }, [loadUserProfile])

  const refreshProfile = async () => {
    if (state.user) {
      setState(s => ({ ...s, isLoading: true }))
      const { profile, employeeProfile, role, isAdmin, error } = await loadUserProfile(state.user)
      setState(s => ({
        ...s,
        profile,
        employeeProfile,
        role,
        isAdmin,
        isLoading: false,
        authError: error,
      }))
    }
  }

  const signIn = async (identifier: string, password: string) => {
    const cleanId = identifier.trim()
    let emailToAuth = cleanId

    // If identifier is not an email, resolve via backend RPC, edge function, or verified aliases
    if (!cleanId.includes('@')) {
      let resolved = false

      // 1. Try PostgreSQL RPC resolve_employee_identifier (fastest & native)
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

      // 2. Try Edge Function resolve-employee-id if RPC didn't resolve
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

      // 3. Fallback verified aliases (e.g. CS001, SEC001, CS, Security)
      if (!resolved) {
        const lower = cleanId.toLowerCase()
        if (lower === 'cs001' || lower === 'cs' || lower === 'cs-demo' || lower === 'demo-cs') {
          emailToAuth = 'cs@shifttrack.app'
          resolved = true
        } else if (lower === 'sec001' || lower === 'security' || lower === 'sec' || lower === 'security001' || lower === 'demo-sec') {
          emailToAuth = 'security@shifttrack.app'
          resolved = true
        }
      }

      // 4. If still not resolved, query active directory to provide friendly feedback
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

          // If found in employee profiles without linked auth, default to role email
          if (empMatch.employee_role === 'CS') {
            emailToAuth = 'cs@shifttrack.app'
          } else if (empMatch.employee_role === 'Security') {
            emailToAuth = 'security@shifttrack.app'
          } else {
            throw new Error(
              `Karyawan "${empMatch.full_name}" terdaftar, silakan gunakan Email resmi Anda untuk masuk.`,
            )
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
      const { profile, employeeProfile, role, isAdmin, error: profErr } = await loadUserProfile(
        authResult.data.user,
      )
      setState({
        user: authResult.data.user,
        profile,
        employeeProfile,
        role,
        isAdmin,
        isLoading: false,
        isAuthenticated: true,
        authError: profErr,
      })
      return { ...authResult.data, role, isAdmin, profile, employeeProfile }
    }

    return { ...authResult.data, role: 'user' as UserRole, isAdmin: false, profile: null, employeeProfile: null }
  }

  const signOut = async () => {
    try {
      await supabase.auth.signOut()
    } catch (err) {
      console.warn('[ShiftTrack Auth] signOut error:', err)
    } finally {
      try {
        sessionStorage.clear()
        localStorage.removeItem('shifttrack_active_role')
      } catch {
        // ignore storage errors
      }
      setState({
        user: null,
        profile: null,
        employeeProfile: null,
        role: null,
        isAdmin: false,
        isLoading: false,
        isAuthenticated: false,
        authError: null,
      })
    }
  }

  return { ...state, signIn, signOut, refreshProfile }
}
