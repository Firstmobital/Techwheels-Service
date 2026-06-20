import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const body = await req.json()
    const { action, template_id } = body

    // ── Load agent config ──────────────────────────────────────────────────────
    const { data: config } = await supabase
      .from('wa_agent_config')
      .select('meta_access_token, meta_phone_number_id, waba_id')
      .limit(1)
      .single()

    if (!config?.meta_access_token) {
      return new Response(JSON.stringify({ error: 'Meta access token not configured in Settings' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    if (!config?.waba_id) {
      return new Response(JSON.stringify({ error: 'WhatsApp Business Account ID (WABA ID) not configured in Settings' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const META_TOKEN = config.meta_access_token
    const WABA_ID   = config.waba_id

    // ── Helper: build Meta components array from template row ─────────────────
    function buildComponents(tpl: Record<string, unknown>) {
      const components: Record<string, unknown>[] = []

      // HEADER — only add if header_type is set AND header_text has actual content
      if (tpl.header_type && tpl.header_type !== 'NONE') {
        const headerText = String(tpl.header_text ?? '').trim()
        if (tpl.header_type === 'TEXT' && headerText) {
          components.push({ type: 'HEADER', format: 'TEXT', text: headerText })
        } else if (tpl.header_type === 'IMAGE') {
          components.push({ type: 'HEADER', format: 'IMAGE', example: { header_handle: ['https://example.com/placeholder.jpg'] } })
        }
        // If TEXT but no text — skip header entirely (this was the bug)
      }

      // BODY — always required
      const bodyText = String(tpl.body_text ?? '').trim()
      if (!bodyText) throw new Error('Body text is required')
      
      const bodyComponent: Record<string, unknown> = { type: 'BODY', text: bodyText }
      
      // Add example variables if present
      const varExamples = tpl.variable_examples as Array<Record<string,string>> | null
      // Count {{N}} placeholders in body
      const varCount = (bodyText.match(/\{\{\d+\}\}/g) ?? []).length
      if (varCount > 0) {
        if (varExamples && varExamples.length > 0) {
          bodyComponent.example = { body_text: [varExamples.map(v => v.example_value ?? v.example ?? 'Sample')] }
        } else {
          // Auto-generate placeholder examples so Meta doesn't reject
          bodyComponent.example = { body_text: [Array.from({length: varCount}, (_, i) => `Example${i+1}`)] }
        }
      }
      components.push(bodyComponent)

      // FOOTER
      const footerText = String(tpl.footer_text ?? '').trim()
      if (footerText) {
        components.push({ type: 'FOOTER', text: footerText })
      }

      // BUTTONS — Meta doesn't allow emojis, newlines or formatting in button text
      const buttons = tpl.buttons as Array<{type:string;text:string;url?:string;phone?:string}> | null
      if (buttons && buttons.length > 0) {
        const cleanedButtons = buttons.map(btn => ({
          ...btn,
          // Strip emojis and non-ASCII characters from button text
          text: btn.text
            .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F300}-\u{1F9FF}\u{1FA00}-\u{1FA9F}\u{1FAA0}-\u{1FAFF}]/gu, '')
            .replace(/[^\x20-\x7E\u00A0-\u024F]/g, '')
            .replace(/[\n\r]/g, ' ')
            .replace(/[*_~`]/g, '')
            .trim()
            .slice(0, 25), // Meta max button text length
        })).filter(btn => btn.text.length > 0)
        if (cleanedButtons.length > 0) {
          components.push({ type: 'BUTTONS', buttons: cleanedButtons })
        }
      }

      return components
    }

    // ── ACTION: submit — send one template to Meta for approval ───────────────
    if (action === 'submit') {
      if (!template_id) return new Response(JSON.stringify({ error: 'template_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })

      const { data: tpl } = await supabase
        .from('wa_templates')
        .select('*')
        .eq('id', template_id)
        .single()

      if (!tpl) return new Response(JSON.stringify({ error: 'Template not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })

      let components: Record<string, unknown>[]
      try {
        components = buildComponents(tpl)
      } catch (e) {
        return new Response(JSON.stringify({ error: String(e) }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const metaPayload = {
        name: tpl.name,
        category: tpl.category,
        language: tpl.language || 'en',
        components,
      }

      const metaRes = await fetch(
        `https://graph.facebook.com/v19.0/${WABA_ID}/message_templates`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${META_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(metaPayload),
        }
      )

      const metaBody = await metaRes.json()

      if (!metaRes.ok) {
        return new Response(JSON.stringify({ error: 'Meta API error', meta_error: metaBody }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Update template in DB
      await supabase.from('wa_templates').update({
        status: 'pending',
        meta_template_id: String(metaBody.id ?? ''),
        submitted_at: new Date().toISOString(),
      }).eq('id', template_id)

      return new Response(JSON.stringify({ success: true, message: 'Template submitted to Meta for approval', meta_id: metaBody.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ── ACTION: sync_status — check approval status of one template ───────────
    if (action === 'sync_status') {
      if (!template_id) return new Response(JSON.stringify({ error: 'template_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })

      const { data: tpl } = await supabase.from('wa_templates').select('meta_template_id').eq('id', template_id).single()
      if (!tpl?.meta_template_id) return new Response(JSON.stringify({ error: 'No Meta template ID — submit first' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })

      const metaRes = await fetch(
        `https://graph.facebook.com/v19.0/${tpl.meta_template_id}?fields=name,status,rejection_reason`,
        { headers: { 'Authorization': `Bearer ${META_TOKEN}` } }
      )
      const metaBody = await metaRes.json()
      if (!metaRes.ok) return new Response(JSON.stringify({ error: 'Meta API error', meta_error: metaBody }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })

      const newStatus = String(metaBody.status ?? '').toLowerCase()
      const updateData: Record<string, unknown> = { status: newStatus }
      if (newStatus === 'approved') updateData.approved_at = new Date().toISOString()
      if (metaBody.rejection_reason) updateData.rejection_reason = metaBody.rejection_reason

      await supabase.from('wa_templates').update(updateData).eq('id', template_id)

      return new Response(JSON.stringify({ success: true, status: newStatus, rejection_reason: metaBody.rejection_reason ?? null }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ── ACTION: sync_all — sync status of ALL pending templates ──────────────
    if (action === 'sync_all') {
      const metaRes = await fetch(
        `https://graph.facebook.com/v19.0/${WABA_ID}/message_templates?fields=name,status,rejection_reason,id&limit=100`,
        { headers: { 'Authorization': `Bearer ${META_TOKEN}` } }
      )
      const metaBody = await metaRes.json()
      if (!metaRes.ok) return new Response(JSON.stringify({ error: 'Meta API error', meta_error: metaBody }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })

      const metaTemplates: Array<{id:string;name:string;status:string;rejection_reason?:string}> = metaBody.data ?? []
      let synced = 0

      for (const mt of metaTemplates) {
        const newStatus = mt.status.toLowerCase()
        const updateData: Record<string, unknown> = { status: newStatus, meta_template_id: mt.id }
        if (newStatus === 'approved') updateData.approved_at = new Date().toISOString()
        if (mt.rejection_reason) updateData.rejection_reason = mt.rejection_reason

        const { count } = await supabase.from('wa_templates')
          .update(updateData)
          .eq('name', mt.name)
          .select('*', { count: 'exact', head: true })
        
        if ((count ?? 0) > 0) synced++
      }

      return new Response(JSON.stringify({ success: true, synced, total_meta_templates: metaTemplates.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ── ACTION: import_from_meta — pull templates from Meta into DB ────────────
    if (action === 'import_from_meta') {
      const metaRes = await fetch(
        `https://graph.facebook.com/v19.0/${WABA_ID}/message_templates?fields=name,status,category,language,components,rejection_reason,id&limit=100`,
        { headers: { 'Authorization': `Bearer ${META_TOKEN}` } }
      )
      const metaBody = await metaRes.json()
      if (!metaRes.ok) return new Response(JSON.stringify({ error: 'Meta API error', meta_error: metaBody }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })

      const metaTemplates: Array<Record<string, unknown>> = metaBody.data ?? []
      let imported = 0; let updated = 0

      for (const mt of metaTemplates) {
        const components = (mt.components ?? []) as Array<Record<string, unknown>>
        const header = components.find(c => c.type === 'HEADER')
        const body   = components.find(c => c.type === 'BODY')
        const footer = components.find(c => c.type === 'FOOTER')
        const btns   = components.find(c => c.type === 'BUTTONS')

        const tplData = {
          name: String(mt.name),
          display_name: String(mt.name).replace(/_/g, ' '),
          category: String(mt.category ?? 'UTILITY'),
          language: String(mt.language ?? 'en'),
          status: String(mt.status ?? 'pending').toLowerCase(),
          meta_template_id: String(mt.id ?? ''),
          header_type: header ? String(header.format ?? 'TEXT') : null,
          header_text: header?.format === 'TEXT' ? String(header.text ?? '') : null,
          body_text: String(body?.text ?? ''),
          footer_text: footer ? String(footer.text ?? '') : null,
          buttons: btns?.buttons ?? null,
          rejection_reason: mt.rejection_reason ? String(mt.rejection_reason) : null,
        }

        const { data: existing } = await supabase.from('wa_templates').select('id').eq('name', tplData.name).maybeSingle()
        if (existing) {
          await supabase.from('wa_templates').update(tplData).eq('id', existing.id)
          updated++
        } else {
          await supabase.from('wa_templates').insert([tplData])
          imported++
        }
      }

      return new Response(JSON.stringify({ success: true, imported, updated, total: metaTemplates.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ── ACTION: delete — remove template from Meta ─────────────────────────────
    if (action === 'delete') {
      if (!template_id) return new Response(JSON.stringify({ error: 'template_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })

      const { data: tpl } = await supabase.from('wa_templates').select('name,meta_template_id').eq('id', template_id).single()

      if (tpl?.meta_template_id) {
        await fetch(
          `https://graph.facebook.com/v19.0/${WABA_ID}/message_templates?name=${tpl.name}`,
          { method: 'DELETE', headers: { 'Authorization': `Bearer ${META_TOKEN}` } }
        )
      }

      await supabase.from('wa_templates').delete().eq('id', template_id)
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
