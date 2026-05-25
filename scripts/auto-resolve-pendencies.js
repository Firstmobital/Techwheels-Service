#!/usr/bin/env node
/**
 * Auto-resolve all unmapped SR entries (pendencies)
 * This script processes all issues in the import_employee_mapping_issues table
 * and auto-assigns them based on employee codes.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://jmdndcphkmaljhwgzqxq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImptZG5kY3Boa21hbGpod2d6cXhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNTQwNTIsImV4cCI6MjA5MzYzMDA1Mn0.ZvYw9-2fsrQQbqgIUfiWlIlvklZZtnkJSJ-V-LvgDE0';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function normalizeBranch(value) {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed || null;
}

async function autoResolvePendencies() {
  console.log('🚀 Starting auto-resolve process for unmapped SR entries...\n');

  try {
    // Fetch all employees
    console.log('📥 Fetching employees...');
    const { data: employees, error: employeeError } = await supabase
      .from('employee_master')
      .select('*');

    if (employeeError) {
      throw new Error(`Failed to fetch employees: ${employeeError.message}`);
    }

    if (!employees || employees.length === 0) {
      console.error('❌ No employees found in master table.');
      return;
    }

    console.log(`✅ Found ${employees.length} employees\n`);

// Create employee maps (by code and by name)
      const employeeCodeMap = new Map();
      const employeeNameMap = new Map();
      employees.forEach((emp) => {
        employeeCodeMap.set(emp.employee_code.toLowerCase().trim(), emp);
        employeeNameMap.set(emp.employee_name.toLowerCase().trim(), emp);
    });

    // Fetch all open unmapped issues
    console.log('📥 Fetching unmapped SR entries...');
    const { data: issues, error: issueError } = await supabase
      .from('import_employee_mapping_issues')
      .select('*')
      .eq('status', 'open');

    if (issueError) {
      throw new Error(`Failed to fetch issues: ${issueError.message}`);
    }

    if (!issues || issues.length === 0) {
      console.log('✅ No open issues found. Everything is already resolved!');
      return;
    }

    console.log(`✅ Found ${issues.length} open issues\n`);

    let resolved = 0;
    let failed = 0;
    const failedCodes = new Set();
    const failureReasons = [];

    // Process each issue
    for (let i = 0; i < issues.length; i++) {
      const issue = issues[i];
      const progressPercent = Math.round(((i + 1) / issues.length) * 100);
      process.stdout.write(`\rProcessing... ${progressPercent}% (${i + 1}/${issues.length})`);

      if (!issue.sr_assigned_to) {
        failed++;
        failedCodes.add('UNKNOWN');
        continue;
      }

      const normalizedSrCode = issue.sr_assigned_to.toLowerCase().trim();
      let matchedEmployee = employeeCodeMap.get(normalizedSrCode);
      
      // Try matching by name if code didn't work
      if (!matchedEmployee) {
        matchedEmployee = employeeNameMap.get(normalizedSrCode);
        if (matchedEmployee && i < 5) {
          console.log(`\nMatched "${issue.sr_assigned_to}" by name -> ${matchedEmployee.employee_code}`);
        }
      }

      if (!matchedEmployee) {
        failed++;
        failedCodes.add(issue.sr_assigned_to);
        failureReasons.push(`No employee found for code: ${issue.sr_assigned_to}`);
        continue;
      }

      const employeeBranch = normalizeBranch(matchedEmployee.location);
      const updatePayload = {
        employee_code: matchedEmployee.employee_code,
        sr_assigned_to: matchedEmployee.employee_code,
      };

      if (employeeBranch) {
        updatePayload.branch = employeeBranch;
      }

      try {
        // Update the source table
        const { error: sourceError, data: sourceData } = await supabase
          .from(issue.source_table)
          .update(updatePayload)
          .eq('branch', issue.branch)
          .eq('sr_assigned_to', issue.sr_assigned_to)
          .is('employee_code', null);

        if (sourceError) {
          if (i < 5) console.log(`\nSource error for issue ${issue.id}: ${sourceError.message}`);
          throw sourceError;
        }

        if (i < 5) console.log(`\nUpdated ${issue.source_table}: updated ${sourceData?.length || 0} records`);

        // Mark issue as resolved
        const { error: mappingError } = await supabase
          .from('import_employee_mapping_issues')
          .update({
            status: 'resolved',
            resolved_employee_code: matchedEmployee.employee_code,
          })
          .eq('id', issue.id);

        if (mappingError) {
          if (i < 5) console.log(`\nMapping error for issue ${issue.id}: ${mappingError.message}`);
          throw mappingError;
        }

        resolved++;
      } catch (err) {
        failed++;
        failedCodes.add(issue.sr_assigned_to);
        failureReasons.push(`Error updating issue ${issue.id}: ${err.message}`);
      }
    }

    console.log('\n\n✨ Process Complete!\n');
    console.log(`📊 Results:`);
    console.log(`   ✅ Resolved: ${resolved}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   📈 Success Rate: ${((resolved / issues.length) * 100).toFixed(2)}%\n`);

    if (failedCodes.size > 0) {
      console.log(`⚠️  Failed SR Codes:`);
      failedCodes.forEach((code) => {
        console.log(`   - ${code}`);
      });
      console.log();
    }

    if (failureReasons.length > 0 && failureReasons.length <= 10) {
      console.log(`ℹ️  Failure Details:`);
      failureReasons.forEach((reason) => {
        console.log(`   - ${reason}`);
      });
      console.log();
    }

    console.log('🎉 Auto-resolve process completed!');
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  }
}

// Run the process
autoResolvePendencies();
