import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://jmdndcphkmaljhwgzqxq.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImptZG5kY3Boa21hbGpod2d6cXhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNTQwNTIsImV4cCI6MjA5MzYzMDA1Mn0.ZvYw9-2fsrQQbqgIUfiWlIlvklZZtnkJSJ-V-LvgDE0'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})
