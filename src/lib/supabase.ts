import { createClient } from '@supabase/supabase-js'

const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : (process.env as unknown as Record<string, string>)
const supabaseUrl = (env?.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co') as string
const supabaseAnonKey = (env?.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'placeholder-anon-key') as string

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})
