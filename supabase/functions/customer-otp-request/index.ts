import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// Body Shop Customer App: requests an OTP for mobile+registration-number
// login. This is the ONLY place the plaintext OTP ever exists outside the
// database -- request_customer_otp() is restricted to service_role, so the
// browser can never call it directly and read the code back. This function
// relays the OTP via the existing send-whatsapp function-to-function (never
// returning it in the HTTP response to the caller).

type RequestBody = { mobile?: string; reg_number?: string }

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders })
  }

  try {
    const { mobile, reg_number } = (await req.json()) as RequestBody
    const cleanMobile = String(mobile ?? '').replace(/\D/g, '')
    const cleanReg = String(reg_number ?? '').trim()

    if (!/^[0-9]{10}$/.test(cleanMobile) || !cleanReg) {
      return new Response(JSON.stringify({ error: 'Enter a valid mobile number and registration number' }), {
        status: 400,
        headers: corsHeaders,
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data, error } = await supabase.rpc('request_customer_otp', {
      p_mobile: cleanMobile,
      p_reg_number: cleanReg,
    })

    if (error) {
      // Rate-limit errors are safe to surface; identity-lookup failures are not.
      const message = /too many/i.test(error.message) ? error.message : null
      return new Response(JSON.stringify({ error: message ?? 'Unable to process request' }), {
        status: message ? 429 : 400,
        headers: corsHeaders,
      })
    }

    // Deliberately return the same generic response whether or not the
    // mobile+registration pair was found, so a caller cannot enumerate
    // valid customer identities.
    if (data?.found) {
      const functionsUrl = Deno.env.get('SUPABASE_URL')!.replace('.supabase.co', '.supabase.co/functions/v1')
      await fetch(`${functionsUrl}/send-whatsapp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({
          to: data.mobile,
          templateKey: 'customer_app_otp',
          message: `Your Techwheels Body Shop verification code is ${data.otp}. It expires in 10 minutes.`,
        }),
      }).catch(() => {
        // Delivery failure is logged by send-whatsapp itself; the customer
        // sees a generic "code sent" response either way and can retry.
      })
    }

    return new Response(JSON.stringify({ ok: true, message: 'If the details match, a code has been sent.' }), {
      status: 200,
      headers: corsHeaders,
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Unexpected error' }), { status: 500, headers: corsHeaders })
  }
})
