import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://xwmvoqizclvbdftyolmh.supabase.co'
const ANON_KEY = 'sb_publishable_Sfp8aVcNcg07axIjTXxwaw_iUl25atF'

const supabase = createClient(SUPABASE_URL, ANON_KEY)

async function main() {
  const { data: auth, error: loginErr } = await supabase.auth.signInWithPassword({
    email: 'reezyfbi4@gmail.com',
    password: 'admin123'
  })

  if (loginErr) {
    console.error('Login error:', loginErr)
    return
  }

  console.log('Logged in as:', auth.user.email)

  const { data: settings, error: err1 } = await supabase.from('attendance_settings').select('*')
  console.log('--- SETTINGS ---')
  if (err1) console.error(err1)
  else settings.forEach(s => console.log(s.setting_key, '=>', JSON.stringify(s.setting_value)))

  const { data: emp, error: err2 } = await supabase.from('employee_profiles').select('*').limit(10)
  console.log('--- EMPLOYEES ---')
  if (err2) console.error(err2)
  else console.log(emp?.map(e => ({ name: e.full_name, role: e.employee_role, default_shift: e.default_shift })))

  const { data: att, error: err3 } = await supabase.from('attendance_records').select('*').order('created_at', { ascending: false }).limit(10)
  console.log('--- RECENT ATTENDANCE RECORDS ---')
  if (err3) console.error(err3)
  else console.log(att?.map(a => ({ name: a.employee_name, type: a.attendance_type, shift: a.shift, work_date: a.work_date, status: a.attendance_status })))
}

main()
