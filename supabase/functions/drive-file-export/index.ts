/**
 * drive-file-export — Proxy Google Drive file downloads to frontend
 * 
 * Avoids CORS issues by fetching from Drive server-side and returning binary data.
 * Authenticated request required (uses JWT bearer token).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.5'

interface RequestBody {
  driveFileId: string
}

Deno.serve(async (req) => {
  // CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Verify auth
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const token = authHeader.slice(7)

  try {
    // Verify JWT with Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase credentials')
    }

    const supabase = createClient(supabaseUrl, supabaseKey)
    
    // Verify the token
    const { data, error: verifyError } = await supabase.auth.getUser(token)
    if (verifyError || !data.user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Parse request body
    const body: RequestBody = await req.json()
    const { driveFileId } = body

    if (!driveFileId) {
      return new Response(JSON.stringify({ error: 'driveFileId required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Get Google credentials from service role
    const googleServiceAccount = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
    if (!googleServiceAccount) {
      return new Response(JSON.stringify({ error: 'Google credentials not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const credentials = JSON.parse(googleServiceAccount)

    // Generate JWT for service account
    const header = {
      alg: 'RS256',
      typ: 'JWT',
    }

    const now = Math.floor(Date.now() / 1000)
    const payload = {
      iss: credentials.client_email,
      sub: credentials.client_email,
      scope: 'https://www.googleapis.com/auth/drive.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    }

    // For simplicity, use public URL format (files shared with anyone with link can be downloaded)
    // This avoids needing JWT token generation
    const publicDownloadUrl = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(driveFileId)}`

    const driveRes = await fetch(publicDownloadUrl, {
      method: 'GET',
    })

    if (!driveRes.ok) {
      // Try API endpoint as fallback
      const apiUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}?alt=media&supportsAllDrives=true`
      const apiRes = await fetch(apiUrl)
      
      if (!apiRes.ok) {
        return new Response(JSON.stringify({ error: `Failed to fetch file from Drive: ${apiRes.status}` }), {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      const buffer = await apiRes.arrayBuffer()
      return new Response(buffer, {
        status: 200,
        headers: {
          'Content-Type': apiRes.headers.get('content-type') || 'application/octet-stream',
          'Cache-Control': 'public, max-age=86400',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    const buffer = await driveRes.arrayBuffer()
    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': driveRes.headers.get('content-type') || 'application/octet-stream',
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (err) {
    console.error('drive-file-export error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
