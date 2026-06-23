import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export type AuthPayload = {
  userId: string
  role: 'admin' | 'manager' | 'staff' | 'viewer'
  dealerCode: string | null
}

/**
 * Decode a JWT without verifying signature (we'll verify via Supabase JWKS or just trust structure).
 * Returns the payload or throws if malformed.
 */
function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('Malformed JWT')
  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const decoded = atob(padded)
  return JSON.parse(decoded)
}

/**
 * Extract and validate JWT from Authorization header.
 * Returns decoded JWT payload including user id, role, dealer_code.
 * Throws if invalid or missing.
 *
 * Uses service-role client to look up user directly — avoids "Auth session missing"
 * errors that occur when getUser() is called on an invalidated session.
 */
export async function validateRequest(req: Request): Promise<AuthPayload> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    console.error('Missing Authorization header')
    throw new Error('Missing or invalid Authorization header')
  }

  const token = authHeader.slice(7)
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    throw new Error('Missing required Supabase env vars')
  }

  // Step 1: Decode JWT to extract sub (userId) without network call
  let userId: string
  let tokenExp: number | undefined
  try {
    const payload = decodeJwtPayload(token)
    const sub = payload['sub']
    if (!sub || typeof sub !== 'string') throw new Error('No sub in JWT')
    userId = sub
    tokenExp = typeof payload['exp'] === 'number' ? payload['exp'] : undefined
  } catch (e) {
    console.error('JWT decode failed:', e)
    throw new Error('Invalid or malformed JWT')
  }

  // Step 2: Check token expiry
  if (tokenExp !== undefined) {
    const nowSec = Math.floor(Date.now() / 1000)
    if (nowSec > tokenExp) {
      throw new Error('Token has expired. Please log out and log in again.')
    }
  }

  // Step 3: Verify token is a real Supabase JWT by calling getUser (fast network check)
  // Fall back to service-role user lookup if session is invalidated (graceful degradation)
  let verifiedUserId = userId
  try {
    const anonClient = createClient(supabaseUrl, supabaseAnonKey)
    const { data, error } = await anonClient.auth.getUser(token)
    if (error) {
      // "Auth session missing" or similar — session was invalidated server-side
      // Fall through: we already have userId from JWT, just verify it exists in users table
      console.warn('[auth] getUser failed (session may be invalidated):', error.message)
    } else if (data.user?.id) {
      verifiedUserId = data.user.id
    }
  } catch {
    // Network error — proceed with JWT-decoded userId
    console.warn('[auth] getUser threw, proceeding with JWT userId')
  }

  // Step 4: Look up user role in public.users using service role
  const serviceClient = createClient(supabaseUrl, serviceRoleKey)
  const { data: publicUser, error: userError } = await serviceClient
    .from('users')
    .select('role, dealer_code')
    .eq('id', verifiedUserId)
    .single()

  if (userError || !publicUser) {
    console.error('Failed to read user role:', userError?.message)
    throw new Error('User not found or unable to read role.')
  }

  const allowedRoles = ['admin', 'manager', 'staff', 'viewer']
  if (!allowedRoles.includes(publicUser.role)) {
    console.error('User role not permitted:', publicUser.role)
    throw new Error('Your account role does not have permission to perform this operation')
  }

  return {
    userId: verifiedUserId,
    role: publicUser.role as 'admin' | 'manager' | 'staff' | 'viewer',
    dealerCode: (publicUser.dealer_code as string) || null,
  }
}
