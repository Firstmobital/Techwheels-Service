import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export function useStaffAllowedModules(user: User | null) {
  const [allowedModules, setAllowedModules] = useState<Set<string>>(new Set())

  useEffect(() => {
    let mounted = true
    async function loadPermissions() {
      if (!user) {
        setAllowedModules(new Set())
        return
      }
      try {
        const [{ data: profile }, { data: permissionRows }] = await Promise.all([
          supabase.from('users').select('role, name, dealer_code').eq('id', user.id).maybeSingle(),
          supabase.rpc('get_all_my_permissions'),
        ])
        const rawMods = ((permissionRows ?? []) as Array<{ module_name?: string }>)
          .map((r) => String(r.module_name ?? '').trim().toLowerCase())
          .filter(Boolean)
        const mods = new Set<string>(rawMods)

        const userRole = String((profile as { role?: string } | null)?.role || user.user_metadata?.role || '').toLowerCase()

        if (userRole === 'admin') {
          ;[
            'reception',
            'floor_incharge',
            'service_advisor',
            'reports',
            'import',
            'admin',
            'settings',
            'autodoc',
            'telecalling',
            'bodyshop_repair',
            'bodyshop_floor',
            'bodyshop_floor_work',
            'driver_tasks',
            'driver_management',
            'service_booking',
          ].forEach((m) => mods.add(m))
        }

        if (
          userRole === 'driver' ||
          mods.has('driver_management') ||
          mods.has('driver_tasks') ||
          mods.has('driver') ||
          mods.has('service_booking')
        ) {
          mods.add('driver_tasks')
          mods.add('driver_management')
        }

        if (mounted) setAllowedModules(mods)
      } catch (err) {
        console.warn('Error loading user permissions:', err)
      }
    }
    void loadPermissions()
    return () => {
      mounted = false
    }
  }, [user])

  return allowedModules
}
