import { corsHeaders } from '../_shared/cors.ts'
import { logAuditEvent } from '../_shared/audit.ts'

type SendWhatsAppBody = {
  to?: string
  message?: string
  templateKey?: string
  meta?: Record<string, unknown>
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  })
}

function normalizeWhatsAppPhone(raw: string | null | undefined): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (!digits) return null
  if (digits.length === 10) return `91${digits}`
  if (digits.length === 12 && digits.startsWith('91')) return digits
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized: missing bearer token' }, 401)
    }

    const body = (await req.json()) as SendWhatsAppBody
    const destination = normalizeWhatsAppPhone(body.to)
    const message = String(body.message ?? '').trim()
    const templateKey = String(body.templateKey ?? '').trim()

    if (!destination) return json({ error: 'Invalid destination phone' }, 400)
    if (!message) return json({ error: 'Message is required' }, 400)
    if (!templateKey) return json({ error: 'templateKey is required' }, 400)

    const provider = String(Deno.env.get('WA_PROVIDER') ?? '').trim().toLowerCase()
    const simulate = String(Deno.env.get('WA_SIMULATE') ?? 'true').toLowerCase() === 'true'

    if (simulate || !provider) {
      await logAuditEvent({
        actor_id: 'system',
        action: 'wa_send_simulated',
        resource_type: 'whatsapp_message',
        resource_id: destination,
        details: {
          templateKey,
          provider: provider || 'simulate',
          preview: message.slice(0, 240),
          meta: body.meta ?? {},
        },
        timestamp: new Date().toISOString(),
      })

      return json({
        ok: true,
        status: 'simulated',
        provider: provider || 'simulate',
        to: destination,
        templateKey,
      })
    }

    // Provider adapters can be added here without changing caller payloads.
    return json(
      {
        ok: false,
        error: 'Provider adapter not implemented',
        code: 'WA_PROVIDER_NOT_IMPLEMENTED',
        provider,
      },
      501,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected send-whatsapp error'
    return json({ error: message }, 500)
  }
})
