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

      const {
        campaign_name, date_from, date_to,
        // Segmentation filters
        customer_segment = 'all',   // 'all' | 'sold_us' | 'sold_others' | 'last_svc_us' | 'last_svc_others'
        priority_mode = 'service_date', // 'service_date' | 'warranty_expiry' | 'conquest'
        warranty_expiry_days = null,   // e.g. 90 = warranty expiring in 90 days
        powertrain_filter = null,       // 'EV' | 'PV' | null (all)
      } = body

      if (!campaign_name || !date_from || !date_to) {
        throw new Error('Missing campaign_name, date_from, or date_to')
      }

      // OUR dealer name patterns (case-insensitive match)
      const OUR_DEALERS = ['techwheels', 'first mobital', 'firstmobital']
      const isOurDealer = (name: string | null) => {
        if (!name) return false
        const n = name.toLowerCase()
        return OUR_DEALERS.some(d => n.includes(d))
      }

      // Create campaign record
      const { data: campaign, error: campErr } = await serviceClient
        .from('telecall_campaigns')
        .insert({
          campaign_name,
          date_from,
          date_to,
          status: 'active',
          created_by: userEmail,
          customer_segment,
          priority_mode,
          warranty_expiry_days,
          powertrain_filter,
        })
        .select()
        .single()

      if (campErr) throw new Error(`Failed to create campaign: ${campErr.message}`)

      // ── Fetch eligible customers based on mode ────────────────────────────
      let query = serviceClient
        .from('all_service_data')
        .select('id, sold_dealer, last_service_dealer, extended_warranty_end_date, assumed_next_service_date, powertrain_type')
        .not('contact_phones', 'is', null)

      // Warranty expiry mode: filter by warranty end date window instead of service date
      if (priority_mode === 'warranty_expiry' && warranty_expiry_days) {
        const today = new Date().toISOString().split('T')[0]
        const expiry_to = new Date(Date.now() + warranty_expiry_days * 86400000).toISOString().split('T')[0]
        query = query
          .not('extended_warranty_end_date', 'is', null)
          .gte('extended_warranty_end_date', today)
          .lte('extended_warranty_end_date', expiry_to)
      } else {
        // Standard: filter by assumed next service date
        query = query
          .not('assumed_next_service_date', 'is', null)
          .gte('assumed_next_service_date', date_from)
          .lte('assumed_next_service_date', date_to)
      }

      // Powertrain filter
      if (powertrain_filter && powertrain_filter !== 'all') {
        query = query.eq('powertrain_type', powertrain_filter)
      }

      const { data: allCustomers, error: custErr } = await query
      if (custErr) throw new Error(`Failed to fetch customers: ${custErr.message}`)
      if (!allCustomers || allCustomers.length === 0) {
        // Delete the empty campaign
        await serviceClient.from('telecall_campaigns').delete().eq('id', campaign.id)
        return new Response(JSON.stringify({
          success: true,
          campaign_id: null,
          total_leads: 0,
          message: 'No eligible customers found with these filters',
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      // ── Apply segment filter + assign priority scores ─────────────────────
      // Priority scoring (higher = called first via get_next ORDER BY priority_score DESC):
      //   100 = Sold by us + last service at us (best retention target)
      //    80 = Sold by us + last service elsewhere (at-risk, bring back)
      //    60 = Sold elsewhere + last service at us (loyal service customer)
      //    40 = Sold elsewhere + last service elsewhere (conquest target)
      //    20 = Warranty expiring soon + sold by us
      //    10 = Warranty expiring soon + sold elsewhere
      //   + Warranty bonus: +5 if warranty ending within 30 days

      const today = new Date()
      const in30Days = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]

      interface CustomerRow {
        id: number
        sold_dealer: string | null
        last_service_dealer: string | null
        extended_warranty_end_date: string | null
        assumed_next_service_date: string | null
        powertrain_type: string | null
      }

      const scoredCustomers: { customer: CustomerRow; segment: string; score: number }[] = allCustomers.map((c: CustomerRow) => {
        const soldUs = isOurDealer(c.sold_dealer)
        const lastUs = isOurDealer(c.last_service_dealer)
        const warrantyEndingSoon = c.extended_warranty_end_date && c.extended_warranty_end_date <= in30Days
        
        let segment: string
        let score: number

        if (soldUs && lastUs) {
          segment = 'retain_loyal'
          score = 100
        } else if (soldUs && !lastUs) {
          segment = 'retain_atrisk'
          score = 80
        } else if (!soldUs && lastUs) {
          segment = 'retain_service_loyal'
          score = 60
        } else {
          segment = 'conquest'
          score = 40
        }

        // Warranty bonus
        if (warrantyEndingSoon) score += 5

        return { customer: c, segment, score }
      })

      // ── Apply segment filter ──────────────────────────────────────────────
      let filtered = scoredCustomers
      if (customer_segment === 'sold_us') {
        filtered = scoredCustomers.filter(r => r.segment.startsWith('retain'))
      } else if (customer_segment === 'sold_others') {
        filtered = scoredCustomers.filter(r => r.segment === 'conquest' || r.segment === 'retain_service_loyal')
      } else if (customer_segment === 'last_svc_us') {
        filtered = scoredCustomers.filter(r => isOurDealer(r.customer.last_service_dealer))
      } else if (customer_segment === 'last_svc_others') {
        filtered = scoredCustomers.filter(r => r.customer.last_service_dealer && !isOurDealer(r.customer.last_service_dealer))
      } else if (customer_segment === 'warranty_expiring') {
        filtered = scoredCustomers.filter(r => r.customer.extended_warranty_end_date && r.customer.extended_warranty_end_date >= today.toISOString().split('T')[0])
      }
      // else 'all' = keep everything

      if (filtered.length === 0) {
        await serviceClient.from('telecall_campaigns').delete().eq('id', campaign.id)
        return new Response(JSON.stringify({
          success: true,
          campaign_id: null,
          total_leads: 0,
          message: 'No customers match the selected segment filters',
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      // ── Segment summary counts ────────────────────────────────────────────
      const segmentCounts = filtered.reduce((acc: Record<string, number>, r) => {
        acc[r.segment] = (acc[r.segment] || 0) + 1
        return acc
      }, {})

      // ── Insert assignments with priority score ────────────────────────────
      const assignments = filtered.map(r => ({
        campaign_id: campaign.id,
        customer_id: r.customer.id,
        status: 'pending',
        priority_score: r.score,
        customer_segment: r.segment,
      }))

      // Insert in batches of 500
      for (let i = 0; i < assignments.length; i += 500) {
        const { error: asgnErr } = await serviceClient
          .from('telecall_assignments')
          .insert(assignments.slice(i, i + 500))
        if (asgnErr) throw new Error(`Failed to create assignments: ${asgnErr.message}`)
      }

      // Update campaign counts
      await serviceClient
        .from('telecall_campaigns')
        .update({
          total_leads: filtered.length,
          pending_count: filtered.length,
          segment_counts: segmentCounts,
        })
        .eq('id', campaign.id)

      return new Response(JSON.stringify({
        success: true,
        campaign_id: campaign.id,
        total_leads: filtered.length,
        segment_counts: segmentCounts,
        message: `Campaign created with ${filtered.length} leads`,
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

      const asgnId = assignment[0].asgn_id
      const customerId = assignment[0].cust_id

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

      // ── BRIDGE: If status = booked, auto-create a service_bookings record ──
      let servicebooking_id: number | null = null
      if (status === 'booked' && booking_date) {
        // Fetch full customer data for this assignment
        const { data: asgn } = await serviceClient
          .from('telecall_assignments')
          .select('customer_id, assigned_to, campaign_id')
          .eq('id', assignment_id)
          .single()

        if (asgn) {
          const { data: cust } = await serviceClient
            .from('all_service_data')
            .select('first_name, last_name, contact_phones, vehicle_registration_number, model, powertrain_type, assumed_next_service_type')
            .eq('id', asgn.customer_id)
            .single()

          if (cust) {
            // Check if a booking already exists for this assignment (avoid duplicates on re-marking)
            const { data: existingBooking } = await serviceClient
              .from('service_bookings')
              .select('id')
              .eq('telecall_assignment_id', assignment_id)
              .maybeSingle()

            if (!existingBooking) {
              // Build a clean 10-digit phone
              const rawPhone = String(cust.contact_phones || '').replace(/\D/g, '').slice(-10)

              const { data: newBooking, error: bookingErr } = await serviceClient
                .from('service_bookings')
                .insert([{
                  booking_source: 'Telecalling',
                  status: 'New',
                  booking_date: new Date().toISOString().split('T')[0],
                  appointment_date: booking_date,
                  customer_name: [cust.first_name, cust.last_name].filter(Boolean).join(' ').trim() || 'Unknown',
                  customer_phone: rawPhone || '0000000000',
                  reg_number: (cust.vehicle_registration_number || '').toUpperCase().trim(),
                  model: cust.model || null,
                  fuel_type: cust.powertrain_type || null,
                  service_type: cust.assumed_next_service_type || null,
                  caller_name: asgn.assigned_to,
                  call_attempt: 1,
                  call_outcome: 'Connected',
                  call_notes: call_notes || null,
                  telecall_assignment_id: assignment_id,
                  telecall_campaign_id: asgn.campaign_id,
                }])
                .select('id')
                .single()

              if (!bookingErr && newBooking) {
                servicebooking_id = (newBooking as { id: number }).id

                // Back-link the assignment to the booking
                await serviceClient
                  .from('telecall_assignments')
                  .update({ service_booking_id: servicebooking_id })
                  .eq('id', assignment_id)
              }
            } else {
              servicebooking_id = existingBooking.id
            }
          }
        }
      }

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
        service_booking_id: servicebooking_id,
        service_booking_created: servicebooking_id !== null,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }


    // ── ACTION: edit_assignment (update notes/date on an existing assignment) ──
    if (action === 'edit_assignment') {
      const { assignment_id, call_notes, booking_date, callback_date, status } = body
      if (!assignment_id) throw new Error('Missing assignment_id')

      // Verify this assignment belongs to the calling user
      const { data: existing } = await serviceClient
        .from('telecall_assignments')
        .select('id, assigned_to, status, campaign_id')
        .eq('id', assignment_id)
        .single()

      if (!existing) throw new Error('Assignment not found')
      if (existing.assigned_to !== userEmail) throw new Error('Not authorised to edit this assignment')

      const update: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      }

      if (call_notes !== undefined) update.call_notes = call_notes
      if (booking_date !== undefined) update.booking_date = booking_date || null
      if (callback_date !== undefined) update.callback_date = callback_date || null
      if (status !== undefined) update.status = status

      const { error: updateErr } = await serviceClient
        .from('telecall_assignments')
        .update(update)
        .eq('id', assignment_id)

      if (updateErr) throw new Error(`Failed to edit: ${updateErr.message}`)

      // Refresh campaign counts if status changed
      if (status !== undefined) {
        const { data: counts } = await serviceClient
          .from('telecall_assignments')
          .select('status')
          .eq('campaign_id', existing.campaign_id)

        if (counts) {
          const pending = counts.filter(c => ['pending','assigned','calling'].includes(c.status)).length
          const completed = counts.filter(c => ['completed','no_answer','not_reachable','wrong_number','not_interested'].includes(c.status)).length
          const booked = counts.filter(c => c.status === 'booked').length
          await serviceClient
            .from('telecall_campaigns')
            .update({ pending_count: pending, completed_count: completed, booked_count: booked, updated_at: new Date().toISOString() })
            .eq('id', existing.campaign_id)
        }
      }

      return new Response(JSON.stringify({ success: true, message: 'Assignment updated' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
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


    // ── ACTION: update_campaign (admin only) ─────────────────────────────────
    if (action === 'update_campaign') {
      if (!isAdmin) throw new Error('Only admin can edit campaigns')

      const { campaign_id, campaign_name, date_from, date_to, customer_segment, priority_mode, warranty_expiry_days, powertrain_filter } = body
      if (!campaign_id) throw new Error('Missing campaign_id')

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (campaign_name) updates.campaign_name = campaign_name
      if (date_from) updates.date_from = date_from
      if (date_to) updates.date_to = date_to
      if (customer_segment !== undefined) updates.customer_segment = customer_segment
      if (priority_mode !== undefined) updates.priority_mode = priority_mode
      if (warranty_expiry_days !== undefined) updates.warranty_expiry_days = warranty_expiry_days
      if (powertrain_filter !== undefined) updates.powertrain_filter = powertrain_filter

      const { error: updErr } = await serviceClient
        .from('telecall_campaigns')
        .update(updates)
        .eq('id', campaign_id)

      if (updErr) throw new Error(`Failed to update campaign: ${updErr.message}`)

      return new Response(JSON.stringify({
        success: true,
        message: 'Campaign updated',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── ACTION: delete_campaign (admin only) ─────────────────────────────────
    if (action === 'delete_campaign') {
      if (!isAdmin) throw new Error('Only admin can delete campaigns')

      const { campaign_id } = body
      if (!campaign_id) throw new Error('Missing campaign_id')

      // Delete assignments first (FK constraint)
      const { error: delAsgnErr } = await serviceClient
        .from('telecall_assignments')
        .delete()
        .eq('campaign_id', campaign_id)

      if (delAsgnErr) throw new Error(`Failed to delete assignments: ${delAsgnErr.message}`)

      // Delete the campaign
      const { error: delErr } = await serviceClient
        .from('telecall_campaigns')
        .delete()
        .eq('id', campaign_id)

      if (delErr) throw new Error(`Failed to delete campaign: ${delErr.message}`)

      return new Response(JSON.stringify({
        success: true,
        message: 'Campaign deleted',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }


    // ── ACTION: preview_campaign (admin: see lead counts before creating) ──
    if (action === 'preview_campaign') {
      if (!isAdmin) throw new Error('Only admin can preview campaigns')

      const {
        date_from, date_to,
        customer_segment = 'all',
        priority_mode = 'service_date',
        warranty_expiry_days = null,
        powertrain_filter = null,
      } = body

      const OUR_DEALERS = ['techwheels', 'first mobital', 'firstmobital']
      const isOurDealer = (name: string | null) => {
        if (!name) return false
        const n = name.toLowerCase()
        return OUR_DEALERS.some(d => n.includes(d))
      }

      let query = serviceClient
        .from('all_service_data')
        .select('id, sold_dealer, last_service_dealer, extended_warranty_end_date, assumed_next_service_date, powertrain_type')
        .not('contact_phones', 'is', null)

      if (priority_mode === 'warranty_expiry' && warranty_expiry_days) {
        const today = new Date().toISOString().split('T')[0]
        const expiry_to = new Date(Date.now() + warranty_expiry_days * 86400000).toISOString().split('T')[0]
        query = query.not('extended_warranty_end_date', 'is', null).gte('extended_warranty_end_date', today).lte('extended_warranty_end_date', expiry_to)
      } else if (date_from && date_to) {
        query = query.not('assumed_next_service_date', 'is', null).gte('assumed_next_service_date', date_from).lte('assumed_next_service_date', date_to)
      }

      if (powertrain_filter && powertrain_filter !== 'all') {
        query = query.eq('powertrain_type', powertrain_filter)
      }

      const { data: customers, error: custErr } = await query
      if (custErr) throw new Error(`Preview fetch failed: ${custErr.message}`)

      const today = new Date().toISOString().split('T')[0]
      const in30Days = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]

      interface PreviewRow { id: number; sold_dealer: string|null; last_service_dealer: string|null; extended_warranty_end_date: string|null; powertrain_type: string|null }
      
      const counts = {
        total: 0,
        retain_loyal: 0,       // Sold us + last svc us
        retain_atrisk: 0,      // Sold us + last svc others
        retain_service_loyal: 0, // Sold others + last svc us
        conquest: 0,           // Sold others + last svc others
        warranty_soon: 0,      // warranty ending in 30 days
        ev: 0,
        pv: 0,
      }

      for (const c of (customers || []) as PreviewRow[]) {
        const soldUs = isOurDealer(c.sold_dealer)
        const lastUs = isOurDealer(c.last_service_dealer)
        const wSoon = c.extended_warranty_end_date && c.extended_warranty_end_date >= today && c.extended_warranty_end_date <= in30Days

        let seg: string
        if (soldUs && lastUs) seg = 'retain_loyal'
        else if (soldUs && !lastUs) seg = 'retain_atrisk'
        else if (!soldUs && lastUs) seg = 'retain_service_loyal'
        else seg = 'conquest'

        counts[seg as keyof typeof counts] = (counts[seg as keyof typeof counts] as number) + 1
        if (wSoon) counts.warranty_soon++
        if (c.powertrain_type === 'EV') counts.ev++
        else if (c.powertrain_type === 'PV') counts.pv++
        counts.total++
      }

      // Filtered count based on customer_segment
      let filtered = counts.total
      if (customer_segment === 'sold_us') filtered = counts.retain_loyal + counts.retain_atrisk
      else if (customer_segment === 'sold_others') filtered = counts.conquest + counts.retain_service_loyal
      else if (customer_segment === 'last_svc_us') filtered = counts.retain_loyal + counts.retain_service_loyal
      else if (customer_segment === 'last_svc_others') filtered = counts.retain_atrisk + counts.conquest
      else if (customer_segment === 'warranty_expiring') filtered = counts.warranty_soon

      return new Response(JSON.stringify({
        success: true,
        counts,
        filtered_count: filtered,
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
