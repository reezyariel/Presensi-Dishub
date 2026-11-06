// ============================================================
// SIPATEN — Supabase Client & Local Mock Sandbox Interceptor
// In Normal Mode: Connects to real Supabase URL & Anon Key.
// In Testing Mode: Intercepts all database, storage, auth, and
// Edge Function operations locally. ZERO requests to Production.
// ============================================================

import { createClient } from '@supabase/supabase-js'
import {
  isTestingModeActive,
  MockQueryBuilder,
  simulateMockSubmitAttendance,
  getActiveMockRole,
  setActiveMockRole,
  MOCK_ADMIN_USER,
  MOCK_SECURITY_USER,
  MOCK_CS_USER,
  setMockStorageImage,
  getMockStorageImage,
} from './mockSandbox'

// Detect env: Vite provides import.meta.env; Node.js (tests) provides process.env.
function getEnv(key: string, fallback: string): string {
  if (typeof import.meta !== 'undefined' && import.meta.env?.[key]) {
    return import.meta.env[key] as string
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodeProcess = (globalThis as any)['process']
  if (nodeProcess?.env?.[key]) return nodeProcess.env[key] as string
  return fallback
}

const supabaseUrl = getEnv('VITE_SUPABASE_URL', 'https://placeholder.supabase.co')
const supabaseAnonKey = getEnv('VITE_SUPABASE_ANON_KEY', 'placeholder-anon-key')

export const realSupabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})

// Listeners for mock auth state changes
const mockAuthListeners = new Set<(event: string, session: any) => void>()

export function notifyMockAuthStateChange(event: string) {
  const session = getMockCurrentSession()
  mockAuthListeners.forEach(fn => {
    try {
      fn(event, session)
    } catch {}
  })
}

function getMockCurrentUser() {
  const role = getActiveMockRole()
  if (role === 'admin') {
    return {
      id: MOCK_ADMIN_USER.id,
      email: MOCK_ADMIN_USER.email,
      user_metadata: { full_name: MOCK_ADMIN_USER.full_name, role: 'admin' },
      app_metadata: { role: 'admin' },
      aud: 'authenticated',
      created_at: MOCK_ADMIN_USER.created_at,
    }
  }
  if (role === 'Security') {
    return {
      id: MOCK_SECURITY_USER.id,
      email: 'security@sipaten.id',
      user_metadata: {
        full_name: MOCK_SECURITY_USER.full_name,
        role: 'Security',
        employee_id: MOCK_SECURITY_USER.id,
      },
      app_metadata: { role: 'Security' },
      aud: 'authenticated',
      created_at: MOCK_SECURITY_USER.created_at,
    }
  }
  // CS
  return {
    id: MOCK_CS_USER.id,
    email: 'cs@sipaten.id',
    user_metadata: {
      full_name: MOCK_CS_USER.full_name,
      role: 'CS',
      employee_id: MOCK_CS_USER.id,
    },
    app_metadata: { role: 'CS' },
    aud: 'authenticated',
    created_at: MOCK_CS_USER.created_at,
  }
}

function getMockCurrentSession() {
  const user = getMockCurrentUser()
  return {
    access_token: 'mock-sandbox-token-xyz',
    token_type: 'bearer',
    expires_in: 3600,
    refresh_token: 'mock-refresh-token',
    user,
  }
}

// ------------------------------------------------------------
// PROXY CLIENT THAT INTERCEPTS CALLS IN TESTING MODE
// ------------------------------------------------------------

export const supabase = new Proxy(realSupabase, {
  get(target, prop, receiver) {
    if (isTestingModeActive()) {
      // 1. Intercept Database Queries (.from)
      if (prop === 'from') {
        return (tableName: string) => {
          return new MockQueryBuilder(tableName)
        }
      }

      // 2. Intercept Edge Functions (.functions)
      if (prop === 'functions') {
        return {
          invoke: async (functionName: string, options?: any) => {
            if (functionName === 'submit-attendance') {
              const res = simulateMockSubmitAttendance(options?.body || {})
              return { data: res, error: null }
            }
            if (functionName === 'manage-admins') {
              return { data: { admins: [MOCK_ADMIN_USER] }, error: null }
            }
            if (functionName === 'resolve-employee-id') {
              return { data: { employee_id: 'mock-sec-01' }, error: null }
            }
            return {
              data: null,
              error: new Error(`[MOCK SANDBOX] Edge Function '${functionName}' tidak didukung di mode testing.`),
            }
          },
        }
      }

      // 3. Intercept Storage (.storage)
      if (prop === 'storage') {
        return {
          from: (bucketName: string) => ({
            upload: async (path: string, fileData: any) => {
              const strData = typeof fileData === 'string' ? fileData : 'mock_data_blob'
              setMockStorageImage(`${bucketName}/${path}`, strData)
              return { data: { path }, error: null }
            },
            createSignedUrl: async (path: string) => {
              const img = getMockStorageImage(`${bucketName}/${path}`) || getMockStorageImage(path)
              return {
                data: { signedUrl: img || `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100%" height="100%" fill="%23eee"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="12" fill="%23666">MOCK PHOTO</text></svg>` },
                error: null,
              }
            },
            getPublicUrl: (path: string) => {
              const img = getMockStorageImage(`${bucketName}/${path}`) || getMockStorageImage(path)
              return {
                data: { publicUrl: img || `mock://storage/${bucketName}/${path}` },
              }
            },
          }),
        }
      }

      // 4. Intercept Authentication (.auth)
      if (prop === 'auth') {
        return {
          getSession: async () => ({
            data: { session: getMockCurrentSession() },
            error: null,
          }),
          getUser: async () => ({
            data: { user: getMockCurrentUser() },
            error: null,
          }),
          signInWithPassword: async ({ email }: { email?: string }) => {
            if (email?.includes('sec')) {
              setActiveMockRole('Security')
            } else if (email?.includes('cs')) {
              setActiveMockRole('CS')
            } else {
              setActiveMockRole('admin')
            }
            notifyMockAuthStateChange('SIGNED_IN')
            return {
              data: { user: getMockCurrentUser(), session: getMockCurrentSession() },
              error: null,
            }
          },
          signOut: async () => {
            notifyMockAuthStateChange('SIGNED_OUT')
            return { error: null }
          },
          onAuthStateChange: (callback: (event: string, session: any) => void) => {
            mockAuthListeners.add(callback)
            // Immediately dispatch current state
            callback('INITIAL_SESSION', getMockCurrentSession())
            return {
              data: {
                subscription: {
                  unsubscribe: () => mockAuthListeners.delete(callback),
                },
              },
            }
          },
          updateUser: async () => ({
            data: { user: getMockCurrentUser() },
            error: null,
          }),
        }
      }
    }

    // Default: Return standard Supabase client property
    return Reflect.get(target, prop, receiver)
  },
})
