import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://xwmvoqizclvbdftyolmh.supabase.co'
const ANON_KEY = 'sb_publishable_Sfp8aVcNcg07axIjTXxwaw_iUl25atF'

const supabase = createClient(SUPABASE_URL, ANON_KEY)

async function testLogin(identifier: string, pass: string, expectedRole: string) {
  console.log(`\n========================================`)
  console.log(`Testing Login for: "${identifier}"`)

  let emailToUse = identifier
  if (!identifier.includes('@')) {
    const { data: resolvedEmail, error: rpcErr } = await supabase.rpc('resolve_employee_identifier', {
      p_identifier: identifier,
    })
    if (rpcErr) {
      console.error(`RPC resolution error:`, rpcErr)
    } else {
      console.log(`RPC resolved "${identifier}" -> "${resolvedEmail}"`)
      if (resolvedEmail) emailToUse = resolvedEmail
    }
  }

  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: emailToUse,
    password: pass,
  })

  if (authErr) {
    console.error(`❌ Auth FAILED for ${identifier}:`, authErr.message)
    return false
  }

  const user = authData.user
  console.log(`✅ Auth SUCCESS! User UID: ${user.id}, Email: ${user.email}`)

  // Test admin_profiles lookup
  const { data: adminProf } = await supabase
    .from('admin_profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  if (adminProf) {
    console.log(`Admin profile found:`, adminProf.full_name, `Role: admin`)
  }

  // Test employee_profiles lookup
  const { data: empProf, error: empErr } = await supabase
    .from('employee_profiles')
    .select('*')
    .or(`auth_uid.eq.${user.id},id.eq.${user.id}`)
    .maybeSingle()

  if (empErr) {
    console.error(`Error reading employee_profiles:`, empErr.message)
  } else if (empProf) {
    console.log(`Employee profile found:`, empProf.full_name, `Role: ${empProf.employee_role}`)
  } else {
    console.log(`No direct employee_profiles found, metadata role:`, user.user_metadata?.role)
  }

  // Test reading attendance_records
  const { data: records, error: recErr } = await supabase
    .from('attendance_records')
    .select('id, employee_name, category, attendance_type, work_date')
    .limit(3)

  if (recErr) {
    console.error(`Attendance records read error:`, recErr.message)
  } else {
    console.log(`Attendance records accessible (count: ${records?.length || 0})`)
  }

  await supabase.auth.signOut()
  return true
}

async function main() {
  console.log('--- Testing SIPATEN Auth Logins ---')

  // 1. Test CS with employee ID
  await testLogin('CS001', 'password123', 'CS')

  // 2. Test CS with email
  await testLogin('cs@SIPATEN.app', 'password123', 'CS')

  // 3. Test Security with employee ID
  await testLogin('sec001', 'password123', 'Security')

  // 4. Test Security with email
  await testLogin('security@SIPATEN.app', 'password123', 'Security')

  console.log('\n--- Finished Test ---')
}

main().catch(console.error)
