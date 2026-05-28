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

    // Try multiple download strategies
    let buffer: ArrayBuffer | null = null
    let contentType = 'application/octet-stream'

    // Strategy 1: Direct API download (requires auth, but most reliable)
    console.log('[drive-file-export] Strategy 1: Trying Google Drive API with alt=media...')
    const apiUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}?alt=media&supportsAllDrives=true`
    let apiRes = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    })

    console.log('[drive-file-export] API response status:', apiRes.status)
    console.log('[drive-file-export] API response content-type:', apiRes.headers.get('content-type'))

    if (apiRes.ok && apiRes.headers.get('content-type')?.includes('image')) {
      buffer = await apiRes.arrayBuffer()
      contentType = apiRes.headers.get('content-type') || 'application/octet-stream'
      console.log('[drive-file-export] ✓ Strategy 1 succeeded, size:', buffer.byteLength, 'bytes')
    } else {
      // Strategy 2: Public download URL with confirm parameter
      console.log('[drive-file-export] Strategy 1 failed, trying Strategy 2: Public download with confirm parameter...')
      const publicUrl = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(driveFileId)}&confirm=t`
      const publicRes = await fetch(publicUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        redirect: 'follow',
      })

      console.log('[drive-file-export] Public download response status:', publicRes.status)
      console.log('[drive-file-export] Public download content-type:', publicRes.headers.get('content-type'))

      if (publicRes.ok && publicRes.headers.get('content-type')?.includes('image')) {
        buffer = await publicRes.arrayBuffer()
        contentType = publicRes.headers.get('content-type') || 'image/jpeg'
        console.log('[drive-file-export] ✓ Strategy 2 succeeded, size:', buffer.byteLength, 'bytes')
      } else {
        // Strategy 3: Alternate public URL without export parameter
        console.log('[drive-file-export] Strategy 2 failed, trying Strategy 3: Alternate public URL...')
        const altUrl = `https://drive.google.com/uc?id=${encodeURIComponent(driveFileId)}`
        const altRes = await fetch(altUrl, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
          redirect: 'follow',
        })

        console.log('[drive-file-export] Alt URL response status:', altRes.status)
        console.log('[drive-file-export] Alt URL content-type:', altRes.headers.get('content-type'))

        if (altRes.ok) {
          buffer = await altRes.arrayBuffer()
          contentType = altRes.headers.get('content-type') || 'image/jpeg'
          
          // Check if we got HTML (error page)
          if (contentType.includes('text/html')) {
            console.warn('[drive-file-export] Got HTML response, size:', buffer.byteLength)
            buffer = null
          } else {
            console.log('[drive-file-export] ✓ Strategy 3 succeeded, size:', buffer.byteLength, 'bytes')
          }
        }
      }
    }

    if (!buffer) {
      console.error('[drive-file-export] All strategies failed to retrieve image data')
      return new Response(JSON.stringify({ 
        error: 'Failed to fetch file from Google Drive', 
        driveFileId: driveFileId.substring(0, 10) + '...',
        details: 'File may not be publicly accessible or permission denied'
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
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
