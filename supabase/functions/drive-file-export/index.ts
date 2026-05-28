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
  console.log(`[drive-file-export] ${req.method} request received`)
  
  // CORS
  if (req.method === 'OPTIONS') {
    console.log('[drive-file-export] Responding to CORS preflight')
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    })
  }

  if (req.method !== 'POST') {
    console.warn('[drive-file-export] Invalid method:', req.method)
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Verify auth
  const authHeader = req.headers.get('Authorization')
  console.log('[drive-file-export] Auth header present:', !!authHeader)
  
  if (!authHeader?.startsWith('Bearer ')) {
    console.warn('[drive-file-export] Missing or invalid Authorization header')
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const token = authHeader.slice(7)
  console.log('[drive-file-export] Token extracted, length:', token.length)

  try {
    // Verify JWT with Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    console.log('[drive-file-export] Supabase URL configured:', !!supabaseUrl)
    console.log('[drive-file-export] Service role key configured:', !!supabaseKey)
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('[drive-file-export] Missing Supabase credentials')
      throw new Error('Missing Supabase credentials')
    }

    const supabase = createClient(supabaseUrl, supabaseKey)
    
    // Verify the token
    console.log('[drive-file-export] Verifying token...')
    const { data, error: verifyError } = await supabase.auth.getUser(token)
    
    if (verifyError) {
      console.error('[drive-file-export] Token verification failed:', verifyError)
    }
    if (!data.user) {
      console.error('[drive-file-export] User not found in token')
    }
    
    if (verifyError || !data.user) {
      console.warn('[drive-file-export] Invalid token, user:', data.user?.email)
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    
    console.log('[drive-file-export] Token verified for user:', data.user.email)

    // Parse request body
    const body: RequestBody = await req.json()
    const { driveFileId } = body
    
    console.log('[drive-file-export] Drive file ID:', driveFileId?.substring(0, 10) + '...')

    if (!driveFileId) {
      console.warn('[drive-file-export] Missing driveFileId in request body')
      return new Response(JSON.stringify({ error: 'driveFileId required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Try public download URL first
    const publicDownloadUrl = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(driveFileId)}`
    console.log('[drive-file-export] Attempting public download from Google Drive...')

    const driveRes = await fetch(publicDownloadUrl, {
      method: 'GET',
    })

    console.log('[drive-file-export] Public download response status:', driveRes.status)

    if (!driveRes.ok) {
      console.warn('[drive-file-export] Public download failed, trying API endpoint...')
      const apiUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}?alt=media&supportsAllDrives=true`
      const apiRes = await fetch(apiUrl)
      
      console.log('[drive-file-export] API response status:', apiRes.status)
      
      if (!apiRes.ok) {
        console.error('[drive-file-export] API fetch failed with status', apiRes.status)
        const errText = await apiRes.text()
        console.error('[drive-file-export] API error:', errText.substring(0, 200))
        
        return new Response(JSON.stringify({ error: `Failed to fetch file from Drive: ${apiRes.status}` }), {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      const buffer = await apiRes.arrayBuffer()
      console.log('[drive-file-export] Successfully fetched from API, size:', buffer.byteLength, 'bytes')
      
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
    console.log('[drive-file-export] Successfully fetched from public URL, size:', buffer.byteLength, 'bytes')
    
    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': driveRes.headers.get('content-type') || 'application/octet-stream',
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (err) {
    console.error('[drive-file-export] Caught error:', err)
    console.error('[drive-file-export] Error stack:', err instanceof Error ? err.stack : 'N/A')
    
    return new Response(JSON.stringify({ error: 'Internal server error', details: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
