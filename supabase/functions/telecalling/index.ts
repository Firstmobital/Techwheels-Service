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

    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace('Bearer ', '')
    if (!token) throw new Error('Missing auth token')

    const authClient = createClient(supabaseUrl, anonKey)
    const { data: { user }, error: authErr } = await authClient.auth.getUser(token)
    if (authErr || !user) throw new Error(`Auth failed: ${authErr?.message || 'no user returned for token'}`)

    const serviceClient = createClient(supabaseUrl, serviceRoleKey)

    const { data: userData, error: userErr } = await serviceClient
      .from('users')
      .select('email, role, full_name')
      .eq('id', user.id)
      .maybeSingle()

    if (userErr) throw new Error(`DB error looking up user ${user.id}: ${userErr.message}`)
    if (!userData) throw new Error(`User not found in public.users for auth id: ${user.id} email: ${user.email}`)
    if (!userData.email) throw new Error(`User found but email is null for id: ${user.id}`)
    const userEmail = userData.email
    const isAdmin = userData.role === 'admin'
    const callerName = userData.full_name || userEmail

    const body = await req.json()
    const action = body.action

    const OUR_DEALERS = ['techwheels', 'first mobital', 'firstmobital']
    const isOurDealer = (name: string | null) => {
      if (!name) return false
      const n = name.toLowerCase()
      return OUR_DEALERS.some(d => n.includes(d))
    }

    // ── ACTION: create_campaign ───────────────────────────────────────────
    if (action === 'create_campaign') {
      if (!isAdmin) throw new Error('Only admin can create campaigns')

      const {
        campaign_name,
        date_from: date_from_raw,
        date_to: date_to_raw,
        upcoming_days = null,        // e.g. 20 → service due in next 20 days from today
        customer_segment = 'all',
        priority_mode = 'service_date',
        warranty_expiry_days = null,
        powertrain_filter = null,
      } = body

      if (!campaign_name) throw new Error('Missing campaign_name')

      // For service_date mode: derive date range from today + upcoming_days (server-side, IST)
      // This ensures the range is always fresh relative to today
      const todayIST = new Date(Date.now() + 5.5 * 3600000).toISOString().split('T')[0]
      let date_from: string
      let date_to: string

      if (priority_mode === 'service_date' || (!priority_mode)) {
        if (upcoming_days) {
          // Dynamic mode: today → today + N days
          date_from = todayIST
          date_to = new Date(Date.now() + 5.5 * 3600000 + Number(upcoming_days) * 86400000).toISOString().split('T')[0]
        } else if (date_from_raw && date_to_raw) {
          // Legacy fixed-date mode: still supported
          date_from = date_from_raw
          date_to = date_to_raw
        } else {
          throw new Error('For service reminder campaigns, provide either upcoming_days (e.g. 20) or date_from + date_to')
        }
      } else {
        // For warranty/insurance modes, dates are computed below; use raw or placeholder
        date_from = date_from_raw || todayIST
        date_to = date_to_raw || todayIST
      }

      const { data: campaign, error: campErr } = await serviceClient
        .from('telecall_campaigns')
        .insert({ campaign_name, date_from, date_to, status: 'active', created_by: userEmail, customer_segment, priority_mode, warranty_expiry_days, powertrain_filter })
        .select().single()

      if (campErr) throw new Error(`Failed to create campaign: ${campErr.message}`)

      let query = serviceClient
        .from('all_service_data')
        .select('id, chassis_no, sold_dealer, last_service_dealer, extended_warranty_end_date, assumed_next_service_date, powertrain_type, last_insurance_expiry_date')
        .not('contact_phones', 'is', null)
        .neq('contact_phones', '')

      if (priority_mode === 'warranty_expiry' && warranty_expiry_days) {
        const today = new Date().toISOString().split('T')[0]
        const expiry_to = new Date(Date.now() + warranty_expiry_days * 86400000).toISOString().split('T')[0]
        query = query.not('extended_warranty_end_date', 'is', null).gte('extended_warranty_end_date', today).lte('extended_warranty_end_date', expiry_to)
      } else if (priority_mode === 'insurance_expiry') {
        const today = new Date().toISOString().split('T')[0]
        const expiry_to = new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0]
        query = query.not('last_insurance_expiry_date', 'is', null).gte('last_insurance_expiry_date', today).lte('last_insurance_expiry_date', expiry_to)
      } else {
        query = query.not('assumed_next_service_date', 'is', null).gte('assumed_next_service_date', date_from).lte('assumed_next_service_date', date_to)
      }

      if (powertrain_filter && powertrain_filter !== 'all') query = query.eq('powertrain_type', powertrain_filter)

      const { data: allCustomers, error: custErr } = await query
      if (custErr) throw new Error(`Failed to fetch customers: ${custErr.message}`)

      if (!allCustomers || allCustomers.length === 0) {
        await serviceClient.from('telecall_campaigns').delete().eq('id', campaign.id)
        return new Response(JSON.stringify({ success: true, campaign_id: null, total_leads: 0, message: `No customers found with service due between ${date_from} and ${date_to}. Check date range.` }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      // Deduplicate by chassis_no
      const seenChassis = new Set<string>()
      const uniqueCustomers = (allCustomers as any[]).filter((c: any) => {
        if (!c.chassis_no) return true
        if (seenChassis.has(c.chassis_no)) return false
        seenChassis.add(c.chassis_no)
        return true
      })

      const in30Days = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]

      const scoredCustomers = uniqueCustomers.map((c: any) => {
        const soldUs = isOurDealer(c.sold_dealer)
        const lastUs = isOurDealer(c.last_service_dealer)
        const warrantyEndingSoon = c.extended_warranty_end_date && c.extended_warranty_end_date <= in30Days
        let segment: string
        let score: number
        if (soldUs && lastUs) { segment = 'retain_loyal'; score = 100 }
        else if (soldUs && !lastUs) { segment = 'retain_atrisk'; score = 80 }
        else if (!soldUs && lastUs) { segment = 'retain_service_loyal'; score = 60 }
        else { segment = 'conquest'; score = 40 }
        if (warrantyEndingSoon) score += 5
        return { customer: c, segment, score }
      })

      let filtered = scoredCustomers
      if (customer_segment === 'sold_us') filtered = scoredCustomers.filter((r: any) => r.segment === 'retain_loyal' || r.segment === 'retain_atrisk')
      else if (customer_segment === 'sold_others') filtered = scoredCustomers.filter((r: any) => r.segment === 'conquest' || r.segment === 'retain_service_loyal')
      else if (customer_segment === 'last_svc_us') filtered = scoredCustomers.filter((r: any) => isOurDealer(r.customer.last_service_dealer))
      else if (customer_segment === 'last_svc_others') filtered = scoredCustomers.filter((r: any) => r.customer.last_service_dealer && !isOurDealer(r.customer.last_service_dealer))
      else if (customer_segment === 'warranty_expiring') {
        const today = new Date().toISOString().split('T')[0]
        filtered = scoredCustomers.filter((r: any) => r.customer.extended_warranty_end_date && r.customer.extended_warranty_end_date >= today)
      }

      if (filtered.length === 0) {
        await serviceClient.from('telecall_campaigns').delete().eq('id', campaign.id)
        return new Response(JSON.stringify({ success: true, campaign_id: null, total_leads: 0, message: 'No customers match segment filters' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      const segmentCounts = filtered.reduce((acc: Record<string, number>, r: any) => { acc[r.segment] = (acc[r.segment] || 0) + 1; return acc }, {} as Record<string, number>)
      const assignments = filtered.map((r: any) => ({ campaign_id: campaign.id, customer_id: r.customer.id, status: 'pending', priority_score: r.score, customer_segment: r.segment }))

      for (let i = 0; i < assignments.length; i += 500) {
        const { error: asgnErr } = await serviceClient.from('telecall_assignments').insert(assignments.slice(i, i + 500))
        if (asgnErr) throw new Error(`Failed to create assignments: ${asgnErr.message}`)
      }

      await serviceClient.from('telecall_campaigns').update({ total_leads: filtered.length, pending_count: filtered.length }).eq('id', campaign.id)

      // Log stats for visibility
      const statsMsg = `Campaign "${campaign_name}": ${allCustomers.length} raw → ${uniqueCustomers.length} after chassis dedup → ${filtered.length} after segment filter. Date range: ${date_from} to ${date_to}`
      console.log(statsMsg)

      return new Response(JSON.stringify({
        success: true,
        campaign_id: campaign.id,
        total_leads: filtered.length,
        segment_counts: segmentCounts,
        stats: {
          raw_from_db: allCustomers.length,
          after_chassis_dedup: uniqueCustomers.length,
          after_segment_filter: filtered.length,
          date_from,
          date_to,
        },
        message: statsMsg,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── ACTION: get_next ──────────────────────────────────────────────────
    if (action === 'get_next') {
      const { campaign_id } = body
      if (!campaign_id) throw new Error('Missing campaign_id')

      const CUST_SELECT = `id, campaign_id, status, call_notes, booking_date, callback_date, called_at, call_count, no_answer_count, whatsapp_sent, whatsapp_status, assigned_at,
        customer:customer_id (
          id, chassis_no, vehicle_registration_number, first_name, last_name, contact_phones,
          model, powertrain_type, product_line,
          assumed_next_service_date, assumed_next_service_type,
          scheduled_next_service_date, scheduled_next_service_type,
          last_service_date, last_service_type, last_service_km, last_service_dealer, sold_dealer,
          extended_warranty_end_date, extended_warranty_product, extended_warranty_end_kms,
          extended_warranty_policy_no, extended_warranty_order_status,
          last_insurance_expiry_date, last_insurance_comapny, last_insurance_policy_number
        )`

      // First: check callback_later due today
      const todayStr = new Date().toISOString().split('T')[0]
      const { data: callbackDue } = await serviceClient
        .from('telecall_assignments')
        .select(CUST_SELECT)
        .eq('campaign_id', campaign_id)
        .eq('assigned_to', userEmail)
        .eq('status', 'callback_later')
        .lte('callback_date', todayStr)
        .order('callback_date', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (callbackDue) {
        return new Response(JSON.stringify({ success: true, assignment: callbackDue }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      // SIMPLE APPROACH: select top pending, update it, return full data
      // No complex optimistic locking — serviceRole bypasses RLS anyway
      const { data: rows, error: selErr } = await serviceClient
        .from('telecall_assignments')
        .select('id')
        .eq('campaign_id', campaign_id)
        .eq('status', 'pending')
        .order('priority_score', { ascending: false })
        .order('id', { ascending: true })
        .limit(1)

      if (selErr) throw new Error(`Select failed: ${selErr.message}`)
      if (!rows || rows.length === 0) {
        return new Response(JSON.stringify({ success: true, assignment: null, debug: { campaign_id, userEmail, msg: 'no pending rows found' } }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      const rowId = rows[0].id

      // Update to assigned
      const { error: updErr } = await serviceClient
        .from('telecall_assignments')
        .update({ status: 'assigned', assigned_to: userEmail, assigned_at: new Date().toISOString() })
        .eq('id', rowId)

      if (updErr) throw new Error(`Update failed: ${updErr.message}`)

      // Fetch full record with customer join
      const { data: full, error: fetchErr } = await serviceClient
        .from('telecall_assignments')
        .select(CUST_SELECT)
        .eq('id', rowId)
        .single()

      if (fetchErr) throw new Error(`Fetch failed: ${fetchErr.message}`)

      return new Response(JSON.stringify({ success: true, assignment: full }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── ACTION: update_status ─────────────────────────────────────────────
    if (action === 'update_status') {
      const { assignment_id, campaign_id, status, call_notes, booking_date, callback_date, pickup_required, service_centre, pickup_address } = body
      if (!assignment_id || !status) throw new Error('Missing assignment_id or status')

      const update: Record<string, unknown> = {
        status,
        called_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      if (call_notes !== undefined) update.call_notes = call_notes
      if (booking_date) update.booking_date = booking_date
      if (callback_date) update.callback_date = callback_date

      if (status === 'no_answer') {
        const { data: current } = await serviceClient.from('telecall_assignments').select('no_answer_count, call_count').eq('id', assignment_id).single()
        const newNoAnswer = (current?.no_answer_count || 0) + 1
        update.no_answer_count = newNoAnswer
        update.call_count = (current?.call_count || 0) + 1
        if (newNoAnswer >= 3) update.status = 'not_reachable'
      } else {
        const { data: current } = await serviceClient.from('telecall_assignments').select('call_count').eq('id', assignment_id).single()
        update.call_count = (current?.call_count || 0) + 1
      }

      const { error: updateErr } = await serviceClient.from('telecall_assignments').update(update).eq('id', assignment_id)
      if (updateErr) throw new Error(`Failed to update: ${updateErr.message}`)

      // Bridge: auto-create service_bookings when booked
      let servicebooking_id: number | null = null
      if (status === 'booked' && booking_date) {
        const { data: asgn } = await serviceClient.from('telecall_assignments')
          .select('customer_id, assigned_to, campaign_id, service_booking_id')
          .eq('id', assignment_id).single()

        if (asgn && !asgn.service_booking_id) {
          const { data: cust } = await serviceClient.from('all_service_data')
            .select('first_name, last_name, contact_phones, vehicle_registration_number, chassis_no, model, powertrain_type, assumed_next_service_type')
            .eq('id', asgn.customer_id).single()

          if (cust) {
            const { data: existingBooking } = await serviceClient.from('service_bookings').select('id').eq('telecall_assignment_id', assignment_id).maybeSingle()
            if (!existingBooking) {
              const rawPhone = String(cust.contact_phones || '').replace(/\D/g, '').slice(-10)
              const { data: newBooking } = await serviceClient.from('service_bookings').insert([{
                booking_source: 'Telecalling',
                status: 'New',
                booking_date: new Date().toISOString().split('T')[0],
                appointment_date: booking_date,
                appointment_time: null,
                customer_name: [cust.first_name, cust.last_name].filter(Boolean).join(' ').trim() || 'Unknown',
                customer_phone: rawPhone || '0000000000',
                reg_number: (cust.vehicle_registration_number || '').toUpperCase().trim(),
                chassis_no: cust.chassis_no || null,
                model: cust.model || null,
                fuel_type: cust.powertrain_type || null,
                service_type: cust.assumed_next_service_type || null,
                pickup_required: pickup_required || false,
                pickup_address: pickup_address || null,
                service_centre: service_centre || null,
                caller_name: callerName,
                call_attempt: 1,
                call_outcome: 'Connected',
                call_notes: call_notes || null,
                telecall_assignment_id: assignment_id,
                telecall_campaign_id: asgn.campaign_id,
              }]).select('id').single()

              if (newBooking) {
                servicebooking_id = (newBooking as any).id
                await serviceClient.from('telecall_assignments').update({ service_booking_id: servicebooking_id }).eq('id', assignment_id)
              }
            } else {
              servicebooking_id = existingBooking.id
            }
          }
        } else if (asgn?.service_booking_id) {
          servicebooking_id = asgn.service_booking_id
        }
      }

      // Update campaign counts
      if (campaign_id) {
        const { data: counts } = await serviceClient.from('telecall_assignments').select('status').eq('campaign_id', campaign_id)
        if (counts) {
          const pending = counts.filter((c: any) => ['pending', 'assigned', 'calling', 'callback_later'].includes(c.status)).length
          const completed = counts.filter((c: any) => ['completed', 'no_answer', 'not_reachable', 'wrong_number', 'not_interested', 'already_serviced', 'sold_vehicle'].includes(c.status)).length
          const booked = counts.filter((c: any) => c.status === 'booked').length
          await serviceClient.from('telecall_campaigns').update({ pending_count: pending, completed_count: completed, booked_count: booked, updated_at: new Date().toISOString() }).eq('id', campaign_id)
        }
      }

      return new Response(JSON.stringify({
        success: true,
        message: 'Status updated',
        auto_marked_unreachable: status === 'no_answer' && Number(update.no_answer_count) >= 3,
        service_booking_id: servicebooking_id,
        service_booking_created: servicebooking_id !== null,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── ACTION: log_whatsapp ──────────────────────────────────────────────
    if (action === 'log_whatsapp') {
      const { assignment_id, wa_type } = body
      if (!assignment_id) throw new Error('Missing assignment_id')
      await serviceClient.from('telecall_assignments').update({ whatsapp_sent: true, whatsapp_status: wa_type, updated_at: new Date().toISOString() }).eq('id', assignment_id)
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── ACTION: edit_assignment ───────────────────────────────────────────
    if (action === 'edit_assignment') {
      const { assignment_id, call_notes, booking_date, callback_date, status } = body
      if (!assignment_id) throw new Error('Missing assignment_id')

      const { data: existing } = await serviceClient.from('telecall_assignments').select('id, assigned_to, status, campaign_id').eq('id', assignment_id).single()
      if (!existing) throw new Error('Assignment not found')
      if (existing.assigned_to !== userEmail && !isAdmin) throw new Error('Not authorised to edit this assignment')

      const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (call_notes !== undefined) update.call_notes = call_notes
      if (booking_date !== undefined) update.booking_date = booking_date || null
      if (callback_date !== undefined) update.callback_date = callback_date || null
      if (status !== undefined) update.status = status

      const { error: updateErr } = await serviceClient.from('telecall_assignments').update(update).eq('id', assignment_id)
      if (updateErr) throw new Error(`Failed to edit: ${updateErr.message}`)

      if (status !== undefined) {
        const { data: counts } = await serviceClient.from('telecall_assignments').select('status').eq('campaign_id', existing.campaign_id)
        if (counts) {
          const pending = counts.filter((c: any) => ['pending', 'assigned', 'calling', 'callback_later'].includes(c.status)).length
          const completed = counts.filter((c: any) => ['completed', 'no_answer', 'not_reachable', 'wrong_number', 'not_interested', 'already_serviced', 'sold_vehicle'].includes(c.status)).length
          const booked = counts.filter((c: any) => c.status === 'booked').length
          await serviceClient.from('telecall_campaigns').update({ pending_count: pending, completed_count: completed, booked_count: booked, updated_at: new Date().toISOString() }).eq('id', existing.campaign_id)
        }
      }

      return new Response(JSON.stringify({ success: true, message: 'Assignment updated' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── ACTION: my_queue ──────────────────────────────────────────────────
    if (action === 'my_queue') {
      const { campaign_id } = body
      const CUST_SEL = `id, campaign_id, status, call_notes, booking_date, callback_date, called_at, call_count, no_answer_count, whatsapp_sent, whatsapp_status, assigned_at,
        customer:customer_id (
          id, chassis_no, vehicle_registration_number, first_name, last_name, contact_phones,
          model, powertrain_type, product_line,
          assumed_next_service_date, assumed_next_service_type,
          last_service_date, last_service_type, last_service_km, last_service_dealer, sold_dealer,
          extended_warranty_end_date, extended_warranty_product, extended_warranty_order_status,
          last_insurance_expiry_date, last_insurance_comapny
        )`
      let q = serviceClient.from('telecall_assignments').select(CUST_SEL).eq('assigned_to', userEmail).in('status', ['assigned', 'calling', 'callback_later', 'booked'])
      if (campaign_id) q = q.eq('campaign_id', campaign_id)
      const { data: queue, error: queueErr } = await q.order('assigned_at', { ascending: false })
      if (queueErr) throw new Error(`Failed to fetch queue: ${queueErr.message}`)
      return new Response(JSON.stringify({ success: true, queue: queue || [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── ACTION: my_summary ────────────────────────────────────────────────
    if (action === 'my_summary') {
      const today = new Date().toISOString().split('T')[0]
      const { data: todayCalls } = await serviceClient.from('telecall_assignments').select('status').eq('assigned_to', userEmail).gte('called_at', today + 'T00:00:00+00:00')
      const summary = {
        total_calls: todayCalls?.length || 0,
        booked: todayCalls?.filter((c: any) => c.status === 'booked').length || 0,
        no_answer: todayCalls?.filter((c: any) => c.status === 'no_answer').length || 0,
        not_interested: todayCalls?.filter((c: any) => c.status === 'not_interested').length || 0,
        callback_later: todayCalls?.filter((c: any) => c.status === 'callback_later').length || 0,
        wrong_number: todayCalls?.filter((c: any) => c.status === 'wrong_number').length || 0,
        not_reachable: todayCalls?.filter((c: any) => c.status === 'not_reachable').length || 0,
        already_serviced: todayCalls?.filter((c: any) => c.status === 'already_serviced').length || 0,
        sold_vehicle: todayCalls?.filter((c: any) => c.status === 'sold_vehicle').length || 0,
      }
      return new Response(JSON.stringify({ success: true, summary }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── ACTION: admin_stats ───────────────────────────────────────────────
    if (action === 'admin_stats') {
      if (!isAdmin) throw new Error('Admin only')
      const { campaign_id } = body
      let q = serviceClient.from('telecall_assignments').select('assigned_to, status')
      if (campaign_id) q = q.eq('campaign_id', campaign_id)
      const { data: all } = await q

      const byAgent: Record<string, any> = {}
      for (const row of (all || [])) {
        const agent = row.assigned_to || 'unassigned'
        if (!byAgent[agent]) byAgent[agent] = { email: agent, total: 0, booked: 0, no_answer: 0, not_interested: 0, callback_later: 0, wrong_number: 0, not_reachable: 0, already_serviced: 0, sold_vehicle: 0, connected: 0 }
        byAgent[agent].total++
        const s = row.status
        if (['booked', 'no_answer', 'not_interested', 'callback_later', 'wrong_number', 'not_reachable', 'already_serviced', 'sold_vehicle'].includes(s)) {
          byAgent[agent][s] = (byAgent[agent][s] || 0) + 1
        }
        if (['booked', 'callback_later', 'not_interested', 'wrong_number', 'already_serviced', 'sold_vehicle'].includes(s)) {
          byAgent[agent].connected++
        }
      }
      return new Response(JSON.stringify({ success: true, agent_stats: Object.values(byAgent) }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── ACTION: booking_list ──────────────────────────────────────────────
    if (action === 'booking_list') {
      const { campaign_id } = body
      let q = serviceClient.from('telecall_assignments')
        .select(`id, assigned_to, booking_date, call_notes, status, whatsapp_sent,
          customer:customer_id (chassis_no, vehicle_registration_number, first_name, last_name, contact_phones, model, powertrain_type, assumed_next_service_type)`)
        .eq('status', 'booked')
      if (campaign_id) q = q.eq('campaign_id', campaign_id)
      const { data: bookings } = await q.order('booking_date', { ascending: true })
      return new Response(JSON.stringify({ success: true, bookings: bookings || [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── ACTION: overdue_list ──────────────────────────────────────────────
    if (action === 'overdue_list') {
      if (!isAdmin) throw new Error('Admin only')
      const today = new Date().toISOString().split('T')[0]
      const cutoff = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0]
      const { data: overdueCustomers } = await serviceClient
        .from('all_service_data')
        .select('id, chassis_no, vehicle_registration_number, first_name, last_name, contact_phones, model, powertrain_type, assumed_next_service_date, assumed_next_service_type, last_service_date, last_service_dealer, sold_dealer')
        .not('assumed_next_service_date', 'is', null)
        .not('contact_phones', 'is', null)
        .lt('assumed_next_service_date', today)
        .gte('assumed_next_service_date', cutoff)
        .order('assumed_next_service_date', { ascending: true })
        .limit(500)
      return new Response(JSON.stringify({ success: true, overdue: overdueCustomers || [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── ACTION: close_campaign ────────────────────────────────────────────
    if (action === 'close_campaign') {
      if (!isAdmin) throw new Error('Only admin can close campaigns')
      const { campaign_id } = body
      if (!campaign_id) throw new Error('Missing campaign_id')
      const { error } = await serviceClient.from('telecall_campaigns').update({ status: 'closed', updated_at: new Date().toISOString() }).eq('id', campaign_id)
      if (error) throw new Error(`Failed to close: ${error.message}`)
      return new Response(JSON.stringify({ success: true, message: 'Campaign closed' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── ACTION: update_campaign ───────────────────────────────────────────
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
      const { error } = await serviceClient.from('telecall_campaigns').update(updates).eq('id', campaign_id)
      if (error) throw new Error(`Failed to update: ${error.message}`)
      return new Response(JSON.stringify({ success: true, message: 'Campaign updated' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── ACTION: delete_campaign ───────────────────────────────────────────
    if (action === 'delete_campaign') {
      if (!isAdmin) throw new Error('Only admin can delete campaigns')
      const { campaign_id } = body
      if (!campaign_id) throw new Error('Missing campaign_id')
      const { error: delAsgnErr } = await serviceClient.from('telecall_assignments').delete().eq('campaign_id', campaign_id)
      if (delAsgnErr) throw new Error(`Failed to delete assignments: ${delAsgnErr.message}`)
      const { error: delErr } = await serviceClient.from('telecall_campaigns').delete().eq('id', campaign_id)
      if (delErr) throw new Error(`Failed to delete campaign: ${delErr.message}`)
      return new Response(JSON.stringify({ success: true, message: 'Campaign deleted' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── ACTION: preview_campaign ──────────────────────────────────────────
    if (action === 'preview_campaign') {
      if (!isAdmin) throw new Error('Only admin can preview campaigns')
      const { date_from: dfr, date_to: dtr, upcoming_days: upd = null, customer_segment = 'all', priority_mode = 'service_date', warranty_expiry_days = null, powertrain_filter = null } = body

      // Resolve date range for preview — same logic as create
      const todayP = new Date(Date.now() + 5.5 * 3600000).toISOString().split('T')[0]
      let previewFrom: string = dfr || todayP
      let previewTo: string = dtr || todayP
      if ((priority_mode === 'service_date' || !priority_mode) && upd) {
        previewFrom = todayP
        previewTo = new Date(Date.now() + 5.5 * 3600000 + Number(upd) * 86400000).toISOString().split('T')[0]
      }

      let query = serviceClient.from('all_service_data')
        .select('id, sold_dealer, last_service_dealer, extended_warranty_end_date, assumed_next_service_date, powertrain_type, last_insurance_expiry_date')
        .not('contact_phones', 'is', null)

      if (priority_mode === 'warranty_expiry' && warranty_expiry_days) {
        const expiry_to = new Date(Date.now() + 5.5 * 3600000 + warranty_expiry_days * 86400000).toISOString().split('T')[0]
        query = query.not('extended_warranty_end_date', 'is', null).gte('extended_warranty_end_date', todayP).lte('extended_warranty_end_date', expiry_to)
      } else if (priority_mode === 'insurance_expiry') {
        const expiry_to = new Date(Date.now() + 5.5 * 3600000 + 60 * 86400000).toISOString().split('T')[0]
        query = query.not('last_insurance_expiry_date', 'is', null).gte('last_insurance_expiry_date', todayP).lte('last_insurance_expiry_date', expiry_to)
      } else {
        query = query.not('assumed_next_service_date', 'is', null).gte('assumed_next_service_date', previewFrom).lte('assumed_next_service_date', previewTo)
      }

      if (powertrain_filter && powertrain_filter !== 'all') query = query.eq('powertrain_type', powertrain_filter)

      const { data: customers, error: custErr } = await query
      if (custErr) throw new Error(`Preview fetch failed: ${custErr.message}`)

      const today = new Date().toISOString().split('T')[0]
      const in30Days = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]
      const counts = { total: 0, retain_loyal: 0, retain_atrisk: 0, retain_service_loyal: 0, conquest: 0, warranty_soon: 0, ev: 0, pv: 0 }

      for (const c of (customers || []) as any[]) {
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

      let filtered = counts.total
      if (customer_segment === 'sold_us') filtered = counts.retain_loyal + counts.retain_atrisk
      else if (customer_segment === 'sold_others') filtered = counts.conquest + counts.retain_service_loyal
      else if (customer_segment === 'last_svc_us') filtered = counts.retain_loyal + counts.retain_service_loyal
      else if (customer_segment === 'last_svc_others') filtered = counts.retain_atrisk + counts.conquest
      else if (customer_segment === 'warranty_expiring') filtered = counts.warranty_soon

      return new Response(JSON.stringify({ success: true, counts, filtered_count: filtered, date_from: previewFrom, date_to: previewTo }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    throw new Error(`Unknown action: ${action}`)

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : ''
    console.error('TELECALLING_ERROR:', message, stack)
    return new Response(JSON.stringify({ success: false, error: message, stack }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
}

// v2 — dynamic upcoming_days, fixed DB columns
Deno.serve(handler)
