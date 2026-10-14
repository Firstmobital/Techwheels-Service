import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { StaffLinkedEmployeeProfile } from '../lib/staffMechanicalFloorInchargeAccess'

export type { StaffLinkedEmployeeProfile }

export function useStaffLinkedEmployeeProfile(user: User | null) {
  const [profile, setProfile] = useState<StaffLinkedEmployeeProfile | null>(null)

  useEffect(() => {
    let mounted = true
    async function load() {
      if (!user) {
        setProfile(null)
        return
      }
      try {
        const { data: rows } = await supabase
          .from('user_employee_links')
          .select('employee_master(department, role)')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .order('is_primary', { ascending: false })
          .limit(1)
        const raw = rows?.[0]?.employee_master
        const em = Array.isArray(raw) ? raw[0] : raw
        if (!mounted) return
        if (!em) {
          setProfile(null)
          return
        }
        setProfile({
          department: String((em as { department?: string }).department ?? '').trim() || null,
          role: String((em as { role?: string }).role ?? '').trim() || null,
        })
      } catch {
        if (mounted) setProfile(null)
      }
    }
    void load()
    return () => {
      mounted = false
    }
  }, [user])

  return profile
}
