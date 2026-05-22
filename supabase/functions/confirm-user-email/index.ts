import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { validateRequest } from '../_shared/auth.ts'
import { logAuditEvent } from '../_shared/audit.ts'

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Only POST allowed
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: corsHeaders }
    )
  }

  try {
    // Parse and validate request
    const { userId } = await req.json()
    if (!userId || typeof userId !== 'string') {
      return new Response(
        JSON.stringify({ error: 'userId required (string)' }),
        { status: 400, headers: corsHeaders }
      )
    }

    // Validate caller is admin
    const caller = await validateRequest(req)

    // Get service role client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    if (!serviceRoleKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured')
    }

    const admin = createClient(supabaseUrl, serviceRoleKey)

    // Confirm email
    const { error } = await admin.auth.admin.updateUserById(userId, {
      email_confirm: true,
    })

    if (error) {
      console.error('Email confirm error:', error)
      return new Response(
        JSON.stringify({ error: `Failed to confirm email: ${error.message}` }),
        { status: 500, headers: corsHeaders }
      )
    }

    // Audit log
    await logAuditEvent({
      actor_id: caller.userId,
      action: 'email_confirmed',
      resource_type: 'user',
      resource_id: userId,
      details: { timestamp: new Date().toISOString() },
      timestamp: new Date().toISOString(),
    })

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: corsHeaders }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('confirm-user-email error:', message)
    return new Response(
      JSON.stringify({ error: message }),
      { status: 401, headers: corsHeaders }
    )
  }
})
