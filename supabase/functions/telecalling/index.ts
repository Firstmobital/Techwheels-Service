import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // Validate user
    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace('Bearer ', '')
    if (!token) throw new Error('Missing auth token')

    const authClient = createClient(supabaseUrl, anonKey)
    const { data: { user }, error: authErr } = await authClient.auth.getUser(token)
    if (authErr || !user) throw new Error('Invalid token')

    const serviceClient = createClient(supabaseUrl, serviceRoleKey)

    // Get user's email + role
    const { data: userData } = await serviceClient
      .from('users')
      .select('email, role')
      .eq('id', user.id)
      .single()

    if (!userData) throw new Error('User not found')
    const userEmail = userData.email
    const isAdmin = userData.role === 'admin'

    const body = await req.json()
    const action = body.action

    // ── ACTION: create_campaign (admin only) ──────────────────────────────
    if (action === 'create_campaign') {
      if (!isAdmin) throw new Error('Only admin can create campaigns')

      const { campaign_name, date_from, date_to } = body
      if (!campaign_name || !date_from || !date_to) {
        throw new Error('Missing campaign_name, date_from, or date_to')
      }

      // Create campaign
      const { data: campaign, error: campErr } = await serviceClient
        .from('telecall_campaigns')
        .insert({
          campaign_name,
          date_from,
          date_to,
          status: 'active',
          created_by: userEmail,
        })
        .select()
        .single()

      if (campErr) throw new Error(`Failed to create campaign: ${campErr.message}`)

      // Fetch eligible customers
      const { data: customers, error: custErr } = await serviceClient
        .from('all_service_data')
        .select('id')
        .not('assumed_next_service_date', 'is', null)
        .gte('assumed_next_service_date', date_from)
        .lte('assumed_next_service_date', date_to)
        .not('contact_phones', 'is', null)

      if (custErr) throw new Error(`Failed to fetch customers: ${custErr.message}`)

      if (!customers || customers.length === 0) {
        return new Response(JSON.stringify({
          success: true,
          campaign_id: campaign.id,
          total_leads: 0,
          message: 'No eligible customers found in this date range',
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      // Insert assignments (all as pending, unassigned)
      const assignments = customers.map((c: { id: number }) => ({
        campaign_id: campaign.id,
        customer_id: c.id,
        status: 'pending',
      }))

      const { error: asgnErr } = await serviceClient
        .from('telecall_assignments')
        .insert(assignments)

      if (asgnErr) throw new Error(`Failed to create assignments: ${asgnErr.message}`)

      // Update campaign counts
      await serviceClient
        .from('telecall_campaigns')
        .update({
          total_leads: customers.length,
          pending_count: customers.length,
        })
        .eq('id', campaign.id)

      return new Response(JSON.stringify({
        success: true,
        campaign_id: campaign.id,
        total_leads: customers.length,
        message: `Campaign created with ${customers.length} leads`,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── ACTION: get_next (telecaler pulls next customer) ──────────────────
    if (action === 'get_next') {
      const { campaign_id } = body
      if (!campaign_id) throw new Error('Missing campaign_id')

      // Atomic: pick next pending, assign to this user
      // Use RPC-style atomic update via raw SQL
      const { data: assignment, error: pickErr } = await serviceClient
        .rpc('telecall_get_next_assignment', {
          p_campaign_id: campaign_id,
          p_user_email: userEmail,
        })

      if (pickErr) throw new Error(`Failed to get next: ${pickErr.message}`)

      if (!assignment || assignment.length === 0) {
        return new Response(JSON.stringify({
          success: true,
          assignment: null,
          message: 'No more pending customers in this campaign',
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      const asgnId = assignment[0].id
      const customerId = assignment[0].customer_id

      // Fetch full customer data
      const { data: customer, error: custErr } = await serviceClient
        .from('all_service_data')
        .select(`
          id, chassis_no, vehicle_registration_number, first_name, last_name,
          contact_phones, model, powertrain_type, product_line,
          assumed_next_service_date, assumed_next_service_type,
          last_service_date, last_service_type, last_service_km,
          last_service_dealer, last_service_customer_mobile_no,
          sold_dealer, extended_warranty_end_date, extended_warranty_product
        `)
        .eq('id', customerId)
        .single()

      if (custErr) throw new Error(`Failed to fetch customer: ${custErr.message}`)

      return new Response(JSON.stringify({
        success: true,
        assignment: {
          id: asgnId,
          campaign_id,
          customer,
        },
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── ACTION: update_status (telecaler updates call result) ─────────────
    if (action === 'update_status') {
      const { assignment_id, status, call_notes, booking_date, callback_date } = body
      if (!assignment_id || !status) throw new Error('Missing assignment_id or status')

      const update: Record<string, unknown> = {
        status,
        called_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      if (call_notes !== undefined) update.call_notes = call_notes
      if (booking_date) update.booking_date = booking_date
      if (callback_date) update.callback_date = callback_date

      // If no_answer, increment counter and auto-remove after 3
      if (status === 'no_answer') {
        const { data: current } = await serviceClient
          .from('telecall_assignments')
          .select('no_answer_count, call_count')
          .eq('id', assignment_id)
          .single()

        const newNoAnswerCount = (current?.no_answer_count || 0) + 1
        const newCallCount = (current?.call_count || 0) + 1

        update.no_answer_count = newNoAnswerCount
        update.call_count = newCallCount

        // After 3 no-answers, mark as not_reachable
        if (newNoAnswerCount >= 3) {
          update.status = 'not_reachable'
        }
      } else {
        // For other statuses, just increment call_count
        const { data: current } = await serviceClient
          .from('telecall_assignments')
          .select('call_count')
          .eq('id', assignment_id)
          .single()
        update.call_count = (current?.call_count || 0) + 1
      }

      const { error: updateErr } = await serviceClient
        .from('telecall_assignments')
        .update(update)
        .eq('id', assignment_id)

      if (updateErr) throw new Error(`Failed to update: ${updateErr.message}`)

      // Update campaign counts
      const { data: counts } = await serviceClient
        .from('telecall_assignments')
        .select('status')
        .eq('campaign_id', body.campaign_id)

      if (counts) {
        const pending = counts.filter(c => c.status === 'pending' || c.status === 'assigned' || c.status === 'calling').length
        const completed = counts.filter(c => ['completed', 'no_answer', 'not_reachable', 'wrong_number', 'not_interested'].includes(c.status)).length
        const booked = counts.filter(c => c.status === 'booked').length

        await serviceClient
          .from('telecall_campaigns')
          .update({
            pending_count: pending,
            completed_count: completed,
            booked_count: booked,
            updated_at: new Date().toISOString(),
          })
          .eq('id', body.campaign_id)
      }

      return new Response(JSON.stringify({
        success: true,
        message: 'Status updated',
        auto_marked_unreachable: status === 'no_answer' && (update.no_answer_count as number) >= 3,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── ACTION: my_queue (telecaler's active assignments) ─────────────────
    if (action === 'my_queue') {
      const { campaign_id } = body

      let query = serviceClient
        .from('telecall_assignments')
        .select(`
          id, campaign_id, status, call_notes, booking_date, callback_date,
          called_at, call_count, no_answer_count, whatsapp_sent, whatsapp_status,
          assigned_at,
          customer:customer_id (
            id, first_name, last_name, contact_phones, model, powertrain_type,
            vehicle_registration_number, assumed_next_service_date, assumed_next_service_type,
            last_service_date, last_service_type, last_service_km
          )
        `)
        .eq('assigned_to', userEmail)
        .in('status', ['assigned', 'calling', 'callback_later', 'booked'])

      if (campaign_id) {
        query = query.eq('campaign_id', campaign_id)
      }

      const { data: queue, error: queueErr } = await query.order('assigned_at', { ascending: false })

      if (queueErr) throw new Error(`Failed to fetch queue: ${queueErr.message}`)

      return new Response(JSON.stringify({
        success: true,
        queue: queue || [],
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── ACTION: my_summary (telecaler's daily stats) ──────────────────────
    if (action === 'my_summary') {
      const today = new Date().toISOString().split('T')[0]

      const { data: todayCalls, error: sumErr } = await serviceClient
        .from('telecall_assignments')
        .select('status')
        .eq('assigned_to', userEmail)
        .gte('called_at', today + 'T00:00:00+00:00')

      if (sumErr) throw new Error(`Failed to fetch summary: ${sumErr.message}`)

      const summary = {
        total_calls: todayCalls?.length || 0,
        booked: todayCalls?.filter(c => c.status === 'booked').length || 0,
        no_answer: todayCalls?.filter(c => c.status === 'no_answer').length || 0,
        not_interested: todayCalls?.filter(c => c.status === 'not_interested').length || 0,
        callback_later: todayCalls?.filter(c => c.status === 'callback_later').length || 0,
        wrong_number: todayCalls?.filter(c => c.status === 'wrong_number').length || 0,
        not_reachable: todayCalls?.filter(c => c.status === 'not_reachable').length || 0,
      }

      return new Response(JSON.stringify({
        success: true,
        summary,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── ACTION: campaign_stats (admin dashboard) ──────────────────────────
    if (action === 'campaign_stats') {
      if (!isAdmin) throw new Error('Only admin can view campaign stats')

      const { data: campaigns, error: campErr } = await serviceClient
        .from('telecall_campaigns')
        .select('*')
        .order('created_at', { ascending: false })

      if (campErr) throw new Error(`Failed to fetch campaigns: ${campErr.message}`)

      // Get per-telecaler breakdown for active campaign
      const { data: telecalers, error: tcErr } = await serviceClient
        .from('telecall_assignments')
        .select('assigned_to, status')
        .not('assigned_to', 'is', null)

      if (tcErr) throw new Error(`Failed to fetch telecaler stats: ${tcErr.message}`)

      // Group by telecaler
      const telecalerStats: Record<string, Record<string, number>> = {}
      for (const t of telecalers || []) {
        if (!t.assigned_to) continue
        if (!telecalerStats[t.assigned_to]) telecalerStats[t.assigned_to] = {}
        telecalerStats[t.assigned_to][t.status] = (telecalerStats[t.assigned_to][t.status] || 0) + 1
      }

      // Get bookings
      const { data: bookings, error: bookErr } = await serviceClient
        .from('telecall_assignments')
        .select(`
          id, booking_date, call_notes, assigned_to, called_at,
          customer:customer_id (first_name, last_name, contact_phones, model, vehicle_registration_number)
        `)
        .eq('status', 'booked')
        .order('called_at', { ascending: false })

      if (bookErr) throw new Error(`Failed to fetch bookings: ${bookErr.message}`)

      return new Response(JSON.stringify({
        success: true,
        campaigns: campaigns || [],
        telecaler_stats: telecalerStats,
        bookings: bookings || [],
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── ACTION: close_campaign ────────────────────────────────────────────
    if (action === 'close_campaign') {
      if (!isAdmin) throw new Error('Only admin can close campaigns')

      const { campaign_id } = body
      if (!campaign_id) throw new Error('Missing campaign_id')

      const { error: closeErr } = await serviceClient
        .from('telecall_campaigns')
        .update({ status: 'closed', updated_at: new Date().toISOString() })
        .eq('id', campaign_id)

      if (closeErr) throw new Error(`Failed to close campaign: ${closeErr.message}`)

      return new Response(JSON.stringify({
        success: true,
        message: 'Campaign closed',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    throw new Error(`Unknown action: ${action}`)

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
}

Deno.serve(handler)
