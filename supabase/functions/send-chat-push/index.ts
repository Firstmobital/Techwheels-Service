/**
 * Drain chat_push_outbox.
 * Android tokens (token_provider fcm) go through FCM HTTP v1 for project techwheels-service.
 * iOS tokens (token_provider expo) go through the Expo push API.
 * An Expo-shaped token always uses Expo, even if the row says otherwise.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return String(error || 'Unknown error')
}

function base64UrlEncode(value: Uint8Array | string) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value
  const binary = Array.from(bytes)
    .map((byte) => String.fromCharCode(byte))
    .join('')
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function normalizePrivateKey(privateKeyRaw: string) {
  return privateKeyRaw.replace(/\\n/g, '\n')
}

function parsePkcs8Key(privateKeyRaw: string) {
  const pem = normalizePrivateKey(privateKeyRaw)
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '')
  return Uint8Array.from(atob(pem), (c) => c.charCodeAt(0))
}

function shouldDeactivateToken(errorMessage: string) {
  const normalized = errorMessage.toUpperCase()
  return (
    normalized.includes('INVALID_ARGUMENT') ||
    normalized.includes('UNREGISTERED') ||
    normalized.includes('NOTREGISTERED') ||
    normalized.includes('DEVICENOTREGISTERED')
  )
}

function isExpoToken(deviceToken: string) {
  return /^(ExponentPushToken|ExpoPushToken)\[.+\]$/.test(deviceToken)
}

function isLikelyFcmToken(deviceToken: string) {
  return typeof deviceToken === 'string' && deviceToken.length > 40 && deviceToken.includes(':')
}

type OutboxRow = {
  id: string
  token_id: string
  title: string
  body: string
  chat_id?: string
  data: Record<string, unknown> | null
  device_token: string
  token_provider: string
}

function stringifyPushData(data: Record<string, unknown>, row: OutboxRow): Record<string, string> {
  const merged: Record<string, unknown> = { ...data }
  if (row.chat_id) merged.chat_id = row.chat_id
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined || value === null) continue
    out[key] = typeof value === 'string' ? value : String(value)
  }
  return out
}

async function sendExpoPush(row: OutboxRow) {
  const data = row.data || {}
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      to: row.device_token,
      title: row.title || 'Techwheels',
      body: row.body || '',
      data: stringifyPushData(data, row),
      sound: 'default',
      priority: 'high',
      channelId: 'default',
    }),
  })
  const result = await response.json()
  if (!response.ok) {
    throw new Error(`Expo push error: ${JSON.stringify(result)}`)
  }
  const ticket = Array.isArray(result?.data) ? result.data[0] : result?.data
  if (ticket?.status && ticket.status !== 'ok') {
    throw new Error(`Expo push error: ${JSON.stringify(result)}`)
  }
  return result
}

async function createGoogleAccessToken(clientEmail: string, privateKey: string) {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }
  const unsignedToken = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    parsePkcs8Key(privateKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(unsignedToken),
  )
  const signedJwt = `${unsignedToken}.${base64UrlEncode(new Uint8Array(signature))}`
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: signedJwt,
    }),
  })
  const tokenResult = await tokenResponse.json()
  if (!tokenResponse.ok || !tokenResult?.access_token) {
    throw new Error(`Failed to fetch Google access token: ${JSON.stringify(tokenResult)}`)
  }
  return tokenResult.access_token as string
}

async function sendFcmPush(row: OutboxRow, projectId: string, accessToken: string) {
  const data = row.data || {}
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      message: {
        token: row.device_token,
        notification: {
          title: row.title || 'Techwheels',
          body: row.body || '',
        },
        data: stringifyPushData(data, row),
        android: {
          priority: 'HIGH',
          notification: {
            channel_id: 'default',
            sound: 'default',
          },
        },
      },
    }),
  })
  const result = await response.json()
  if (!response.ok || result?.error) {
    throw new Error(`FCM push error: ${JSON.stringify(result)}`)
  }
  return result
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const fcmProjectId = Deno.env.get('FCM_PROJECT_ID')
  const fcmClientEmail = Deno.env.get('FCM_CLIENT_EMAIL')
  const fcmPrivateKey = Deno.env.get('FCM_PRIVATE_KEY')

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: 'Missing environment variables' }), { status: 500 })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  type WorkItem = OutboxRow & { completeRpc: 'complete_chat_push_outbox' | 'complete_customer_push_outbox' }

  const { data: chatClaimed, error: chatClaimError } = await supabase.rpc('claim_chat_push_outbox', {
    p_limit: 40,
  })
  if (chatClaimError) {
    return new Response(JSON.stringify({ error: chatClaimError.message }), { status: 500 })
  }

  const { data: customerClaimed, error: customerClaimError } = await supabase.rpc(
    'claim_customer_push_outbox',
    { p_limit: 40 },
  )
  if (customerClaimError) {
    return new Response(JSON.stringify({ error: customerClaimError.message }), { status: 500 })
  }

  const rows: WorkItem[] = [
    ...((chatClaimed || []) as OutboxRow[]).map((row) => ({
      ...row,
      completeRpc: 'complete_chat_push_outbox' as const,
    })),
    ...((customerClaimed || []) as OutboxRow[]).map((row) => ({
      ...row,
      completeRpc: 'complete_customer_push_outbox' as const,
    })),
  ]

  if (rows.length === 0) {
    return new Response(JSON.stringify({ message: 'No pending notifications' }), { status: 200 })
  }

  let googleAccessToken: string | null = null
  let delivered = 0
  let failed = 0

  for (const row of rows) {
    try {
      if (!row.device_token) {
        throw new Error('UNREGISTERED: missing device token')
      }

      let provider = String(row.token_provider || 'fcm').toLowerCase()
      if (isExpoToken(row.device_token)) provider = 'expo'

      if (provider === 'expo') {
        await sendExpoPush(row)
      } else if (provider === 'fcm') {
        if (!isLikelyFcmToken(row.device_token)) {
          throw new Error('INVALID_ARGUMENT: malformed FCM registration token')
        }
        if (!fcmProjectId || !fcmClientEmail || !fcmPrivateKey) {
          throw new Error('FCM credentials are not configured')
        }
        if (!googleAccessToken) {
          googleAccessToken = await createGoogleAccessToken(fcmClientEmail, fcmPrivateKey)
        }
        await sendFcmPush(row, fcmProjectId, googleAccessToken)
      } else {
        throw new Error(`Unsupported token provider: ${provider}`)
      }

      await supabase.rpc(row.completeRpc, {
        p_id: row.id,
        p_status: 'sent',
        p_error_text: null,
        p_deactivate_token: false,
      })
      delivered += 1
    } catch (error) {
      failed += 1
      const message = getErrorMessage(error)
      await supabase.rpc(row.completeRpc, {
        p_id: row.id,
        p_status: 'failed',
        p_error_text: message,
        p_deactivate_token: shouldDeactivateToken(message),
      })
    }
  }

  return new Response(JSON.stringify({ success: true, processed: rows.length, delivered, failed }), {
    status: 200,
  })
})
