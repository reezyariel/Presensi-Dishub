import { createClient } from "@supabase/supabase-js"
const SUPABASE_URL = "https://xwmvoqizclvbdftyolmh.supabase.co"
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
if (!SERVICE_ROLE_KEY) { console.error("ERROR: Set SUPABASE_SERVICE_ROLE_KEY env var"); process.exit(1) }
const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const ACCOUNTS = [
  { email: "cs.demo@shifttrack.app", password: "ShiftTrack@CS001", meta: { full_name: "Demo CS Officer", role: "CS", employee_id: "CS001" }, profile: { full_name: "Demo CS Officer", normalized_name: "demo cs officer", employee_role: "CS", default_shift: null, is_active: true, notes: "Demo account - CS" } },
  { email: "security.demo@shifttrack.app", password: "ShiftTrack@SEC001", meta: { full_name: "Demo Security Officer", role: "Security", employee_id: "SEC001" }, profile: { full_name: "Demo Security Officer", normalized_name: "demo security officer", employee_role: "Security", default_shift: "Shift I", is_active: true, notes: "Demo account - Security" } },
]
async function run() {
  for (const acc of ACCOUNTS) {
    console.log("Provisioning:", acc.email)
    const { data: ul } = await sb.auth.admin.listUsers({ perPage: 200 })
    const existing = ul?.users?.find(u => u.email === acc.email)
    let uid
    if (existing) {
      uid = existing.id
      await sb.auth.admin.updateUserById(uid, { password: acc.password, user_metadata: acc.meta, email_confirm: true })
      console.log("  Updated existing auth user:", uid)
    } else {
      const { data: nu, error: e } = await sb.auth.admin.createUser({ email: acc.email, password: acc.password, user_metadata: acc.meta, email_confirm: true })
      if (e || !nu?.user) { console.error("  CREATE FAILED:", e?.message); continue }
      uid = nu.user.id
      console.log("  Created auth user:", uid)
    }
    const { data: ep } = await sb.from("employee_profiles").select("id").eq("normalized_name", acc.profile.normalized_name).eq("employee_role", acc.profile.employee_role).maybeSingle()
    if (ep) {
      const { error: le } = await sb.from("employee_profiles").update({ auth_uid: uid }).eq("id", ep.id)
      console.log("  Linked auth_uid to profile:", ep.id, le ? "ERR:"+le.message : "OK")
    } else {
      const { data: np, error: ie } = await sb.from("employee_profiles").insert({ ...acc.profile, auth_uid: uid }).select("id").single()
      console.log("  Inserted profile:", np?.id, ie ? "ERR:"+ie.message : "OK")
    }
  }
  console.log("Done! CS: cs.demo@shifttrack.app / ShiftTrack@CS001 | Security: security.demo@shifttrack.app / ShiftTrack@SEC001")
}
run().catch(console.error)
