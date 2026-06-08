import { supabase } from '../supabase'
import { fail, ok, type ApiResult } from './types'

export interface UserEmployeeLinkRow {
  id: number
  user_id: string
  employee_code: string
  dealer_code: string
  is_primary: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface UserEmployeeLinkInput {
  user_id: string
  employee_code: string
  dealer_code: string
  is_primary?: boolean
}

export interface UserEmployeeLinkUpdate {
  employee_code?: string
  dealer_code?: string
  is_primary?: boolean
  is_active?: boolean
}

/**
 * List all active user-employee mappings (admin only)
 */
export async function listUserEmployeeLinks(): Promise<ApiResult<UserEmployeeLinkRow[]>> {
  try {
    const { data, error } = await supabase
      .from('user_employee_links')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (error) return fail(`Failed to list mappings: ${error.message}`)
    return ok(data ?? [])
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return fail(`Failed to list mappings: ${message}`)
  }
}

/**
 * Get mappings for a specific user
 */
export async function getUserEmployeeLinks(userId: string): Promise<ApiResult<UserEmployeeLinkRow[]>> {
  try {
    const { data, error } = await supabase
      .from('user_employee_links')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) return fail(`Failed to get user mappings: ${error.message}`)
    return ok(data ?? [])
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return fail(`Failed to get user mappings: ${message}`)
  }
}

/**
 * Create a new user-employee mapping (admin only)
 * Validates: employee_code exists, no duplicate primary per user/dealer
 */
export async function createUserEmployeeLink(
  input: UserEmployeeLinkInput
): Promise<ApiResult<UserEmployeeLinkRow>> {
  try {
    // Validation 1: Verify employee_code exists
    const { data: empData, error: empError } = await supabase
      .from('employee_master')
      .select('employee_code')
      .eq('employee_code', input.employee_code)
      .single()

    if (empError || !empData) {
      return fail(`Employee code '${input.employee_code}' not found`)
    }

    // Validation 2: Check if user exists and is active
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, is_active')
      .eq('id', input.user_id)
      .single()

    if (userError || !userData) {
      return fail(`User '${input.user_id}' not found`)
    }

    if (!userData.is_active) {
      return fail(`User '${input.user_id}' is inactive`)
    }

    // Validation 3: If marking as primary, deactivate other primary mappings for this user/dealer
    if (input.is_primary === true) {
      await supabase
        .from('user_employee_links')
        .update({ is_primary: false })
        .match({ user_id: input.user_id, dealer_code: input.dealer_code, is_primary: true })
    }

    // Insert new mapping
    const { data, error } = await supabase
      .from('user_employee_links')
      .insert({
        user_id: input.user_id,
        employee_code: input.employee_code,
        dealer_code: input.dealer_code,
        is_primary: input.is_primary ?? false,
        is_active: true,
      })
      .select()
      .single()

    if (error) return fail(`Failed to create mapping: ${error.message}`)
    if (!data) return fail('Mapping created but response empty')

    return ok(data as UserEmployeeLinkRow)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return fail(`Failed to create mapping: ${message}`)
  }
}

/**
 * Update a user-employee mapping (admin only)
 */
export async function updateUserEmployeeLink(
  id: number,
  update: UserEmployeeLinkUpdate
): Promise<ApiResult<UserEmployeeLinkRow>> {
  try {
    const { data: current, error: currentError } = await supabase
      .from('user_employee_links')
      .select('user_id, dealer_code')
      .eq('id', id)
      .single()

    if (currentError || !current) {
      return fail(`Mapping '${id}' not found`)
    }

    const normalizedUpdate: UserEmployeeLinkUpdate = {
      ...update,
      employee_code: update.employee_code?.trim().toUpperCase(),
      dealer_code: update.dealer_code?.trim().toUpperCase(),
    }

    // Validation: If employee code changed, ensure it exists.
    if (normalizedUpdate.employee_code) {
      const { data: empData, error: empError } = await supabase
        .from('employee_master')
        .select('employee_code')
        .eq('employee_code', normalizedUpdate.employee_code)
        .single()

      if (empError || !empData) {
        return fail(`Employee code '${normalizedUpdate.employee_code}' not found`)
      }
    }

    // Validation: If marking as primary, deactivate other primary mappings
    const targetDealerCode = normalizedUpdate.dealer_code ?? current.dealer_code
    if (normalizedUpdate.is_primary === true) {
      await supabase
        .from('user_employee_links')
        .update({ is_primary: false })
        .match({
          user_id: current.user_id,
          dealer_code: targetDealerCode,
          is_primary: true,
        })
        .neq('id', id)
    }

    const { data, error } = await supabase
      .from('user_employee_links')
      .update(normalizedUpdate)
      .eq('id', id)
      .select()
      .single()

    if (error) return fail(`Failed to update mapping: ${error.message}`)
    if (!data) return fail('Mapping updated but response empty')

    return ok(data as UserEmployeeLinkRow)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return fail(`Failed to update mapping: ${message}`)
  }
}

/**
 * Deactivate a user-employee mapping (soft delete, admin only)
 */
export async function deactivateUserEmployeeLink(id: number): Promise<ApiResult<void>> {
  try {
    const { error } = await supabase
      .from('user_employee_links')
      .update({ is_active: false })
      .eq('id', id)

    if (error) return fail(`Failed to deactivate mapping: ${error.message}`)
    return ok(undefined)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return fail(`Failed to deactivate mapping: ${message}`)
  }
}

/**
 * Get all employees (for mapping dropdown in UI)
 */
export async function listEmployees(): Promise<ApiResult<Array<{ employee_code: string; employee_name: string; role?: string | null }>>> {
  try {
    // Employee mapping is role-agnostic: any employee can be linked to a user.
    const { data: allData, error: allError } = await supabase
      .from('employee_master')
      .select('employee_code, employee_name, role')
      .order('employee_name')

    if (allError) return fail(`Failed to list employees: ${allError.message}`)

    const employees = (allData ?? []).map(e => ({
      employee_code: e.employee_code,
      employee_name: e.employee_name,
      role: e.role ?? null,
    }))

    return ok(employees)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return fail(`Failed to list employees: ${message}`)
  }
}

// Backward-compatible alias for existing imports.
export const listServiceAdvisors = listEmployees
