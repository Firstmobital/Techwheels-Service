import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { validateRequest } from '../_shared/auth.ts'
import { logAuditEvent } from '../_shared/audit.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: corsHeaders }
    )
  }

  try {
    const { userId, dealerCode, dealerName } = await req.json()

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

    // Read existing metadata
    const { data: userData, error: readError } = await admin.auth.admin.getUserById(userId)

    if (readError || !userData.user) {
      throw new Error(`User not found: ${readError?.message}`)
    }

    // Merge new dealer fields into existing metadata
    const existingMetadata = userData.user.user_metadata || {}
    const updatedMetadata = {
      ...existingMetadata,
      dealer_code: dealerCode || null,
      dealer_name: dealerName || null,
    }

    // Update user metadata
    const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
      user_metadata: updatedMetadata,
    })

    if (updateError) {
      throw new Error(`Failed to update metadata: ${updateError.message}`)
    }

    // Audit log
    await logAuditEvent({
      actor_id: caller.userId,
      action: 'dealer_metadata_updated',
      resource_type: 'user',
      resource_id: userId,
      details: { dealerCode, dealerName },
      timestamp: new Date().toISOString(),
    })

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: corsHeaders }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('sync-dealer-metadata error:', message)
    return new Response(
      JSON.stringify({ error: message }),
      { status: 401, headers: corsHeaders }
    )
  }
})
