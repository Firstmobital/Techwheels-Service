#!/usr/bin/env node
/**
 * Auto-resolve ALL unmapped SR entries using batch updates (much faster!)
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://jmdndcphkmaljhwgzqxq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImptZG5kY3Boa21hbGpod2d6cXhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNTQwNTIsImV4cCI6MjA5MzYzMDA1Mn0.ZvYw9-2fsrQQbqgIUfiWlIlvklZZtnkJSJ-V-LvgDE0';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const BATCH_SIZE = 500;

async function autoResolvePendencies() {
  console.log('🚀 Starting BATCH auto-resolve process for ALL unmapped SR entries...\n');

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

    // Get total count
    console.log('📥 Counting open unmapped entries...');
    const { count: totalCount } = await supabase
      .from('import_employee_mapping_issues')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'open');

    console.log(`✅ Found ${totalCount} open issues\n`);

    let resolved = 0;
    let failed = 0;
    const failedCodes = new Set();
    let offset = 0;
    let batchNumber = 0;

    // Process in large batches
    while (offset < totalCount) {
      batchNumber++;
      const batchEnd = Math.min(offset + BATCH_SIZE - 1, totalCount - 1);
      const progressPercent = Math.round(((offset + BATCH_SIZE) / totalCount) * 100);
      process.stdout.write(`\rBatch ${batchNumber}: ${progressPercent}% (${offset + BATCH_SIZE} / ${totalCount})`);

      const { data: issues, error: issueError } = await supabase
        .from('import_employee_mapping_issues')
        .select('*')
        .eq('status', 'open')
        .range(offset, batchEnd);

      if (issueError) {
        throw new Error(`Failed to fetch issues: ${issueError.message}`);
      }

      if (!issues || issues.length === 0) {
        break;
      }

      // Prepare batch updates - only include fields to update
      const updates = [];
      for (const issue of issues) {
        if (!issue.sr_assigned_to) {
          failed++;
          failedCodes.add('UNKNOWN');
          continue;
        }

        const normalizedSrCode = issue.sr_assigned_to.toLowerCase().trim();
        let matchedEmployee = employeeCodeMap.get(normalizedSrCode);
        
        if (!matchedEmployee) {
          matchedEmployee = employeeNameMap.get(normalizedSrCode);
        }

        if (!matchedEmployee) {
          failed++;
          failedCodes.add(issue.sr_assigned_to);
          continue;
        }

        // Only include id and fields to update
        updates.push({
          id: issue.id,
          status: 'resolved',
          resolved_employee_code: matchedEmployee.employee_code,
        });
      }

      // Perform batch update with proper upsert options
      if (updates.length > 0) {
        const { error: updateError } = await supabase
          .from('import_employee_mapping_issues')
          .upsert(updates, {
            onConflict: 'id'
          });

        if (updateError) {
          console.log(`\n⚠️  Batch ${batchNumber} update error: ${updateError.message}`);
          console.log('   Trying individual updates...');
          
          // Fallback to individual updates
          for (const update of updates) {
            try {
              const { error: indError } = await supabase
                .from('import_employee_mapping_issues')
                .update({
                  status: update.status,
                  resolved_employee_code: update.resolved_employee_code,
                })
                .eq('id', update.id);

              if (!indError) {
                resolved++;
              } else {
                failed++;
              }
            } catch (err) {
              failed++;
            }
          }
        } else {
          resolved += updates.length;
        }
      }

      offset += BATCH_SIZE;
    }

    console.log('\n\n✨ Process Complete!\n');
    console.log(`📊 Final Results:`);
    console.log(`   ✅ Resolved: ${resolved}`);
    console.log(`   ❌ Failed: ${failed}`);
    if (resolved + failed > 0) {
      console.log(`   📈 Success Rate: ${((resolved / (resolved + failed)) * 100).toFixed(2)}%\n`);
    }

    if (failedCodes.size > 0 && failedCodes.size <= 50) {
      console.log(`⚠️  Failed SR Codes (${failedCodes.size} total):`);
      failedCodes.forEach((code) => {
        console.log(`   - ${code}`);
      });
      console.log();
    } else if (failedCodes.size > 50) {
      console.log(`⚠️  Failed SR Codes (${failedCodes.size} total - showing first 50):`);
      Array.from(failedCodes).slice(0, 50).forEach((code) => {
        console.log(`   - ${code}`);
      });
      console.log(`   ... and ${failedCodes.size - 50} more\n`);
    }

    console.log('🎉 Auto-resolve batch process completed!');
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  }
}

// Run the process
autoResolvePendencies();
