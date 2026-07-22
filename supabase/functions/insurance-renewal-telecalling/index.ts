import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// Insurance Renewal Telecalling — proactive calling queue for customers whose
// last_insurance_expiry_date is approaching. Structurally mirrors
// supabase/functions/telecalling/index.ts (pull-based get_next, campaign
// counters recomputed from assignment statuses, stale-assignment reclaim),
// but uses its own tables/RPC because the eligibility window, disposition
// set, and re-attempt cadence differ from service reminders.

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const serviceClient = createClient(supabaseUrl, serviceRoleKey)

    const cronSecret = req.headers.get('x-cron-secret') || ''
    const CRON_SECRET = 'd4738d9a19012e96922a7e9d53959c0b8169ba573743e08f5609a9a601986511'
    const isCronCall = cronSecret === CRON_SECRET && cronSecret.length > 0

    let userEmail: string
    let isAdmin: boolean

    if (isCronCall) {
      userEmail = 'system@auto-refresh'
      isAdmin = true
    } else {
      const authHeader = req.headers.get('Authorization') || ''
      const token = authHeader.replace('Bearer ', '')
      if (!token) throw new Error('Missing auth token')

      const { data: { user }, error: authErr } = await serviceClient.auth.getUser(token)
      if (authErr || !user) throw new Error(`Auth failed: ${authErr?.message || 'no user returned for token'}`)

      const { data: userData, error: userErr } = await serviceClient
        .from('users')
        .select('email, role')
        .eq('id', user.id)
        .maybeSingle()

      if (userErr) throw new Error(`DB error looking up user ${user.id}: ${userErr.message}`)
      if (!userData) throw new Error(`User not found in public.users for auth id: ${user.id} email: ${user.email}`)
      if (!userData.email) throw new Error(`User found but email is null for id: ${user.id}`)
      userEmail = userData.email
      isAdmin = userData.role === 'admin'
    }

    const body = await req.json()
    const action = body.action

    // Statuses must be mutually exclusive across buckets so total_leads == sum of buckets.
    const RESULT_STATUSES = ['renewed_via_us', 'renewed_elsewhere', 'not_interested', 'no_answer', 'not_reachable', 'wrong_number', 'already_renewed_unknown']
    const computeCampaignCounts = (rows: { status: string }[]) => ({
      pending: rows.filter(r => r.status === 'pending').length,
      in_progress: rows.filter(r => r.status === 'assigned').length,
      callback_later: rows.filter(r => r.status === 'callback_later').length,
      out_of_window: rows.filter(r => r.status === 'out_of_window').length,
      completed: rows.filter(r => RESULT_STATUSES.includes(r.status)).length,
      renewed: rows.filter(r => r.status === 'renewed_via_us').length,
    })

    const CUST_SELECT_FIELDS = `id, chassis_no, vehicle_registration_number, first_name, last_name, contact_phones,
      model, product_line, powertrain_type, vehicle_sale_date, vehicle_age_in_years,
      ex_showroom_price, idv, last_insurance_expiry_date, last_insurance_comapny,
      last_insurance_policy_number, sold_dealer`

    // ── ACTION: create_campaign ───────────────────────────────────────────
    if (action === 'create_campaign') {
      if (!isAdmin) throw new Error('Only admin can create campaigns')

      const { campaign_name, window_days = 30 } = body
      if (!campaign_name) throw new Error('Missing campaign_name')

      const todayIST = new Date(Date.now() + 5.5 * 3600000).toISOString().split('T')[0]
      const date_from = todayIST
      const date_to = new Date(Date.now() + 5.5 * 3600000 + Number(window_days) * 86400000).toISOString().split('T')[0]

      const { data: campaign, error: campErr } = await serviceClient
        .from('insurance_renewal_campaigns')
        .insert({ campaign_name, window_days, date_from, date_to, status: 'active', created_by: userEmail })
        .select().single()
      if (campErr) throw new Error(`Failed to create campaign: ${campErr.message}`)

      // insurance_renewal_leads coalesces last_insurance_expiry_date (preferred,
      // reflects the actual policy) with a sale-date-derived due date rolled
      // forward to whichever upcoming annual renewal applies — see
      // insurance_next_due_date() in the schema.
      const { data: allCustomers, error: custErr } = await serviceClient
        .from('insurance_renewal_leads')
        .select('id, chassis_no, effective_due_date')
        .not('contact_phones', 'is', null)
        .neq('contact_phones', '')
        .not('effective_due_date', 'is', null)
        .gte('effective_due_date', date_from)
        .lte('effective_due_date', date_to)

      if (custErr) throw new Error(`Failed to fetch customers: ${custErr.message}`)

      if (!allCustomers || allCustomers.length === 0) {
        await serviceClient.from('insurance_renewal_campaigns').delete().eq('id', campaign.id)
        return new Response(JSON.stringify({ success: true, campaign_id: null, total_leads: 0, message: `No customers found with insurance renewal due between ${date_from} and ${date_to}.` }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      const seenChassis = new Set<string>()
      const uniqueCustomers = (allCustomers as any[]).filter((c: any) => {
        if (!c.chassis_no) return true
        if (seenChassis.has(c.chassis_no)) return false
        seenChassis.add(c.chassis_no)
        return true
      })

      const assignments = uniqueCustomers.map((c: any) => ({ campaign_id: campaign.id, customer_id: c.id, status: 'pending' }))
      for (let i = 0; i < assignments.length; i += 500) {
        const { error: asgnErr } = await serviceClient.from('insurance_renewal_assignments').insert(assignments.slice(i, i + 500))
        if (asgnErr) throw new Error(`Failed to create assignments: ${asgnErr.message}`)
      }

      await serviceClient.from('insurance_renewal_campaigns').update({ total_leads: uniqueCustomers.length, pending_count: uniqueCustomers.length }).eq('id', campaign.id)

      return new Response(JSON.stringify({
        success: true,
        campaign_id: campaign.id,
        total_leads: uniqueCustomers.length,
        stats: { raw_from_db: allCustomers.length, after_chassis_dedup: uniqueCustomers.length, date_from, date_to },
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── ACTION: refresh_campaign ────────────────────────────────────────────
    // Rolls the window forward to "today → today+window_days" and adds newly
    // eligible customers. Pending rows that drifted outside the new window are
    // marked out_of_window; anything already worked is left untouched.
    if (action === 'refresh_campaign') {
      if (!isAdmin) throw new Error('Admin only')
      const { campaign_id: refreshCampaignId } = body

      let campQuery = serviceClient.from('insurance_renewal_campaigns').select('*').eq('status', 'active')
      if (refreshCampaignId) campQuery = campQuery.eq('id', refreshCampaignId)
      const { data: campaignsToRefresh, error: campListErr } = await campQuery
      if (campListErr) throw new Error(`Failed to load campaigns: ${campListErr.message}`)
      if (!campaignsToRefresh || campaignsToRefresh.length === 0) {
        return new Response(JSON.stringify({ success: true, refreshed: [], message: 'No active campaigns to refresh' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      const todayIST = new Date(Date.now() + 5.5 * 3600000).toISOString().split('T')[0]
      const results: any[] = []

      for (const camp of campaignsToRefresh) {
        const newDateFrom = todayIST
        const newDateTo = new Date(Date.now() + 5.5 * 3600000 + camp.window_days * 86400000).toISOString().split('T')[0]

        const { data: eligible, error: eligErr } = await serviceClient
          .from('insurance_renewal_leads')
          .select('id, chassis_no')
          .not('contact_phones', 'is', null)
          .neq('contact_phones', '')
          .not('effective_due_date', 'is', null)
          .gte('effective_due_date', newDateFrom)
          .lte('effective_due_date', newDateTo)
        if (eligErr) throw new Error(`Campaign ${camp.id}: eligibility query failed: ${eligErr.message}`)

        const seenChassis = new Set<string>()
        const uniqueEligible = (eligible || []).filter((c: any) => {
          if (!c.chassis_no) return true
          if (seenChassis.has(c.chassis_no)) return false
          seenChassis.add(c.chassis_no)
          return true
        })
        const eligibleIds = new Set(uniqueEligible.map((c: any) => c.id))

        const { data: existing, error: existErr } = await serviceClient
          .from('insurance_renewal_assignments')
          .select('id, customer_id, status')
          .eq('campaign_id', camp.id)
        if (existErr) throw new Error(`Campaign ${camp.id}: existing assignment query failed: ${existErr.message}`)

        const existingIds = new Set((existing || []).map((r: any) => r.customer_id))

        // New leads that entered the window and don't have an assignment yet
        const newLeadIds = [...eligibleIds].filter((id) => !existingIds.has(id))
        if (newLeadIds.length > 0) {
          const newAssignments = newLeadIds.map((customer_id) => ({ campaign_id: camp.id, customer_id, status: 'pending' }))
          for (let i = 0; i < newAssignments.length; i += 500) {
            const { error: insErr } = await serviceClient.from('insurance_renewal_assignments').insert(newAssignments.slice(i, i + 500))
            if (insErr) throw new Error(`Campaign ${camp.id}: failed to insert new leads: ${insErr.message}`)
          }
        }

        // Pending rows that drifted out of window
        const driftedOut = (existing || []).filter((r: any) => r.status === 'pending' && !eligibleIds.has(r.customer_id))
        if (driftedOut.length > 0) {
          await serviceClient.from('insurance_renewal_assignments').update({ status: 'out_of_window', updated_at: new Date().toISOString() }).in('id', driftedOut.map((r: any) => r.id))
        }

        await serviceClient.from('insurance_renewal_campaigns').update({ date_from: newDateFrom, date_to: newDateTo, updated_at: new Date().toISOString() }).eq('id', camp.id)

        const { data: allRows } = await serviceClient.from('insurance_renewal_assignments').select('status').eq('campaign_id', camp.id)
        const b = computeCampaignCounts((allRows || []) as any[])
        await serviceClient.from('insurance_renewal_campaigns').update({
          total_leads: (allRows || []).length,
          pending_count: b.pending, in_progress_count: b.in_progress, callback_later_count: b.callback_later,
          out_of_window_count: b.out_of_window, completed_count: b.completed, renewed_count: b.renewed,
        }).eq('id', camp.id)

        results.push({ campaign_id: camp.id, campaign_name: camp.campaign_name, window: `${newDateFrom} to ${newDateTo}`, added: newLeadIds.length, retired_out_of_window: driftedOut.length, pending_count: b.pending, total_leads: (allRows || []).length })
      }

      return new Response(JSON.stringify({ success: true, refreshed: results }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── ACTION: get_next ────────────────────────────────────────────────────
    if (action === 'get_next') {
      const { campaign_id } = body
      if (!campaign_id) throw new Error('Missing campaign_id')

      const staleCutoff = new Date(Date.now() - 24 * 3600000).toISOString()
      const { data: staleRows } = await serviceClient
        .from('insurance_renewal_assignments')
        .select('id')
        .eq('campaign_id', campaign_id)
        .eq('status', 'assigned')
        .lt('assigned_at', staleCutoff)
      if (staleRows && staleRows.length > 0) {
        await serviceClient
          .from('insurance_renewal_assignments')
          .update({ status: 'pending', assigned_to: null, assigned_at: null })
          .in('id', staleRows.map((r: any) => r.id))
      }

      const ASGN_SELECT = `id, campaign_id, status, call_notes, callback_date, called_at, call_count, no_answer_count, whatsapp_sent, whatsapp_status, assigned_at, quoted_premium, renewal_company,
        customer:customer_id (${CUST_SELECT_FIELDS})`

      const todayStr = new Date().toISOString().split('T')[0]
      const { data: callbackDue } = await serviceClient
        .from('insurance_renewal_assignments')
        .select(ASGN_SELECT)
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

      // Concurrency-safe pick via SELECT ... FOR UPDATE SKIP LOCKED RPC —
      // guarantees two telecallers calling get_next at the same instant never
      // receive the same customer, which a plain select-then-update cannot.
      const { data: picked, error: pickErr } = await serviceClient
        .rpc('insurance_renewal_get_next_assignment', { p_campaign_id: campaign_id, p_user_email: userEmail })
      if (pickErr) throw new Error(`Allotment RPC failed: ${pickErr.message}`)

      const row = Array.isArray(picked) ? picked[0] : picked
      if (!row || !row.asgn_id) {
        return new Response(JSON.stringify({ success: true, assignment: null }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      const { data: full, error: fetchErr } = await serviceClient
        .from('insurance_renewal_assignments')
        .select(ASGN_SELECT)
        .eq('id', row.asgn_id)
        .single()
      if (fetchErr) throw new Error(`Fetch failed: ${fetchErr.message}`)

      return new Response(JSON.stringify({ success: true, assignment: full }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── ACTION: update_status ─────────────────────────────────────────────
    if (action === 'update_status') {
      const { assignment_id, campaign_id, status, call_notes, callback_date, quoted_premium, renewal_company } = body
      if (!assignment_id || !status) throw new Error('Missing assignment_id or status')

      const update: Record<string, unknown> = {
        status,
        called_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      if (call_notes !== undefined) update.call_notes = call_notes
      if (callback_date) update.callback_date = callback_date
      if (status === 'renewed_via_us') {
        if (quoted_premium !== undefined) update.quoted_premium = quoted_premium
        if (renewal_company !== undefined) update.renewal_company = renewal_company
      }

      if (status === 'no_answer') {
        const { data: current } = await serviceClient.from('insurance_renewal_assignments').select('no_answer_count, call_count').eq('id', assignment_id).single()
        const newNoAnswer = (current?.no_answer_count || 0) + 1
        update.no_answer_count = newNoAnswer
        update.call_count = (current?.call_count || 0) + 1
        if (newNoAnswer >= 3) {
          update.status = 'not_reachable'
          update.retry_after = null
        } else {
          const tomorrowIST = new Date(Date.now() + 5.5 * 3600000 + 86400000).toISOString().split('T')[0]
          update.status = 'pending'
          update.retry_after = tomorrowIST
          update.assigned_to = null
          update.assigned_at = null
        }
      } else {
        const { data: current } = await serviceClient.from('insurance_renewal_assignments').select('call_count').eq('id', assignment_id).single()
        update.call_count = (current?.call_count || 0) + 1
      }

      const { error: updateErr } = await serviceClient.from('insurance_renewal_assignments').update(update).eq('id', assignment_id)
      if (updateErr) throw new Error(`Failed to update: ${updateErr.message}`)

      if (campaign_id) {
        const { data: counts } = await serviceClient.from('insurance_renewal_assignments').select('status').eq('campaign_id', campaign_id)
        if (counts) {
          const b = computeCampaignCounts(counts as any[])
          await serviceClient.from('insurance_renewal_campaigns').update({
            pending_count: b.pending,
            in_progress_count: b.in_progress,
            out_of_window_count: b.out_of_window,
            callback_later_count: b.callback_later,
            completed_count: b.completed,
            renewed_count: b.renewed,
            updated_at: new Date().toISOString(),
          }).eq('id', campaign_id)
        }
      }

      return new Response(JSON.stringify({
        success: true,
        message: 'Status updated',
        auto_marked_unreachable: status === 'no_answer' && Number(update.no_answer_count) >= 3,
        retry_queued: status === 'no_answer' && Number(update.no_answer_count) < 3,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── ACTION: log_whatsapp ──────────────────────────────────────────────
    if (action === 'log_whatsapp') {
      const { assignment_id, wa_type } = body
      if (!assignment_id) throw new Error('Missing assignment_id')
      await serviceClient.from('insurance_renewal_assignments').update({ whatsapp_sent: true, whatsapp_status: wa_type, updated_at: new Date().toISOString() }).eq('id', assignment_id)
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── ACTION: edit_assignment ───────────────────────────────────────────
    if (action === 'edit_assignment') {
      const { assignment_id, call_notes, callback_date, status } = body
      if (!assignment_id) throw new Error('Missing assignment_id')

      const { data: existing } = await serviceClient.from('insurance_renewal_assignments').select('id, assigned_to, status, campaign_id').eq('id', assignment_id).single()
      if (!existing) throw new Error('Assignment not found')
      if (existing.assigned_to !== userEmail && !isAdmin) throw new Error('Not authorised to edit this assignment')

      const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (call_notes !== undefined) update.call_notes = call_notes
      if (callback_date !== undefined) update.callback_date = callback_date || null
      if (status !== undefined) update.status = status

      const { error: updateErr } = await serviceClient.from('insurance_renewal_assignments').update(update).eq('id', assignment_id)
      if (updateErr) throw new Error(`Failed to edit: ${updateErr.message}`)

      if (status !== undefined) {
        const { data: counts } = await serviceClient.from('insurance_renewal_assignments').select('status').eq('campaign_id', existing.campaign_id)
        if (counts) {
          const b = computeCampaignCounts(counts as any[])
          await serviceClient.from('insurance_renewal_campaigns').update({
            pending_count: b.pending,
            in_progress_count: b.in_progress,
            out_of_window_count: b.out_of_window,
            callback_later_count: b.callback_later,
            completed_count: b.completed,
            renewed_count: b.renewed,
            updated_at: new Date().toISOString(),
          }).eq('id', existing.campaign_id)
        }
      }

      return new Response(JSON.stringify({ success: true, message: 'Assignment updated' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── ACTION: my_queue ──────────────────────────────────────────────────
    if (action === 'my_queue') {
      const { campaign_id } = body
      const SEL = `id, campaign_id, status, call_notes, callback_date, called_at, call_count, no_answer_count, whatsapp_sent, whatsapp_status, assigned_at, quoted_premium, renewal_company,
        customer:customer_id (${CUST_SELECT_FIELDS})`
      let q = serviceClient.from('insurance_renewal_assignments').select(SEL).eq('assigned_to', userEmail).in('status', ['assigned', 'callback_later'])
      if (campaign_id) q = q.eq('campaign_id', campaign_id)
      const { data: queue, error: queueErr } = await q.order('assigned_at', { ascending: false })
      if (queueErr) throw new Error(`Failed to fetch queue: ${queueErr.message}`)
      return new Response(JSON.stringify({ success: true, queue: queue || [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── ACTION: my_summary ────────────────────────────────────────────────
    if (action === 'my_summary') {
      const today = new Date().toISOString().split('T')[0]
      const { data: todayCalls } = await serviceClient.from('insurance_renewal_assignments').select('status').eq('assigned_to', userEmail).gte('called_at', today + 'T00:00:00+00:00')
      const summary = {
        total_calls: todayCalls?.length || 0,
        renewed_via_us: todayCalls?.filter((c: any) => c.status === 'renewed_via_us').length || 0,
        renewed_elsewhere: todayCalls?.filter((c: any) => c.status === 'renewed_elsewhere').length || 0,
        no_answer: todayCalls?.filter((c: any) => c.status === 'no_answer').length || 0,
        not_interested: todayCalls?.filter((c: any) => c.status === 'not_interested').length || 0,
        callback_later: todayCalls?.filter((c: any) => c.status === 'callback_later').length || 0,
        wrong_number: todayCalls?.filter((c: any) => c.status === 'wrong_number').length || 0,
        not_reachable: todayCalls?.filter((c: any) => c.status === 'not_reachable').length || 0,
        already_renewed_unknown: todayCalls?.filter((c: any) => c.status === 'already_renewed_unknown').length || 0,
      }
      return new Response(JSON.stringify({ success: true, summary }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── ACTION: admin_stats ───────────────────────────────────────────────
    if (action === 'admin_stats') {
      if (!isAdmin) throw new Error('Admin only')
      const { campaign_id, date_from, date_to } = body
      let q = serviceClient.from('insurance_renewal_assignments').select('assigned_to, status, call_count, no_answer_count, called_at')
      if (campaign_id) q = q.eq('campaign_id', campaign_id)
      q = q.neq('status', 'pending')
      if (date_from) q = q.gte('called_at', `${date_from}T00:00:00`)
      if (date_to) q = q.lte('called_at', `${date_to}T23:59:59`)
      const { data: all } = await q

      const byAgent: Record<string, any> = {}
      const CONNECTED_STATUSES = ['renewed_via_us', 'renewed_elsewhere', 'callback_later', 'not_interested', 'wrong_number', 'already_renewed_unknown', 'not_reachable']

      for (const row of (all || [])) {
        const agent = row.assigned_to || 'unassigned'
        if (agent === 'unassigned') continue
        if (!byAgent[agent]) byAgent[agent] = {
          email: agent, calls_made: 0, calls_connected: 0,
          renewed_via_us: 0, renewed_elsewhere: 0, no_answer: 0, not_interested: 0,
          callback_later: 0, wrong_number: 0, not_reachable: 0, already_renewed_unknown: 0,
          still_assigned: 0,
        }
        byAgent[agent].calls_made++
        const s = row.status
        if (s === 'assigned') {
          byAgent[agent].still_assigned++
        } else if (RESULT_STATUSES.includes(s)) {
          byAgent[agent][s] = (byAgent[agent][s] || 0) + 1
        }
        if (CONNECTED_STATUSES.includes(s)) byAgent[agent].calls_connected++
      }

      const agent_stats = Object.values(byAgent).sort((a: any, b: any) => b.calls_made - a.calls_made)
      return new Response(JSON.stringify({ success: true, agent_stats }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── ACTION: renewed_list ──────────────────────────────────────────────
    if (action === 'renewed_list') {
      const { campaign_id } = body
      let q = serviceClient.from('insurance_renewal_assignments')
        .select(`id, assigned_to, called_at, call_notes, quoted_premium, renewal_company,
          customer:customer_id (${CUST_SELECT_FIELDS})`)
        .eq('status', 'renewed_via_us')
      if (campaign_id) q = q.eq('campaign_id', campaign_id)
      const { data: renewed } = await q.order('called_at', { ascending: false })
      return new Response(JSON.stringify({ success: true, renewed: renewed || [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── ACTION: close_campaign ────────────────────────────────────────────
    if (action === 'close_campaign') {
      if (!isAdmin) throw new Error('Only admin can close campaigns')
      const { campaign_id } = body
      if (!campaign_id) throw new Error('Missing campaign_id')
      const { error } = await serviceClient.from('insurance_renewal_campaigns').update({ status: 'closed', updated_at: new Date().toISOString() }).eq('id', campaign_id)
      if (error) throw new Error(`Failed to close: ${error.message}`)
      return new Response(JSON.stringify({ success: true, message: 'Campaign closed' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── ACTION: update_campaign ───────────────────────────────────────────
    if (action === 'update_campaign') {
      if (!isAdmin) throw new Error('Only admin can edit campaigns')
      const { campaign_id, campaign_name, window_days } = body
      if (!campaign_id) throw new Error('Missing campaign_id')
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (campaign_name) updates.campaign_name = campaign_name
      if (window_days !== undefined) updates.window_days = window_days
      const { error } = await serviceClient.from('insurance_renewal_campaigns').update(updates).eq('id', campaign_id)
      if (error) throw new Error(`Failed to update: ${error.message}`)
      return new Response(JSON.stringify({ success: true, message: 'Campaign updated' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── ACTION: delete_campaign ───────────────────────────────────────────
    if (action === 'delete_campaign') {
      if (!isAdmin) throw new Error('Only admin can delete campaigns')
      const { campaign_id } = body
      if (!campaign_id) throw new Error('Missing campaign_id')
      const { error: delAsgnErr } = await serviceClient.from('insurance_renewal_assignments').delete().eq('campaign_id', campaign_id)
      if (delAsgnErr) throw new Error(`Failed to delete assignments: ${delAsgnErr.message}`)
      const { error: delErr } = await serviceClient.from('insurance_renewal_campaigns').delete().eq('id', campaign_id)
      if (delErr) throw new Error(`Failed to delete campaign: ${delErr.message}`)
      return new Response(JSON.stringify({ success: true, message: 'Campaign deleted' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── ACTION: preview_campaign ──────────────────────────────────────────
    if (action === 'preview_campaign') {
      if (!isAdmin) throw new Error('Only admin can preview campaigns')
      const { window_days = 30 } = body
      const todayP = new Date(Date.now() + 5.5 * 3600000).toISOString().split('T')[0]
      const previewTo = new Date(Date.now() + 5.5 * 3600000 + Number(window_days) * 86400000).toISOString().split('T')[0]

      const { data: customers, error: custErr } = await serviceClient.from('insurance_renewal_leads')
        .select('id, chassis_no')
        .not('contact_phones', 'is', null)
        .not('effective_due_date', 'is', null)
        .gte('effective_due_date', todayP)
        .lte('effective_due_date', previewTo)
      if (custErr) throw new Error(`Preview fetch failed: ${custErr.message}`)

      const seenChassis = new Set<string>()
      const uniqueCount = (customers || []).filter((c: any) => {
        if (!c.chassis_no) return true
        if (seenChassis.has(c.chassis_no)) return false
        seenChassis.add(c.chassis_no)
        return true
      }).length

      return new Response(JSON.stringify({ success: true, filtered_count: uniqueCount, raw_count: (customers || []).length, date_from: todayP, date_to: previewTo }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    throw new Error(`Unknown action: ${action}`)

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : ''
    console.error('INSURANCE_RENEWAL_TELECALLING_ERROR:', message, stack)
    return new Response(JSON.stringify({ success: false, error: message, stack }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
}

Deno.serve(handler)
