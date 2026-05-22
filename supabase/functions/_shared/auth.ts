import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export type AuthPayload = {
  userId: string
  role: 'admin' | 'manager' | 'staff' | 'viewer'
  dealerCode: string | null
}

/**
 * Extract and validate JWT from Authorization header.
 * Returns decoded JWT payload including user id, role, dealer_code.
 * Throws if invalid or missing.
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

  if (!supabaseUrl) {
    console.error('Missing SUPABASE_URL')
    throw new Error('Missing SUPABASE_URL')
  }
  
  if (!supabaseAnonKey) {
    console.error('Missing SUPABASE_ANON_KEY')
    throw new Error('Missing SUPABASE_ANON_KEY')
  }
  
  if (!serviceRoleKey) {
    console.error('Missing SUPABASE_SERVICE_ROLE_KEY')
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')
  }

  // Validate JWT with anon key
  const supabase = createClient(supabaseUrl, supabaseAnonKey)
  const { data, error } = await supabase.auth.getUser(token)

  if (error || !data.user) {
    console.error('JWT validation failed:', error?.message)
    throw new Error(`Invalid or expired token: ${error?.message}`)
  }

  const user = data.user
  const userId = user.id

  // Verify user has admin role in public.users (use service role to bypass RLS)
  const serviceClient = createClient(supabaseUrl, serviceRoleKey)
  const { data: publicUser, error: userError } = await serviceClient
    .from('users')
    .select('role')
    .eq('id', userId)
    .single()

  if (userError) {
    console.error('Failed to read user role:', userError.message)
    throw new Error(`Failed to read user role: ${userError.message}`)
  }
  
  if (!publicUser) {
    console.error('User not found in public.users')
    throw new Error('User not found in public.users')
  }

  if (publicUser.role !== 'admin') {
    console.error('User is not admin, role is:', publicUser.role)
    throw new Error('Only admins can perform this operation')
  }

  return {
    userId,
    role: publicUser.role as 'admin' | 'manager' | 'staff' | 'viewer',
    dealerCode: (user.user_metadata?.dealer_code as string) || null,
  }
}
