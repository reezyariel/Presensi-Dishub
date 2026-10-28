import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://xwmvoqizclvbdftyolmh.supabase.co'
const ANON_KEY = 'sb_publishable_Sfp8aVcNcg07axIjTXxwaw_iUl25atF'

const supabase = createClient(SUPABASE_URL, ANON_KEY)

async function main() {
  await supabase.auth.signInWithPassword({
    email: 'reezyfbi4@gmail.com',
    password: 'admin123'
  })

  // Fetch 1 record to see all keys
  const { data, error } = await supabase.from('attendance_records').select('*').limit(1)
  console.log('Record sample keys:', data ? Object.keys(data[0] || {}) : error)
}

main()
