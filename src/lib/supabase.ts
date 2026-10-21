import { createClient } from '@supabase/supabase-js'

// Detect env: Vite provides import.meta.env; Node.js (tests) provides process.env.
// We use a conditional that is dead-code-eliminated by bundlers in browser builds.
function getEnv(key: string, fallback: string): string {
  // Vite replaces import.meta.env at build time
  if (typeof import.meta !== 'undefined' && import.meta.env?.[key]) {
    return import.meta.env[key] as string
  }
  // Node.js test environment: access via dynamic expression to avoid TS2591 in Vite tsconfig
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodeProcess = (globalThis as any)['process']
  if (nodeProcess?.env?.[key]) return nodeProcess.env[key] as string
  return fallback
}

const supabaseUrl = getEnv('VITE_SUPABASE_URL', 'https://placeholder.supabase.co')
const supabaseAnonKey = getEnv('VITE_SUPABASE_ANON_KEY', 'placeholder-anon-key')

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})
