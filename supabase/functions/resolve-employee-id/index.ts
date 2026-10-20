// Supabase Edge Function: resolve-employee-id
// Securely maps Employee ID / username to registered auth email using service role
// Serves Deno / Supabase Edge Functions runtime

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: 'Kredensial server Supabase tidak ditemukan.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const body = await req.json().catch(() => ({}))
    const identifier = typeof body.identifier === 'string' ? body.identifier.trim() : ''

    if (!identifier) {
      return new Response(
        JSON.stringify({ error: 'ID Karyawan wajib diisi.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const normalized = identifier.toLowerCase().replace(/\s+/g, ' ')

    // 1. Check employee_profiles by id (UUID) or normalized_name
    let targetEmail: string | null = null

    // Check if identifier is UUID
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier)

    // Query auth.users via admin API to find matching user_metadata or email
    const { data: usersData, error: usersErr } = await supabase.auth.admin.listUsers({
      perPage: 100,
    })

    if (!usersErr && usersData?.users) {
      for (const u of usersData.users) {
        if (!u.email) continue

        // Check if user ID matches
        if (isUuid && u.id === identifier) {
          targetEmail = u.email
          break
        }

        // Check user_metadata employee_id or employee_code
        const metaEmpId = u.user_metadata?.employee_id || u.user_metadata?.employee_code
        if (metaEmpId && String(metaEmpId).toLowerCase() === normalized) {
          targetEmail = u.email
          break
        }

        // Check user_metadata full_name
        const metaName = u.user_metadata?.full_name ? String(u.user_metadata.full_name).toLowerCase().trim() : ''
        if (metaName && metaName === normalized) {
          targetEmail = u.email
          break
        }
      }
    }

    if (!targetEmail) {
      return new Response(
        JSON.stringify({
          error: `ID Karyawan "${identifier}" tidak terhubung dengan akun autentikasi. Silakan masuk menggunakan Email resmi Anda.`,
          found: false,
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        email: targetEmail,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Kesalahan server saat memetakan ID karyawan.'
    return new Response(
      JSON.stringify({ error: errorMsg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
