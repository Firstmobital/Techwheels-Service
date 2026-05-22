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
    throw new Error('Missing or invalid Authorization header')
  }

  const token = authHeader.slice(7)
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  const supabase = createClient(supabaseUrl, supabaseAnonKey)
  const { data, error } = await supabase.auth.getUser(token)

  if (error || !data.user) {
    throw new Error('Invalid or expired token')
  }

  const user = data.user
  const userId = user.id

  // Verify user has admin role in public.users
  const { data: publicUser, error: userError } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .single()

  if (userError || !publicUser) {
    throw new Error('User not found in public.users')
  }

  if (publicUser.role !== 'admin') {
    throw new Error('Only admins can perform this operation')
  }

  return {
    userId,
    role: publicUser.role as 'admin' | 'manager' | 'staff' | 'viewer',
    dealerCode: (user.user_metadata?.dealer_code as string) || null,
  }
}
