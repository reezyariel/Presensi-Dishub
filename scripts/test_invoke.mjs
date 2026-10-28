import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://xwmvoqizclvbdftyolmh.supabase.co'
const ANON_KEY = 'sb_publishable_Sfp8aVcNcg07axIjTXxwaw_iUl25atF'

const supabase = createClient(SUPABASE_URL, ANON_KEY)

async function main() {
  const res = await supabase.functions.invoke('submit-attendance', {
    body: { employee_name: 'test' }
  })
  if (res.error) {
    const json = await res.error.context.json()
    console.log('Error context JSON:', json)
  }
}

main()
