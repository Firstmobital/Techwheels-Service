// Background IDSPay RC fetch for insurance renewal campaigns (pg_cron + admin enqueue).
import { createClient } from "npm:@supabase/supabase-js@2";

type SupabaseClient = ReturnType<typeof createClient>;

/** Must match invoke_insurance_renewal_rc_fetch_worker() pg_net header (migration). */
export const RC_FETCH_PG_CRON_SECRET =
  "d4738d9a19012e96922a7e9d53959c0b8169ba573743e08f5609a9a601986511";

const STALE_INSURANCE_DAYS = 365;
const RC_FETCH_DEFAULT_LOOKUPS = 4;
const RC_FETCH_MAX_LOOKUPS = 6;
const RC_FETCH_DELAY_MS = 250;
const RC_FETCH_WALL_MS = 52000;

type RcJobStats = {
  ok: number;
  from_cache: number;
  failed: number;
  skipped_no_vrn: number;
  skipped_fresh: number;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function emptyJobStats(): RcJobStats {
  return { ok: 0, from_cache: 0, failed: 0, skipped_no_vrn: 0, skipped_fresh: 0 };
}

function parseJobStats(raw: unknown): RcJobStats {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    ok: Number(o.ok ?? 0),
    from_cache: Number(o.from_cache ?? 0),
    failed: Number(o.failed ?? 0),
    skipped_no_vrn: Number(o.skipped_no_vrn ?? 0),
    skipped_fresh: Number(o.skipped_fresh ?? 0),
  };
}

function mergeJobStats(base: RcJobStats, delta: Partial<RcJobStats>): RcJobStats {
  return {
    ok: base.ok + (delta.ok ?? 0),
    from_cache: base.from_cache + (delta.from_cache ?? 0),
    failed: base.failed + (delta.failed ?? 0),
    skipped_no_vrn: base.skipped_no_vrn + (delta.skipped_no_vrn ?? 0),
    skipped_fresh: base.skipped_fresh + (delta.skipped_fresh ?? 0),
  };
}

async function loadPendingCounts(serviceClient: SupabaseClient, campaignId: number) {
  const { data, error } = await serviceClient.rpc("insurance_renewal_rc_fetch_pending_counts", {
    p_campaign_id: campaignId,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return {
    pending_stale: Number(row?.pending_stale ?? 0),
    pending_with_vrn: Number(row?.pending_with_vrn ?? 0),
    pending_missing_vrn: Number(row?.pending_missing_vrn ?? 0),
  };
}

async function recordRcFetchAttempt(
  serviceClient: SupabaseClient,
  params: {
    campaign_id: number;
    customer_id: number;
    job_id: string | null;
    outcome: "success" | "failed" | "skipped_no_vrn" | "skipped_fresh";
    from_cache?: boolean;
    error_text?: string | null;
  },
) {
  const { error } = await serviceClient.from("insurance_renewal_rc_fetch_attempts").upsert(
    {
      campaign_id: params.campaign_id,
      customer_id: params.customer_id,
      job_id: params.job_id,
      outcome: params.outcome,
      from_cache: params.from_cache ?? false,
      error_text: params.error_text ?? null,
      attempted_at: new Date().toISOString(),
    },
    { onConflict: "campaign_id,customer_id" },
  );
  if (error) throw new Error(`Failed to record RC attempt: ${error.message}`);
}

const RC_FETCH_CUSTOMER_SELECT =
  "id, first_name, last_name, contact_phones, model, product_line, powertrain_type, chassis_no, vehicle_registration_number, vehicle_sale_date, vehicle_age_in_years, ex_showroom_price, idv, last_insurance_expiry_date, last_insurance_comapny, last_insurance_policy_number, sold_dealer, last_service_dealer";

function customerPayloadFromRow(v: Record<string, unknown>) {
  return {
    id: v.id,
    first_name: v.first_name,
    last_name: v.last_name,
    contact_phones: v.contact_phones,
    model: v.model,
    product_line: v.product_line,
    powertrain_type: v.powertrain_type,
    chassis_no: v.chassis_no,
    vehicle_registration_number: v.vehicle_registration_number,
    vehicle_sale_date: v.vehicle_sale_date,
    vehicle_age_in_years: v.vehicle_age_in_years,
    ex_showroom_price: v.ex_showroom_price,
    idv: v.idv,
    last_insurance_expiry_date: v.last_insurance_expiry_date,
    last_insurance_comapny: v.last_insurance_comapny,
    last_insurance_policy_number: v.last_insurance_policy_number,
    sold_dealer: v.sold_dealer,
    last_service_dealer: v.last_service_dealer,
  };
}

/** One lead: same IDSPay path as bulk RC fetch (invoke-rc-provider → rto_idspay → all_service_data trigger). */
export async function handleRcFetchSingleRecord(
  serviceClient: SupabaseClient,
  supabaseUrl: string,
  serviceRoleKey: string,
  body: Record<string, unknown>,
) {
  const campaignId = Number(body.campaign_id);
  const assignmentId = Number(body.assignment_id);
  if (!campaignId || !assignmentId) {
    return json({ success: false, error: "Missing campaign_id or assignment_id" }, 400);
  }

  const { data: asgn, error: aErr } = await serviceClient
    .from("insurance_renewal_assignments")
    .select("id, campaign_id, customer_id")
    .eq("id", assignmentId)
    .single();
  if (aErr || !asgn) return json({ success: false, error: "Assignment not found" }, 404);
  if (Number(asgn.campaign_id) !== campaignId) {
    return json({ success: false, error: "Campaign mismatch" }, 400);
  }

  const customerId = Number(asgn.customer_id);
  const { data: row, error: sErr } = await serviceClient
    .from("all_service_data")
    .select(RC_FETCH_CUSTOMER_SELECT)
    .eq("id", customerId)
    .single();
  if (sErr || !row) return json({ success: false, error: "Customer not found" }, 404);

  const cutoff = staleInsuranceCutoffDate();
  const vehicle = row as Record<string, unknown>;

  if (!isStaleOrMissingInsurance(vehicle.last_insurance_expiry_date as string | null, cutoff)) {
    await recordRcFetchAttempt(serviceClient, {
      campaign_id: campaignId,
      customer_id: customerId,
      job_id: null,
      outcome: "skipped_fresh",
    });
    return json({
      success: true,
      outcome: "skipped_fresh",
      message: "Insurance expiry is already recent (<365 days). Bulk RC fetch would skip this lead too.",
      customer: customerPayloadFromRow(vehicle),
    });
  }

  const reg = normalizeRegNumber(vehicle.vehicle_registration_number as string | null);
  if (!reg) {
    await recordRcFetchAttempt(serviceClient, {
      campaign_id: campaignId,
      customer_id: customerId,
      job_id: null,
      outcome: "skipped_no_vrn",
    });
    return json({
      success: false,
      outcome: "skipped_no_vrn",
      error: "No registration number on this record.",
      customer: customerPayloadFromRow(vehicle),
    });
  }

  const rc = await invokeRcProviderForReg(supabaseUrl, serviceRoleKey, reg);
  if (rc.ok) {
    await recordRcFetchAttempt(serviceClient, {
      campaign_id: campaignId,
      customer_id: customerId,
      job_id: null,
      outcome: "success",
      from_cache: rc.fromCache ?? false,
    });
    const { data: refreshed } = await serviceClient
      .from("all_service_data")
      .select(RC_FETCH_CUSTOMER_SELECT)
      .eq("id", customerId)
      .single();
    const updated = (refreshed ?? row) as Record<string, unknown>;
    return json({
      success: true,
      outcome: "success",
      from_cache: rc.fromCache ?? false,
      message: rc.fromCache
        ? "Insurance updated from RC cache (IDSPay)."
        : "Insurance fetched from IDSPay and synced to this customer.",
      customer: customerPayloadFromRow(updated),
    });
  }

  await recordRcFetchAttempt(serviceClient, {
    campaign_id: campaignId,
    customer_id: customerId,
    job_id: null,
    outcome: "failed",
    error_text: rc.error ?? "unknown",
  });
  return json({
    success: false,
    outcome: "failed",
    error: rc.error ?? "RC lookup failed",
    customer: customerPayloadFromRow(vehicle),
  });
}

async function isRcFetchJobCancelled(serviceClient: SupabaseClient, jobId: string): Promise<boolean> {
  const { data } = await serviceClient
    .from("insurance_renewal_rc_fetch_jobs")
    .select("status")
    .eq("id", jobId)
    .maybeSingle();
  return data?.status === "cancelled";
}

function normalizeRegNumber(value: string | null | undefined): string {
  if (!value) return "";
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function staleInsuranceCutoffDate(days = STALE_INSURANCE_DAYS): string {
  const d = new Date(Date.now() + 5.5 * 3600000 - days * 86400000);
  return d.toISOString().split("T")[0];
}

function isStaleOrMissingInsurance(expiry: string | null | undefined, cutoff: string): boolean {
  if (!expiry) return true;
  return expiry < cutoff;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function invokeRcProviderForReg(
  supabaseUrl: string,
  serviceRoleKey: string,
  regNo: string,
): Promise<{ ok: boolean; fromCache?: boolean; error?: string }> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/invoke-rc-provider`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
      body: JSON.stringify({ reg_no: regNo }),
      signal: AbortSignal.timeout(28000),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || payload.error) {
      return { ok: false, error: String(payload.error ?? payload.message ?? `HTTP ${res.status}`) };
    }
    if (payload.success === false) {
      return { ok: false, error: String(payload.error ?? "RC lookup failed") };
    }
    return { ok: true, fromCache: Boolean(payload.fromCache) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function processRcFetchJobSlice(
  serviceClient: SupabaseClient,
  supabaseUrl: string,
  serviceRoleKey: string,
  job: {
    id: string;
    campaign_id: number;
    last_customer_id: number;
    stats: RcJobStats;
  },
  maxLookups: number,
  wallStartedMs: number,
): Promise<{ jobFinished: boolean; lookupsDone: number }> {
  const cutoff = staleInsuranceCutoffDate();
  let stats = job.stats ?? emptyJobStats();
  let cursor = Number(job.last_customer_id) || 0;
  let lookupsDone = 0;

  if (await isRcFetchJobCancelled(serviceClient, job.id)) {
    return { jobFinished: true, lookupsDone: 0 };
  }

  while (lookupsDone < maxLookups) {
    if (performance.now() - wallStartedMs >= RC_FETCH_WALL_MS) break;
    if (await isRcFetchJobCancelled(serviceClient, job.id)) {
      return { jobFinished: true, lookupsDone };
    }

    const { data: candidates, error: candErr } = await serviceClient.rpc(
      "insurance_renewal_rc_fetch_next_candidates",
      {
        p_campaign_id: job.campaign_id,
        p_after_customer_id: cursor,
        p_limit: 25,
      },
    );
    if (candErr) throw new Error(candErr.message);

    const rows = (candidates || []) as {
      customer_id: number;
      vehicle_registration_number: string | null;
      last_insurance_expiry_date: string | null;
    }[];

    if (rows.length === 0) {
      await serviceClient.from("insurance_renewal_rc_fetch_jobs").update({
        status: "completed",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_customer_id: cursor,
        stats,
      }).eq("id", job.id);
      return { jobFinished: true, lookupsDone };
    }

    for (const row of rows) {
      if (performance.now() - wallStartedMs >= RC_FETCH_WALL_MS) break;
      cursor = row.customer_id;

      if (!isStaleOrMissingInsurance(row.last_insurance_expiry_date, cutoff)) {
        await recordRcFetchAttempt(serviceClient, {
          campaign_id: job.campaign_id,
          customer_id: row.customer_id,
          job_id: job.id,
          outcome: "skipped_fresh",
        });
        stats = mergeJobStats(stats, { skipped_fresh: 1 });
        continue;
      }

      const reg = normalizeRegNumber(row.vehicle_registration_number);
      if (!reg) {
        await recordRcFetchAttempt(serviceClient, {
          campaign_id: job.campaign_id,
          customer_id: row.customer_id,
          job_id: job.id,
          outcome: "skipped_no_vrn",
        });
        stats = mergeJobStats(stats, { skipped_no_vrn: 1 });
        continue;
      }

      if (await isRcFetchJobCancelled(serviceClient, job.id)) {
        return { jobFinished: true, lookupsDone };
      }

      const rc = await invokeRcProviderForReg(supabaseUrl, serviceRoleKey, reg);
      lookupsDone++;
      if (rc.ok) {
        await recordRcFetchAttempt(serviceClient, {
          campaign_id: job.campaign_id,
          customer_id: row.customer_id,
          job_id: job.id,
          outcome: "success",
          from_cache: rc.fromCache ?? false,
        });
        stats = mergeJobStats(stats, {
          ok: 1,
          from_cache: rc.fromCache ? 1 : 0,
        });
      } else {
        await recordRcFetchAttempt(serviceClient, {
          campaign_id: job.campaign_id,
          customer_id: row.customer_id,
          job_id: job.id,
          outcome: "failed",
          error_text: rc.error ?? "unknown",
        });
        stats = mergeJobStats(stats, { failed: 1 });
      }

      await serviceClient.from("insurance_renewal_rc_fetch_jobs").update({
        last_customer_id: cursor,
        stats,
        updated_at: new Date().toISOString(),
      }).eq("id", job.id);

      if (lookupsDone < maxLookups) await sleep(RC_FETCH_DELAY_MS);
      if (lookupsDone >= maxLookups) break;
    }

    if (lookupsDone >= maxLookups) break;

    const { data: more } = await serviceClient.rpc("insurance_renewal_rc_fetch_next_candidates", {
      p_campaign_id: job.campaign_id,
      p_after_customer_id: cursor,
      p_limit: 1,
    });
    if (!more || (more as unknown[]).length === 0) {
      await serviceClient.from("insurance_renewal_rc_fetch_jobs").update({
        status: "completed",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_customer_id: cursor,
        stats,
      }).eq("id", job.id);
      return { jobFinished: true, lookupsDone };
    }
  }

  await serviceClient.from("insurance_renewal_rc_fetch_jobs").update({
    last_customer_id: cursor,
    stats,
    updated_at: new Date().toISOString(),
  }).eq("id", job.id);

  return { jobFinished: false, lookupsDone };
}

export async function handleProcessRcFetchJobs(
  serviceClient: SupabaseClient,
  supabaseUrl: string,
  serviceRoleKey: string,
  body: Record<string, unknown>,
) {
  const wallStarted = performance.now();
  const maxLookupsPerJob = Math.min(
    RC_FETCH_MAX_LOOKUPS,
    Number(body.max_lookups) || RC_FETCH_DEFAULT_LOOKUPS,
  );
  const processedJobs: Record<string, unknown>[] = [];

  while (performance.now() - wallStarted < RC_FETCH_WALL_MS) {
    const { data: jobRow, error: jobPickErr } = await serviceClient
      .from("insurance_renewal_rc_fetch_jobs")
      .select("*")
      .in("status", ["queued", "running"])
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (jobPickErr) throw new Error(jobPickErr.message);
    if (!jobRow) break;

    if (await isRcFetchJobCancelled(serviceClient, jobRow.id)) {
      processedJobs.push({ job_id: jobRow.id, skipped: "cancelled" });
      continue;
    }

    if (jobRow.status === "queued") {
      await serviceClient.from("insurance_renewal_rc_fetch_jobs").update({
        status: "running",
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", jobRow.id);
    }

    try {
      const slice = await processRcFetchJobSlice(
        serviceClient,
        supabaseUrl,
        serviceRoleKey,
        {
          id: jobRow.id,
          campaign_id: jobRow.campaign_id,
          last_customer_id: jobRow.last_customer_id ?? 0,
          stats: parseJobStats(jobRow.stats),
        },
        maxLookupsPerJob,
        wallStarted,
      );
      processedJobs.push({
        job_id: jobRow.id,
        campaign_id: jobRow.campaign_id,
        finished: slice.jobFinished,
        lookups_done: slice.lookupsDone,
      });
      if (!slice.jobFinished) break;
    } catch (jobErr) {
      const msg = jobErr instanceof Error ? jobErr.message : String(jobErr);
      await serviceClient.from("insurance_renewal_rc_fetch_jobs").update({
        status: "failed",
        last_error: msg,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", jobRow.id);
      processedJobs.push({ job_id: jobRow.id, error: msg });
      break;
    }
  }

  return json({ success: true, processed_jobs: processedJobs });
}

export async function handleRcFetchEnqueue(
  serviceClient: SupabaseClient,
  supabaseUrl: string,
  userEmail: string,
  body: Record<string, unknown>,
) {
  const campaign_id = body.campaign_id;
  if (!campaign_id) return json({ success: false, error: "Missing campaign_id" }, 400);

  const pending = await loadPendingCounts(serviceClient, Number(campaign_id));
  if (pending.pending_with_vrn <= 0) {
    return json({
      success: true,
      message: "No new stale leads with registration numbers to fetch.",
      job: null,
      ...pending,
    });
  }

  const { data: activeJob } = await serviceClient
    .from("insurance_renewal_rc_fetch_jobs")
    .select("id, status")
    .eq("campaign_id", campaign_id)
    .in("status", ["queued", "running"])
    .limit(1)
    .maybeSingle();

  if (activeJob) {
    return json({
      success: true,
      message: "RC fetch job already queued or running.",
      job: activeJob,
      ...pending,
    });
  }

  const { data: job, error: jobErr } = await serviceClient
    .from("insurance_renewal_rc_fetch_jobs")
    .insert({
      campaign_id,
      status: "queued",
      created_by: userEmail,
      stats: emptyJobStats(),
    })
    .select("id, status, created_at")
    .single();
  if (jobErr) return json({ success: false, error: `Failed to enqueue RC job: ${jobErr.message}` }, 400);

  fetch(`${supabaseUrl}/functions/v1/insurance-renewal-telecalling`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-cron-secret": RC_FETCH_PG_CRON_SECRET,
    },
    body: JSON.stringify({ action: "process_rc_fetch_jobs", max_lookups: RC_FETCH_DEFAULT_LOOKUPS }),
  }).catch((e) => console.error("RC fetch worker kickoff failed", e));

  return json({
    success: true,
    message: `Queued background RC fetch for ${pending.pending_with_vrn} new lead(s). Processing started in the background.`,
    job,
    ...pending,
  });
}

export async function handleRcFetchCancel(
  serviceClient: SupabaseClient,
  body: Record<string, unknown>,
) {
  const { campaign_id, job_id } = body;
  if (!campaign_id && !job_id) return json({ success: false, error: "Missing campaign_id or job_id" }, 400);

  let q = serviceClient
    .from("insurance_renewal_rc_fetch_jobs")
    .update({
      status: "cancelled",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_error: "Cancelled by admin",
    })
    .in("status", ["queued", "running"]);

  if (job_id) q = q.eq("id", job_id);
  if (campaign_id) q = q.eq("campaign_id", campaign_id);

  const { data: cancelled, error: cancelErr } = await q.select("id, campaign_id, status");
  if (cancelErr) return json({ success: false, error: `Failed to cancel: ${cancelErr.message}` }, 400);

  return json({
    success: true,
    message: cancelled?.length
      ? `Stopped ${cancelled.length} RC fetch job(s). No further paid API calls for those jobs.`
      : "No queued or running RC fetch job to stop.",
    cancelled: cancelled ?? [],
  });
}
