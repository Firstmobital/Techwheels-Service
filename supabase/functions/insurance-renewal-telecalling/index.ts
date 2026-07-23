// ============================================================================
// Insurance Renewal Telecalling — Enhanced Edge Function
// Supabase Edge Function (Deno)
// URL: /functions/v1/insurance-renewal-telecalling
// 
// ENHANCEMENTS:
// 1. Dealer filter (sold_dealer, last_service_dealer) in campaign creation
// 2. Auto 30-day daily refresh (cron_daily_refresh action)
// 3. Multi-attempt WhatsApp drip (3 steps) via Meta Cloud API
// 4. Priority scoring (urgency, idv_value, loyalty, mixed)
// 5. Telecaller gamification leaderboard
// 6. Post-expiry emergency lead alerts
// 7. Campaign ROI dashboard
// 8. Conquest campaign support (sold by others filter)
// 9. Customer self-renewal payment link
// 10. Meta WhatsApp integration (copies settings from wa_agent_config)
// ============================================================================

// @ts-nocheck — Supabase dynamic query types are inferred at runtime
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  handleProcessRcFetchJobs,
  handleRcFetchCancel,
  handleRcFetchEnqueue,
  handleRcFetchSingleRecord,
  handleAssignmentCustomerRefresh,
  RC_FETCH_PG_CRON_SECRET,
} from "./rc_fetch_worker.ts";
import { corsHeaders } from "../_shared/cors.ts";
type SupabaseClient = ReturnType<typeof createClient>;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const CRON_SECRET = "techwheels_cron_2026";

// ─── Helpers ───────────────────────────────────────────────────────────────

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 400) {
  return json({ success: false, error: message }, status);
}

// Insurance date estimation (mirrors frontend h9 function)
function estimateInsuranceDate(expiryDate: string | null, saleDate: string | null) {
  if (expiryDate) return { date: expiryDate, estimated: false };
  if (!saleDate) return { date: null, estimated: false };
  const n = new Date(saleDate + "T00:00:00Z");
  if (isNaN(n.getTime())) return { date: null, estimated: false };
  let r = new Date(Date.UTC(n.getUTCFullYear() + 1, n.getUTCMonth(), n.getUTCDate() - 1));
  const today = new Date(new Date().toISOString().split("T")[0] + "T00:00:00Z");
  while (r < today) {
    r = new Date(Date.UTC(r.getUTCFullYear() + 1, r.getUTCMonth(), r.getUTCDate()));
  }
  return { date: r.toISOString().split("T")[0], estimated: true };
}

/** Deduplicate vehicle rows by chassis_no (first row wins). */
function dedupeVehiclesByChassis(vehicles: Record<string, unknown>[]) {
  const seenChassis = new Set<string>();
  return vehicles.filter((v) => {
    const chassis = v.chassis_no as string;
    if (!chassis) return true;
    if (seenChassis.has(chassis)) return false;
    seenChassis.add(chassis);
    return true;
  });
}

/**
 * Eligible leads for create/refresh/preview: window on insurance_renewal_leads.effective_due_date
 * (stored expiry OR sale-date anniversary), then optional dealer filters on all_service_data.
 */
async function fetchEligibleVehiclesInWindow(
  supabase: SupabaseClient,
  params: {
    today: string;
    futureDate: string;
    soldDealerFilter?: string[] | null;
    lastServiceDealerFilter?: string[] | null;
  }
): Promise<{ vehicles: Record<string, unknown>[]; error?: string }> {
  const PAGE = 1000;
  const leadIds: number[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("insurance_renewal_leads")
      .select("id")
      .not("contact_phones", "is", null)
      .neq("contact_phones", "")
      .not("effective_due_date", "is", null)
      .gte("effective_due_date", params.today)
      .lte("effective_due_date", params.futureDate)
      .range(offset, offset + PAGE - 1);
    if (error) return { vehicles: [], error: error.message };
    if (!data?.length) break;
    for (const row of data) leadIds.push(row.id as number);
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  if (leadIds.length === 0) return { vehicles: [] };

  const vehicles: Record<string, unknown>[] = [];
  const CHUNK = 400;
  for (let i = 0; i < leadIds.length; i += CHUNK) {
    const chunk = leadIds.slice(i, i + CHUNK);
    let q = supabase.from("all_service_data").select("*").in("id", chunk);
    if (params.soldDealerFilter && params.soldDealerFilter.length > 0) {
      q = q.in("sold_dealer", params.soldDealerFilter);
    }
    if (params.lastServiceDealerFilter && params.lastServiceDealerFilter.length > 0) {
      q = q.in("last_service_dealer", params.lastServiceDealerFilter);
    }
    const { data, error } = await q;
    if (error) return { vehicles: [], error: error.message };
    if (data) vehicles.push(...data);
  }

  return { vehicles: dedupeVehiclesByChassis(vehicles) };
}

/** Statuses that mean the lead is still in a campaign queue (not terminal / not retired). */
const LIVE_ASSIGNMENT_STATUSES = [
  "pending",
  "in_progress",
  "callback_later",
  "no_answer",
  "assigned",
];

/**
 * Among all live rows in active campaigns, each customer_id maps to the owning
 * campaign_id (lowest campaign id wins — first-created campaign keeps the lead).
 */
async function fetchLiveCustomerOwnerCampaignMap(
  supabase: SupabaseClient,
): Promise<Map<number, number>> {
  const { data: activeCampaigns, error: cErr } = await supabase
    .from("insurance_renewal_campaigns")
    .select("id")
    .eq("status", "active");
  if (cErr || !activeCampaigns?.length) return new Map();

  const campaignIds = activeCampaigns.map((c) => c.id as number);
  const owner = new Map<number, number>();
  const PAGE = 1000;

  for (let i = 0; i < campaignIds.length; i += 40) {
    const idChunk = campaignIds.slice(i, i + 40);
    let offset = 0;
    while (true) {
      const { data, error } = await supabase
        .from("insurance_renewal_assignments")
        .select("customer_id, campaign_id")
        .in("campaign_id", idChunk)
        .in("status", LIVE_ASSIGNMENT_STATUSES)
        .range(offset, offset + PAGE - 1);
      if (error || !data?.length) break;
      for (const row of data) {
        const customerId = row.customer_id as number;
        const campaignId = row.campaign_id as number;
        const prev = owner.get(customerId);
        if (prev === undefined || campaignId < prev) owner.set(customerId, campaignId);
      }
      if (data.length < PAGE) break;
      offset += PAGE;
    }
  }
  return owner;
}

function vehiclesAvailableForNewCampaign(
  vehicles: Record<string, unknown>[],
  ownerMap: Map<number, number>,
) {
  const eligible = vehicles.filter((v) => !ownerMap.has(v.id as number));
  return {
    eligible,
    excluded_cross_campaign: vehicles.length - eligible.length,
  };
}

function vehiclesAvailableToAddToCampaign(
  vehicles: Record<string, unknown>[],
  campaignId: number,
  ownerMap: Map<number, number>,
) {
  const eligible = vehicles.filter((v) => {
    const owner = ownerMap.get(v.id as number);
    return owner === undefined || owner === campaignId;
  });
  return {
    eligible,
    excluded_cross_campaign: vehicles.length - eligible.length,
  };
}

/** Retire live rows in this campaign when another active campaign owns the customer. */
async function retireCrossCampaignDuplicatesInCampaign(
  supabase: SupabaseClient,
  campaignId: number,
  ownerMap: Map<number, number>,
): Promise<number> {
  const { data: liveRows, error } = await supabase
    .from("insurance_renewal_assignments")
    .select("id, customer_id")
    .eq("campaign_id", campaignId)
    .in("status", LIVE_ASSIGNMENT_STATUSES);
  if (error || !liveRows?.length) return 0;

  const retireIds = liveRows
    .filter((r) => {
      const owner = ownerMap.get(r.customer_id as number);
      return owner !== undefined && owner !== campaignId;
    })
    .map((r) => r.id as number);

  if (retireIds.length === 0) return 0;
  await updateAssignmentsInChunks(supabase, retireIds, {
    status: "out_of_window",
    assigned_to: null,
    assigned_to_name: null,
  });
  return retireIds.length;
}

async function updateAssignmentsInChunks(
  supabase: SupabaseClient,
  ids: number[],
  update: Record<string, unknown>
) {
  const CHUNK = 200;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const { error } = await supabase
      .from("insurance_renewal_assignments")
      .update(update)
      .in("id", slice);
    if (error) throw error;
  }
}

// ─── Meta WhatsApp Cloud API ───────────────────────────────────────────────

async function sendMetaTemplateMessage(
  phone: string,
  templateName: string,
  templateLang: string,
  variables: string[],
  phoneNumberId: string,
  accessToken: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const url = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone.replace(/\D/g, "").slice(-10) ? "91" + phone.replace(/\D/g, "").slice(-10) : phone,
        type: "template",
        template: {
          name: templateName,
          language: { code: templateLang || "en_US" },
          components: [
            {
              type: "body",
              parameters: variables.map((v) => ({ type: "text", text: v })),
            },
          ],
        },
      }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      return { success: false, error: data.error?.message || JSON.stringify(data) };
    }
    return { success: true, messageId: data.messages?.[0]?.id };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// Get Meta config from wa_agent_config (row id=1)
async function getMetaConfig(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("wa_agent_config")
    .select("meta_phone_number_id, meta_access_token")
    .eq("id", 1)
    .single();
  if (error || !data?.meta_phone_number_id || !data?.meta_access_token) {
    return null;
  }
  return data;
}

// ─── Priority Scoring ──────────────────────────────────────────────────────

function calculatePriorityScore(
  vehicle: Record<string, unknown>,
  insuranceDate: string | null,
  mode: string
): number {
  if (!insuranceDate) return 0;
  const daysToExpiry = Math.ceil(
    (new Date(insuranceDate).getTime() - Date.now()) / 86400000
  );
  const idv = Number(vehicle.idv) || 0;
  const soldDealer = String(vehicle.sold_dealer || "").toLowerCase();
  const lastSvcDealer = String(vehicle.last_service_dealer || "").toLowerCase();
  const isLoyal = soldDealer.includes("techwheels") || lastSvcDealer.includes("techwheels");

  switch (mode) {
    case "idv_value":
      return idv;
    case "loyalty":
      return (isLoyal ? 100000 : 0) + Math.max(0, 365 - daysToExpiry);
    case "mixed":
      // Weighted: 50% urgency (closer expiry = higher) + 30% IDV + 20% loyalty
      const urgencyScore = Math.max(0, 365 - daysToExpiry) * 100;
      const idvScore = idv / 10;
      const loyaltyScore = isLoyal ? 2000 : 0;
      return Math.round(urgencyScore * 0.5 + idvScore * 0.3 + loyaltyScore * 0.2);
    case "urgency":
    default:
      return Math.max(0, 365 - daysToExpiry);
  }
}

// ─── Main Handler ──────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse("Only POST allowed", 405);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }

  const action = body.action as string;
  if (!action) return errorResponse("Missing 'action' parameter");

  // ── Cron endpoint (no auth needed, uses secret) ──
  if (action === "cron_daily_refresh") {
    if (body.cron_secret !== CRON_SECRET) {
      return errorResponse("Invalid cron secret", 401);
    }
    try {
      return await handleCronDailyRefresh();
    } catch (e) {
      console.error("Cron error:", e);
      return json({ success: false, error: String(e), stack: (e as Error)?.stack });
    }
  }

  // RC fetch worker (pg_cron + enqueue kickoff) — x-cron-secret from DB migration
  if (action === "process_rc_fetch_jobs") {
    const headerSecret = req.headers.get("x-cron-secret") || "";
    if (headerSecret !== RC_FETCH_PG_CRON_SECRET) {
      return errorResponse("Invalid RC fetch cron secret", 401);
    }
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!serviceKey) return errorResponse("Missing SUPABASE_SERVICE_ROLE_KEY", 500);
    const svcSupabase = createClient(SUPABASE_URL, serviceKey);
    try {
      return await handleProcessRcFetchJobs(svcSupabase, SUPABASE_URL, serviceKey, body);
    } catch (e) {
      console.error("process_rc_fetch_jobs error:", e);
      return json({ success: false, error: String(e) }, 500);
    }
  }

  // ── Public endpoints (no auth needed) ──
  if (action === "get_dealers") {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const svcSupabase = createClient(SUPABASE_URL, serviceKey);
    return handleGetDealers(svcSupabase);
  }

  // ── Authenticated endpoints ──
  // Validate JWT then use service role for DB writes (same as service telecalling).
  // RLS on insurance_renewal_* only grants SELECT to non-admins; user-scoped clients
  // silently skip UPDATE/INSERT and the UI still shows success from in-memory payloads.
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return errorResponse("Missing Authorization header", 401);

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!serviceKey) return errorResponse("Missing SUPABASE_SERVICE_ROLE_KEY", 500);

  const supabase = createClient(SUPABASE_URL, serviceKey);

  const { data: userData, error: authErr } = await supabase.auth.getUser(token);
  const userId = userData.user?.id;
  if (authErr || !userId) return errorResponse("Not authenticated", 401);

  const { data: userRow } = await supabase
    .from("users")
    .select("role, full_name")
    .eq("id", userId)
    .single();
  const role = userRow?.role || "telecaller";
  const userName = userRow?.full_name || "Unknown";

  try {
    switch (action) {
      // ── EXISTING ACTIONS (enhanced) ──
      case "get_next":
        return handleGetNext(supabase, userId, userName, body);
      case "update_status":
        return handleUpdateStatus(supabase, userId, userName, body);
      case "my_queue":
        return handleMyQueue(supabase, userId, userData.user?.email || "", body);
      case "my_summary":
        return handleMySummary(supabase, userId);
      case "edit_assignment":
        return handleEditAssignment(supabase, userId, body);
      case "log_whatsapp":
        return handleLogWhatsApp(supabase, userId, body);
      case "admin_stats":
        return handleAdminStats(supabase, role, body);
      case "renewed_list":
        return handleRenewedList(supabase, body);
      case "refresh_campaign":
        return handleRefreshCampaign(supabase, body);
      case "preview_campaign":
        return handlePreviewCampaign(supabase, body);
      case "create_campaign":
        return handleCreateCampaign(supabase, body);
      case "close_campaign":
        return handleCloseCampaign(supabase, body);
      case "update_campaign":
        return handleUpdateCampaign(supabase, body);
      case "delete_campaign":
        return handleDeleteCampaign(supabase, body);

      // ── NEW ACTIONS ──
      case "get_dealers":
        return handleGetDealers(supabase);
      case "leaderboard":
        return handleLeaderboard(supabase, body);
      case "roi_dashboard":
        return handleRoiDashboard(supabase, body);
      case "expired_leads":
        return handleExpiredLeads(supabase, body);
      case "send_drip_message":
        return handleSendDripMessage(supabase, body);
      case "generate_self_renewal_link":
        return handleGenerateSelfRenewalLink(supabase, body);
      case "update_campaign_meta":
        return handleUpdateCampaignMeta(supabase, body);
      case "conquest_preview":
        return handleConquestPreview(supabase, body);
      case "conquest_create":
        return handleConquestCreate(supabase, body);

      case "rc_fetch_enqueue": {
        if (role !== "admin") return errorResponse("Admin only", 403);
        const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
        if (!svcKey) return errorResponse("Missing SUPABASE_SERVICE_ROLE_KEY", 500);
        const svc = createClient(SUPABASE_URL, svcKey);
        const email = userData.user?.email || "";
        return handleRcFetchEnqueue(svc, SUPABASE_URL, email, body);
      }
      case "rc_fetch_cancel": {
        if (role !== "admin") return errorResponse("Admin only", 403);
        const svcKey2 = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
        if (!svcKey2) return errorResponse("Missing SUPABASE_SERVICE_ROLE_KEY", 500);
        const svc2 = createClient(SUPABASE_URL, svcKey2);
        return handleRcFetchCancel(svc2, body);
      }
      case "rc_fetch_single":
        return handleRcFetchSingleRecord(supabase, SUPABASE_URL, serviceKey, body);
      case "assignment_customer":
        return handleAssignmentCustomerRefresh(supabase, body);

      default:
        return errorResponse(`Unknown action: ${action}`);
    }
  } catch (e) {
    console.error(`Action ${action} error:`, e);
    return errorResponse(e.message || "Internal error", 500);
  }
});

// ============================================================================
// EXISTING ACTIONS (ENHANCED)
// ============================================================================

// ─── get_next: Assign next pending lead to telecaller ──────────────────────
async function handleGetNext(supabase: SupabaseClient, userId: string, userName: string, body: Record<string, unknown>) {
  const campaignId = Number(body.campaign_id);
  if (!campaignId) return errorResponse("Missing campaign_id");

  // Get campaign to check priority mode
  const { data: campaign } = await supabase
    .from("insurance_renewal_campaigns")
    .select("priority_mode")
    .eq("id", campaignId)
    .single();

  const priorityMode = campaign?.priority_mode || "urgency";

  // Find pending assignments, ordered by priority
  const { data: pending, error } = await supabase
    .from("insurance_renewal_assignments")
    .select(`
      *,
      all_service_data!inner(*)
    `)
    .eq("campaign_id", campaignId)
    .eq("status", "pending")
    .limit(50);

  if (error) return errorResponse(error.message);
  if (!pending || pending.length === 0) {
    return json({ success: true, assignment: null });
  }

  const ownerMap = await fetchLiveCustomerOwnerCampaignMap(supabase);
  const pendingOwned = pending.filter((a: Record<string, unknown>) => {
    const owner = ownerMap.get(a.customer_id as number);
    return owner === undefined || owner === campaignId;
  });
  if (pendingOwned.length === 0) {
    return json({ success: true, assignment: null });
  }

  // Calculate priority scores and sort
  const scored = pendingOwned.map((a: Record<string, unknown>) => {
    const vehicle = a.all_service_data as unknown as Record<string, unknown>;
    const insDate = estimateInsuranceDate(
      vehicle.last_insurance_expiry_date as string,
      vehicle.vehicle_sale_date as string
    );
    return {
      ...a,
      _priorityScore: calculatePriorityScore(vehicle, insDate.date, priorityMode),
    };
  });
  scored.sort((a, b) => (b._priorityScore as number) - (a._priorityScore as number));

  const next = scored[0];
  const { error: updateError } = await supabase
    .from("insurance_renewal_assignments")
    .update({
      status: "in_progress",
      assigned_to: userId,
      assigned_to_name: userName,
      assigned_at: new Date().toISOString(),
    })
    .eq("id", next.id);

  if (updateError) return errorResponse(updateError.message);

  await updateCampaignCounts(supabase, campaignId);

  // Format assignment for frontend
  const vehicle = next.all_service_data as unknown as Record<string, unknown>;
  const insDate = estimateInsuranceDate(
    vehicle.last_insurance_expiry_date as string,
    vehicle.vehicle_sale_date as string
  );

  const assignment = {
    id: next.id,
    campaign_id: next.campaign_id,
    status: "in_progress",
    call_count: next.call_count || 0,
    no_answer_count: next.no_answer_count || 0,
    retry_after: next.retry_after,
    call_notes: next.call_notes,
    callback_date: next.callback_date,
    quoted_premium: next.quoted_premium,
    renewal_company: next.renewal_company,
    whatsapp_sent: next.whatsapp_sent,
    whatsapp_status: next.whatsapp_status,
    customer: {
      first_name: vehicle.first_name,
      last_name: vehicle.last_name,
      contact_phones: vehicle.contact_phones,
      model: vehicle.model,
      powertrain_type: vehicle.powertrain_type,
      product_line: vehicle.product_line,
      chassis_no: vehicle.chassis_no,
      vehicle_registration_number: vehicle.vehicle_registration_number,
      last_insurance_expiry_date: vehicle.last_insurance_expiry_date,
      vehicle_sale_date: vehicle.vehicle_sale_date,
      last_insurance_comapny: vehicle.last_insurance_comapny,
      last_insurance_policy_number: vehicle.last_insurance_policy_number,
      idv: vehicle.idv,
      ex_showroom_price: vehicle.ex_showroom_price,
      vehicle_age_in_years: vehicle.vehicle_age_in_years,
      sold_dealer: vehicle.sold_dealer,
      last_service_dealer: vehicle.last_service_dealer,
    },
    priority_score: next._priorityScore,
  };

  return json({ success: true, assignment });
}

// ─── update_status: Update call outcome + trigger drip ─────────────────────
async function handleUpdateStatus(supabase: SupabaseClient, userId: string, userName: string, body: Record<string, unknown>) {
  const assignmentId = Number(body.assignment_id);
  const campaignId = Number(body.campaign_id);
  const status = body.status as string;
  if (!assignmentId || !campaignId || !status) return errorResponse("Missing required fields");

  const updateData: Record<string, unknown> = {
    status,
    call_notes: body.call_notes || null,
    callback_date: body.callback_date || null,
    quoted_premium: body.quoted_premium || null,
    renewal_company: body.renewal_company || null,
    updated_at: new Date().toISOString(),
  };

  // No Answer and Not Reachable share the same 3-strike retry ladder (terminal: not_reachable)
  if (status === "no_answer" || status === "not_reachable") {
    const { data: current } = await supabase
      .from("insurance_renewal_assignments")
      .select("no_answer_count, call_count")
      .eq("id", assignmentId)
      .single();

    const noAnswerCount = (current?.no_answer_count || 0) + 1;
    const callCount = (current?.call_count || 0) + 1;

    if (noAnswerCount >= 3) {
      // Mark as not_reachable after 3 no-answers (only path to not_reachable for telecallers)
      updateData.status = "not_reachable";
      updateData.no_answer_count = noAnswerCount;
      updateData.call_count = callCount;
      updateData.retry_after = null;
    } else {
      // Re-queue for tomorrow
      updateData.no_answer_count = noAnswerCount;
      updateData.call_count = callCount;
      updateData.status = "pending";
      updateData.retry_after = new Date(Date.now() + 86400000).toISOString().split("T")[0];
      updateData.assigned_to = null;
      updateData.assigned_to_name = null;

      // ── ENHANCEMENT: Trigger WhatsApp drip on no-answer ──
      await triggerWhatsAppDrip(supabase, assignmentId, campaignId, noAnswerCount);
    }

    const { error: noAnswerUpdateError } = await supabase
      .from("insurance_renewal_assignments")
      .update(updateData)
      .eq("id", assignmentId);

    if (noAnswerUpdateError) return errorResponse(noAnswerUpdateError.message);

    await updateCampaignCounts(supabase, campaignId);

    return json({
      success: true,
      retry_queued: noAnswerCount < 3,
      no_answer_count: noAnswerCount,
    });
  }

  // Increment call count for other statuses
  const { data: current } = await supabase
    .from("insurance_renewal_assignments")
    .select("call_count")
    .eq("id", assignmentId)
    .single();
  updateData.call_count = (current?.call_count || 0) + 1;

  const { error } = await supabase
    .from("insurance_renewal_assignments")
    .update(updateData)
    .eq("id", assignmentId);

  if (error) return errorResponse(error.message);

  // ── ENHANCEMENT: If renewed via us, update leaderboard premium ──
  if (status === "renewed_via_us" && body.quoted_premium) {
    await updateLeaderboard(supabase, campaignId, userId, userName, {
      renewed_via_us: 1,
      premium_collected: Number(body.quoted_premium),
    });
  } else {
    const leaderboardUpdate: Record<string, number> = {};
    if (status === "renewed_elsewhere") leaderboardUpdate.renewed_elsewhere = 1;
    if (status === "callback_later") leaderboardUpdate.callback_later = 1;
    if (status === "not_interested") leaderboardUpdate.not_interested = 1;
    if (Object.keys(leaderboardUpdate).length > 0) {
      await updateLeaderboard(supabase, campaignId, userId, userName, leaderboardUpdate);
    }
  }

  await updateCampaignCounts(supabase, campaignId);

  return json({ success: true });
}

// ─── my_queue: Get telecaller's assigned leads ─────────────────────────────
async function handleMyQueue(
  supabase: SupabaseClient,
  userId: string,
  userEmail: string,
  body: Record<string, unknown>,
) {
  const campaignId = body.campaign_id != null ? Number(body.campaign_id) : null;
  const allCampaigns = body.all_campaigns === true || !campaignId;

  const assigneeIds = [userId, userEmail].filter(Boolean);

  let query = supabase
    .from("insurance_renewal_assignments")
    .select(`
      *,
      all_service_data!inner(*),
      insurance_renewal_campaigns!inner(campaign_name, status)
    `)
    .in("assigned_to", assigneeIds)
    .in("status", ["in_progress", "callback_later", "no_answer"]);

  if (!allCampaigns && campaignId) {
    query = query.eq("campaign_id", campaignId);
  }

  const { data, error } = await query;
  if (error) return errorResponse(error.message);

  const queue = (data || []).map((a: Record<string, unknown>) => {
    const vehicle = a.all_service_data as unknown as Record<string, unknown>;
    const camp = a.insurance_renewal_campaigns as Record<string, unknown> | null;
    const insDate = estimateInsuranceDate(
      vehicle.last_insurance_expiry_date as string,
      vehicle.vehicle_sale_date as string
    );
    return {
      id: a.id,
      campaign_id: a.campaign_id,
      campaign_name: camp?.campaign_name as string | undefined,
      campaign_status: camp?.status as string | undefined,
      status: a.status,
      call_count: a.call_count || 0,
      no_answer_count: a.no_answer_count || 0,
      retry_after: a.retry_after,
      call_notes: a.call_notes,
      callback_date: a.callback_date,
      quoted_premium: a.quoted_premium,
      renewal_company: a.renewal_company,
      whatsapp_sent: a.whatsapp_sent,
      whatsapp_status: a.whatsapp_status,
      customer: {
        first_name: vehicle.first_name,
        last_name: vehicle.last_name,
        contact_phones: vehicle.contact_phones,
        model: vehicle.model,
        powertrain_type: vehicle.powertrain_type,
        product_line: vehicle.product_line,
        chassis_no: vehicle.chassis_no,
        vehicle_registration_number: vehicle.vehicle_registration_number,
        last_insurance_expiry_date: vehicle.last_insurance_expiry_date,
        vehicle_sale_date: vehicle.vehicle_sale_date,
        last_insurance_comapny: vehicle.last_insurance_comapny,
        last_insurance_policy_number: vehicle.last_insurance_policy_number,
        idv: vehicle.idv,
        ex_showroom_price: vehicle.ex_showroom_price,
        vehicle_age_in_years: vehicle.vehicle_age_in_years,
        sold_dealer: vehicle.sold_dealer,
        last_service_dealer: vehicle.last_service_dealer,
      },
    };
  });

  return json({ success: true, queue });
}

// ─── my_summary: Get telecaller's daily summary ─────────────────────────────
async function handleMySummary(supabase: SupabaseClient, userId: string) {
  const today = new Date().toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("insurance_renewal_assignments")
    .select("status, quoted_premium")
    .eq("assigned_to", userId)
    .gte("updated_at", today + "T00:00:00Z");

  if (error) return errorResponse(error.message);

  const summary = {
    total_calls: data?.length || 0,
    renewed_via_us: data?.filter((d: Record<string, unknown>) => d.status === "renewed_via_us").length || 0,
    renewed_elsewhere: data?.filter((d: Record<string, unknown>) => d.status === "renewed_elsewhere").length || 0,
    callback_later: data?.filter((d: Record<string, unknown>) => d.status === "callback_later").length || 0,
    no_answer: data?.filter((d: Record<string, unknown>) => d.status === "no_answer" || d.status === "not_reachable").length || 0,
    not_interested: data?.filter((d: Record<string, unknown>) => d.status === "not_interested").length || 0,
    premium_collected: data
      ?.filter((d: Record<string, unknown>) => d.status === "renewed_via_us")
      .reduce((sum: number, d: Record<string, unknown>) => sum + Number(d.quoted_premium || 0), 0) || 0,
  };

  return json({ success: true, summary });
}

// ─── edit_assignment: Edit a previous assignment ──────────────────────────
async function handleEditAssignment(supabase: SupabaseClient, userId: string, body: Record<string, unknown>) {
  const assignmentId = Number(body.assignment_id);
  if (!assignmentId) return errorResponse("Missing assignment_id");

  if (body.status === "not_reachable" || body.status === "no_answer") {
    return errorResponse(
      "Use the call card No Answer / Not Reachable buttons — status uses the 3-attempt retry ladder"
    );
  }

  const updateData: Record<string, unknown> = {};
  if (body.call_notes !== undefined) updateData.call_notes = body.call_notes;
  if (body.callback_date !== undefined) updateData.callback_date = body.callback_date || null;
  if (body.status !== undefined) updateData.status = body.status;
  updateData.updated_at = new Date().toISOString();

  const { data: updated, error } = await supabase
    .from("insurance_renewal_assignments")
    .update(updateData)
    .eq("id", assignmentId)
    .select("campaign_id")
    .single();

  if (error) return errorResponse(error.message);
  if (body.status !== undefined && updated?.campaign_id) {
    await updateCampaignCounts(supabase, Number(updated.campaign_id));
  }
  return json({ success: true });
}

// ─── log_whatsapp: Log WhatsApp message sent ──────────────────────────────
async function handleLogWhatsApp(supabase: SupabaseClient, userId: string, body: Record<string, unknown>) {
  const assignmentId = Number(body.assignment_id);
  const waType = body.wa_type as string;
  if (!assignmentId) return errorResponse("Missing assignment_id");

  const { error } = await supabase
    .from("insurance_renewal_assignments")
    .update({
      whatsapp_sent: true,
      whatsapp_status: waType,
      whatsapp_sent_at: new Date().toISOString(),
    })
    .eq("id", assignmentId);

  if (error) return errorResponse(error.message);
  return json({ success: true });
}

// ─── admin_stats: Per-telecaller performance stats ─────────────────────────
async function handleAdminStats(supabase: SupabaseClient, role: string, body: Record<string, unknown>) {
  if (role !== "admin") return errorResponse("Admin only", 403);

  const campaignId = body.campaign_id ? Number(body.campaign_id) : null;
  const dateFrom = body.date_from as string;
  const dateTo = body.date_to as string;

  let query = supabase.from("insurance_renewal_assignments").select(`
    assigned_to,
    assigned_to_name,
    status,
    quoted_premium,
    call_count,
    updated_at
  `);

  if (campaignId) query = query.eq("campaign_id", campaignId);
  if (dateFrom) query = query.gte("updated_at", dateFrom + "T00:00:00Z");
  if (dateTo) query = query.lte("updated_at", dateTo + "T23:59:59Z");

  const { data, error } = await query;
  if (error) return errorResponse(error.message);

  const TERMINAL_COMPLETED = [
    "renewed_via_us",
    "renewed_elsewhere",
    "not_interested",
    "wrong_number",
    "not_reachable",
    "already_renewed_unknown",
  ];

  const statsMap = new Map<string, Record<string, unknown>>();
  for (const row of data || []) {
    // Skip idle pool rows (campaign counters still include these)
    if (!row.assigned_to && (row.status === "pending" || row.status === "out_of_window")) {
      continue;
    }
    // Include in-progress / completed even if assignee was cleared (legacy rows)
    if (!row.assigned_to && row.status !== "pending" && row.status !== "out_of_window") {
      // bucket unattributed dispositions so Performance is not empty
    }

    const key = row.assigned_to || `_unassigned_${row.status}`;
    if (!statsMap.has(key)) {
      statsMap.set(key, {
        telecaller_id: row.assigned_to,
        telecaller_name: row.assigned_to_name || (row.assigned_to ? "Unknown" : "Unassigned"),
        calls_made: 0,
        calls_connected: 0,
        renewed_via_us: 0,
        renewed_elsewhere: 0,
        callback_later: 0,
        no_answer: 0,
        not_interested: 0,
        wrong_number: 0,
        not_reachable: 0,
        already_renewed_unknown: 0,
        in_progress: 0,
        completed_total: 0,
        premium_collected: 0,
      });
    }
    const stats = statsMap.get(key)!;
    stats.calls_made = (stats.calls_made as number) + (row.call_count || 0);
    if (["renewed_via_us", "renewed_elsewhere", "callback_later", "not_interested", "wrong_number", "not_reachable", "already_renewed_unknown"].includes(row.status)) {
      stats.calls_connected = (stats.calls_connected as number) + 1;
    }
    if (TERMINAL_COMPLETED.includes(row.status)) {
      stats.completed_total = (stats.completed_total as number) + 1;
    }
    if (row.status === "renewed_via_us") {
      stats.renewed_via_us = (stats.renewed_via_us as number) + 1;
      stats.premium_collected = (stats.premium_collected as number) + Number(row.quoted_premium || 0);
    }
    if (row.status === "renewed_elsewhere") stats.renewed_elsewhere = (stats.renewed_elsewhere as number) + 1;
    if (row.status === "callback_later") stats.callback_later = (stats.callback_later as number) + 1;
    if (row.status === "no_answer") stats.no_answer = (stats.no_answer as number) + 1;
    if (row.status === "not_interested") stats.not_interested = (stats.not_interested as number) + 1;
    if (row.status === "wrong_number") stats.wrong_number = (stats.wrong_number as number) + 1;
    if (row.status === "not_reachable") stats.not_reachable = (stats.not_reachable as number) + 1;
    if (row.status === "already_renewed_unknown") stats.already_renewed_unknown = (stats.already_renewed_unknown as number) + 1;
    if (row.status === "in_progress") stats.in_progress = (stats.in_progress as number) + 1;
  }

  const agent_stats = Array.from(statsMap.values()).filter((s) => {
    const activity = (s.calls_made as number) + (s.in_progress as number) + (s.completed_total as number) +
      (s.callback_later as number) + (s.no_answer as number);
    return activity > 0 || s.telecaller_id;
  });

  agent_stats.sort((a, b) => (b.calls_made as number) - (a.calls_made as number));

  return json({ success: true, agent_stats });
}

// ─── renewed_list: List of renewed via us ─────────────────────────────────
async function handleRenewedList(supabase: SupabaseClient, body: Record<string, unknown>) {
  const campaignId = body.campaign_id ? Number(body.campaign_id) : null;

  let query = supabase
    .from("insurance_renewal_assignments")
    .select(`
      id, campaign_id, status, quoted_premium, renewal_company, call_notes,
      updated_at, assigned_to_name,
      vehicles(first_name, last_name, contact_phones, model, vehicle_registration_number, last_insurance_expiry_date)
    `)
    .eq("status", "renewed_via_us")
    .order("updated_at", { ascending: false });

  if (campaignId) query = query.eq("campaign_id", campaignId);

  const { data, error } = await query;
  if (error) return errorResponse(error.message);

  const renewed = (data || []).map((r: Record<string, unknown>) => {
    const v = r.vehicles as Record<string, unknown>;
    return {
      id: r.id,
      customer_name: `${v?.first_name || ""} ${v?.last_name || ""}`.trim(),
      phone: v?.contact_phones,
      model: v?.model,
      reg_number: v?.vehicle_registration_number,
      quoted_premium: r.quoted_premium,
      renewal_company: r.renewal_company,
      call_notes: r.call_notes,
      renewed_by: r.assigned_to_name,
      renewed_at: r.updated_at,
    };
  });

  return json({ success: true, renewed });
}

// ─── refresh_campaign: Re-scan vehicles, add new leads ─────────────────────
async function handleRefreshCampaign(supabase: SupabaseClient, body: Record<string, unknown>) {
  const campaignId = Number(body.campaign_id);
  if (!campaignId) return errorResponse("Missing campaign_id");

  const { data: campaign, error: campError } = await supabase
    .from("insurance_renewal_campaigns")
    .select("*")
    .eq("id", campaignId)
    .single();
  if (campError) return errorResponse(campError.message);

  if (campaign.status !== "active") {
    return json({ success: true, refreshed: [] });
  }

  // Build vehicle query with dealer filters
  const windowDays = campaign.window_days || 30;
  const today = new Date().toISOString().split("T")[0];
  const futureDate = new Date(Date.now() + windowDays * 86400000).toISOString().split("T")[0];

  const { vehicles: uniqueVehicles, error: vError } = await fetchEligibleVehiclesInWindow(supabase, {
    today,
    futureDate,
    soldDealerFilter: campaign.sold_dealer_filter as string[] | null,
    lastServiceDealerFilter: campaign.last_service_dealer_filter as string[] | null,
  });
  if (vError) return errorResponse(vError);

  const ownerMap = await fetchLiveCustomerOwnerCampaignMap(supabase);
  let retiredCrossCampaign = 0;
  try {
    retiredCrossCampaign = await retireCrossCampaignDuplicatesInCampaign(
      supabase,
      campaignId,
      ownerMap,
    );
  } catch (dupErr) {
    return errorResponse((dupErr as Error).message);
  }

  // Get existing assignments to avoid duplicates
  const { data: existing } = await supabase
    .from("insurance_renewal_assignments")
    .select("customer_id")
    .eq("campaign_id", campaignId);

  const existingVehicleIds = new Set((existing || []).map((e: Record<string, unknown>) => e.customer_id));

  // Find new leads to add (skip customers owned by another active campaign)
  let newVehicles = uniqueVehicles.filter((v: Record<string, unknown>) => !existingVehicleIds.has(v.id));
  const addFilter = vehiclesAvailableToAddToCampaign(newVehicles, campaignId, ownerMap);
  newVehicles = addFilter.eligible;

  // Find out-of-window assignments to retire
  const { data: allAssignments } = await supabase
    .from("insurance_renewal_assignments")
    .select("id, customer_id, status")
    .eq("campaign_id", campaignId)
    .in("status", ["pending", "in_progress"]);

  const stillInWindowVehicleIds = new Set(uniqueVehicles.map((v: Record<string, unknown>) => v.id));
  const toRetire = (allAssignments || []).filter(
    (a: Record<string, unknown>) => !stillInWindowVehicleIds.has(a.customer_id)
  );

  // Insert new assignments
  let added = 0;
  if (newVehicles.length > 0) {
    const newAssignments = newVehicles.map((v: Record<string, unknown>) => ({
      campaign_id: campaignId,
      customer_id: v.id,
      status: "pending",
    }));
    const { error: insertError } = await supabase
      .from("insurance_renewal_assignments")
      .insert(newAssignments);
    if (!insertError) added = newVehicles.length;
  }

  // Retire out-of-window (only pending / in_progress — never terminal dispositions)
  let retired = 0;
  if (toRetire.length > 0) {
    const retireIds = toRetire.map((a: Record<string, unknown>) => a.id as number);
    try {
      await updateAssignmentsInChunks(supabase, retireIds, { status: "out_of_window" });
      retired = retireIds.length;
    } catch (retireError) {
      return errorResponse((retireError as Error).message);
    }
  }

  // Re-open assignments that were retired but are in window again (effective_due_date)
  let reactivated = 0;
  const { data: oowAssignments } = await supabase
    .from("insurance_renewal_assignments")
    .select("id, customer_id")
    .eq("campaign_id", campaignId)
    .eq("status", "out_of_window");

  const reactivateIds = (oowAssignments || [])
    .filter((a: Record<string, unknown>) => stillInWindowVehicleIds.has(a.customer_id))
    .filter((a: Record<string, unknown>) => {
      const owner = ownerMap.get(a.customer_id as number);
      return owner === undefined || owner === campaignId;
    })
    .map((a: Record<string, unknown>) => a.id as number);

  if (reactivateIds.length > 0) {
    try {
      await updateAssignmentsInChunks(supabase, reactivateIds, {
        status: "pending",
        assigned_to: null,
        assigned_to_name: null,
      });
      reactivated = reactivateIds.length;
    } catch (reactErr) {
      return errorResponse((reactErr as Error).message);
    }
  }

  await supabase
    .from("insurance_renewal_campaigns")
    .update({ date_from: today, date_to: futureDate })
    .eq("id", campaignId);

  // Update campaign counts
  await updateCampaignCounts(supabase, campaignId);

  // Get refreshed campaign
  const { data: refreshedCampaign } = await supabase
    .from("insurance_renewal_campaigns")
    .select("*")
    .eq("id", campaignId)
    .single();

  const refreshed = [{
    ...refreshedCampaign,
    window: `${today} → ${futureDate}`,
    added,
    retired_out_of_window: retired,
    reactivated_to_pending: reactivated,
    retired_cross_campaign_duplicates: retiredCrossCampaign,
    excluded_cross_campaign_on_add: addFilter.excluded_cross_campaign,
  }];

  return json({ success: true, refreshed });
}

// ─── preview_campaign: Preview eligible leads (with dealer filters) ──────
async function handlePreviewCampaign(supabase: SupabaseClient, body: Record<string, unknown>) {
  const windowDays = Number(body.window_days) || 30;
  const soldDealerFilter = body.sold_dealer_filter as string[] | undefined;
  const lastServiceDealerFilter = body.last_service_dealer_filter as string[] | undefined;

  const today = new Date().toISOString().split("T")[0];
  const futureDate = new Date(Date.now() + windowDays * 86400000).toISOString().split("T")[0];

  const { vehicles: unique, error } = await fetchEligibleVehiclesInWindow(supabase, {
    today,
    futureDate,
    soldDealerFilter,
    lastServiceDealerFilter,
  });
  if (error) return errorResponse(error);

  const ownerMap = await fetchLiveCustomerOwnerCampaignMap(supabase);
  const { eligible, excluded_cross_campaign } = vehiclesAvailableForNewCampaign(unique, ownerMap);

  return json({
    success: true,
    filtered_count: eligible.length,
    raw_count: unique.length,
    excluded_cross_campaign,
    date_from: today,
    date_to: futureDate,
  });
}

// ─── create_campaign: Create new campaign (with dealer filters + priority) ─
async function handleCreateCampaign(supabase: SupabaseClient, body: Record<string, unknown>) {
  const campaignName = body.campaign_name as string;
  const windowDays = Number(body.window_days) || 30;
  if (!campaignName) return errorResponse("Missing campaign_name");

  const soldDealerFilter = body.sold_dealer_filter as string[] | undefined;
  const lastServiceDealerFilter = body.last_service_dealer_filter as string[] | undefined;
  const priorityMode = (body.priority_mode as string) || "urgency";

  const today = new Date().toISOString().split("T")[0];
  const futureDate = new Date(Date.now() + windowDays * 86400000).toISOString().split("T")[0];

  // Create campaign
  const { data: campaign, error: campError } = await supabase
    .from("insurance_renewal_campaigns")
    .insert({
      campaign_name: campaignName,
      status: "active",
      window_days: windowDays,
      date_from: today,
      date_to: futureDate,
      sold_dealer_filter: soldDealerFilter || null,
      last_service_dealer_filter: lastServiceDealerFilter || null,
      priority_mode: priorityMode,
      auto_refresh_enabled: true,
      drip_enabled: true,
    })
    .select()
    .single();
  if (campError) return errorResponse(campError.message);

  const { vehicles: unique, error: vError } = await fetchEligibleVehiclesInWindow(supabase, {
    today,
    futureDate,
    soldDealerFilter,
    lastServiceDealerFilter,
  });
  if (vError) return errorResponse(vError);

  const ownerMap = await fetchLiveCustomerOwnerCampaignMap(supabase);
  const { eligible, excluded_cross_campaign } = vehiclesAvailableForNewCampaign(unique, ownerMap);

  if (eligible.length === 0) {
    return json({
      success: true,
      total_leads: 0,
      excluded_cross_campaign,
      message: excluded_cross_campaign > 0
        ? "No new leads: all eligible customers are already in another active campaign queue."
        : "No customers found with insurance expiring in the selected window.",
    });
  }

  // Create assignments
  const assignments = eligible.map((v: Record<string, unknown>) => ({
    campaign_id: campaign.id,
    customer_id: v.id,
    status: "pending",
  }));

  const { error: assignError } = await supabase
    .from("insurance_renewal_assignments")
    .insert(assignments);
  if (assignError) return errorResponse(assignError.message);

  // Update campaign counts
  await updateCampaignCounts(supabase, campaign.id);

  const stats = {
    raw_from_db: unique.length,
    after_chassis_dedup: unique.length,
    after_cross_campaign_exclusion: eligible.length,
    excluded_cross_campaign,
    date_from: today,
    date_to: futureDate,
  };

  return json({
    success: true,
    total_leads: eligible.length,
    stats,
  });
}

// ─── close_campaign ────────────────────────────────────────────────────────
async function handleCloseCampaign(supabase: SupabaseClient, body: Record<string, unknown>) {
  const campaignId = Number(body.campaign_id);
  if (!campaignId) return errorResponse("Missing campaign_id");

  const { error } = await supabase
    .from("insurance_renewal_campaigns")
    .update({ status: "closed" })
    .eq("id", campaignId);
  if (error) return errorResponse(error.message);
  return json({ success: true });
}

// ─── update_campaign ──────────────────────────────────────────────────────
async function handleUpdateCampaign(supabase: SupabaseClient, body: Record<string, unknown>) {
  const campaignId = Number(body.campaign_id);
  if (!campaignId) return errorResponse("Missing campaign_id");

  const updateData: Record<string, unknown> = {};
  if (body.campaign_name) updateData.campaign_name = body.campaign_name;
  if (body.window_days) updateData.window_days = Number(body.window_days);
  if (body.priority_mode) updateData.priority_mode = body.priority_mode;
  if (body.sold_dealer_filter !== undefined) updateData.sold_dealer_filter = body.sold_dealer_filter || null;
  if (body.last_service_dealer_filter !== undefined) updateData.last_service_dealer_filter = body.last_service_dealer_filter || null;

  const { error } = await supabase
    .from("insurance_renewal_campaigns")
    .update(updateData)
    .eq("id", campaignId);
  if (error) return errorResponse(error.message);
  return json({ success: true });
}

// ─── delete_campaign ──────────────────────────────────────────────────────
async function handleDeleteCampaign(supabase: SupabaseClient, body: Record<string, unknown>) {
  const campaignId = Number(body.campaign_id);
  if (!campaignId) return errorResponse("Missing campaign_id");

  const { data: liveRows, error: liveErr } = await supabase
    .from("insurance_renewal_assignments")
    .select("id, status, assigned_to")
    .eq("campaign_id", campaignId)
    .in("status", LIVE_ASSIGNMENT_STATUSES);
  if (liveErr) return errorResponse(liveErr.message);

  const activeTelecaller = (liveRows || []).filter(
    (r) => r.assigned_to && ["in_progress", "callback_later", "no_answer"].includes(r.status as string),
  );
  if (activeTelecaller.length > 0) {
    return errorResponse(
      `Cannot delete: ${activeTelecaller.length} lead(s) still assigned to telecallers (in progress / callback / no answer). Close the campaign and finish or reassign them first.`,
      409,
    );
  }

  if ((liveRows || []).length > 0 && body.force !== true) {
    return errorResponse(
      `Cannot delete: ${liveRows.length} lead(s) still in queue (pending or assigned). Use Close campaign, or pass force after clearing work.`,
      409,
    );
  }

  const { error } = await supabase
    .from("insurance_renewal_campaigns")
    .delete()
    .eq("id", campaignId);
  if (error) return errorResponse(error.message);
  return json({ success: true });
}

// ============================================================================
// NEW ACTIONS
// ============================================================================

// ─── get_dealers: Get distinct dealer names for dropdown filters ───────────
async function handleGetDealers(supabase: SupabaseClient) {
  const { data: soldData, error: soldError } = await supabase
    .from("all_service_data")
    .select("sold_dealer")
    .not("sold_dealer", "is", null)
    .neq("sold_dealer", "");

  const { data: svcData, error: svcError } = await supabase
    .from("all_service_data")
    .select("last_service_dealer")
    .not("last_service_dealer", "is", null)
    .neq("last_service_dealer", "");

  if (soldError || svcError) return errorResponse("Failed to fetch dealers");

  const soldDealers = [...new Set((soldData || []).map((d: Record<string, unknown>) => d.sold_dealer as string))].sort();
  const serviceDealers = [...new Set((svcData || []).map((d: Record<string, unknown>) => d.last_service_dealer as string))].sort();

  return json({ success: true, dealers: { sold_dealers: soldDealers, service_dealers: serviceDealers } });
}

// ─── leaderboard: Daily gamification leaderboard ──────────────────────────
async function handleLeaderboard(supabase: SupabaseClient, body: Record<string, unknown>) {
  const campaignId = body.campaign_id ? Number(body.campaign_id) : null;
  const date = (body.date as string) || new Date().toISOString().split("T")[0];

  let query = supabase
    .from("insurance_renewal_leaderboard")
    .select("*")
    .eq("snapshot_date", date)
    .order("score", { ascending: false });

  if (campaignId) query = query.eq("campaign_id", campaignId);

  const { data, error } = await query;
  if (error) return errorResponse(error.message);

  // If no leaderboard snapshots exist for today, compute on the fly
  if (!data || data.length === 0) {
    const todayStart = date + "T00:00:00Z";
    const todayEnd = date + "T23:59:59Z";

    let assignQuery = supabase
      .from("insurance_renewal_assignments")
      .select("assigned_to, assigned_to_name, status, quoted_premium, call_count, updated_at, campaign_id")
      .not("assigned_to", "is", null)
      .gte("updated_at", todayStart)
      .lte("updated_at", todayEnd);

    if (campaignId) assignQuery = assignQuery.eq("campaign_id", campaignId);

    const { data: todayAssignments } = await assignQuery;

    const statsMap = new Map<string, Record<string, unknown>>();
    for (const row of todayAssignments || []) {
      const key = row.assigned_to as string;
      if (!statsMap.has(key)) {
        statsMap.set(key, {
          telecaller_id: row.assigned_to,
          telecaller_name: row.assigned_to_name || "Unknown",
          calls_made: 0,
          calls_connected: 0,
          renewed_via_us: 0,
          renewed_elsewhere: 0,
          callback_later: 0,
          no_answer: 0,
          not_interested: 0,
          premium_collected: 0,
        });
      }
      const stats = statsMap.get(key)!;
      stats.calls_made = (stats.calls_made as number) + (row.call_count || 0);
      if (row.status === "renewed_via_us") {
        stats.renewed_via_us = (stats.renewed_via_us as number) + 1;
        stats.premium_collected = (stats.premium_collected as number) + Number(row.quoted_premium || 0);
        stats.calls_connected = (stats.calls_connected as number) + 1;
      }
      if (row.status === "renewed_elsewhere") { stats.renewed_elsewhere = (stats.renewed_elsewhere as number) + 1; stats.calls_connected = (stats.calls_connected as number) + 1; }
      if (row.status === "callback_later") { stats.callback_later = (stats.callback_later as number) + 1; stats.calls_connected = (stats.calls_connected as number) + 1; }
      if (row.status === "no_answer") stats.no_answer = (stats.no_answer as number) + 1;
      if (row.status === "not_interested") { stats.not_interested = (stats.not_interested as number) + 1; stats.calls_connected = (stats.calls_connected as number) + 1; }
    }

    // Calculate scores: renewed=10pts, callback=3pts, connected=1pt, premium/1000=1pt
    const leaderboard = Array.from(statsMap.values()).map((s) => ({
      ...s,
      conversion_rate: s.calls_made > 0 ? ((s.renewed_via_us as number) / s.calls_made) * 100 : 0,
      score: (s.renewed_via_us as number) * 10 +
             (s.callback_later as number) * 3 +
             (s.calls_connected as number) * 1 +
             Math.floor((s.premium_collected as number) / 1000),
    }));

    leaderboard.sort((a, b) => (b.score as number) - (a.score as number));
    return json({ success: true, leaderboard, date });
  }

  return json({ success: true, leaderboard: data, date });
}

// ─── roi_dashboard: Campaign ROI metrics ───────────────────────────────────
async function handleRoiDashboard(supabase: SupabaseClient, body: Record<string, unknown>) {
  const campaignId = body.campaign_id ? Number(body.campaign_id) : null;

  let query = supabase
    .from("insurance_renewal_assignments")
    .select("status, quoted_premium, renewal_company, created_at, updated_at, campaign_id");

  if (campaignId) query = query.eq("campaign_id", campaignId);

  const { data: assignments, error } = await query;
  if (error) return errorResponse(error.message);

  const total = assignments?.length || 0;
  const renewedViaUs = assignments?.filter((a: Record<string, unknown>) => a.status === "renewed_via_us") || [];
  const renewedElsewhere = assignments?.filter((a: Record<string, unknown>) => a.status === "renewed_elsewhere") || [];
  const pending = assignments?.filter((a: Record<string, unknown>) => a.status === "pending") || [];
  const callback = assignments?.filter((a: Record<string, unknown>) => a.status === "callback_later") || [];
  const notInterested = assignments?.filter((a: Record<string, unknown>) => a.status === "not_interested") || [];

  const totalPremium = renewedViaUs.reduce((sum: number, a: Record<string, unknown>) => sum + Number(a.quoted_premium || 0), 0);
  const avgPremium = renewedViaUs.length > 0 ? totalPremium / renewedViaUs.length : 0;

  // Revenue by renewal company
  const byCompany = new Map<string, { count: number; premium: number }>();
  for (const r of renewedViaUs as Record<string, unknown>[]) {
    const company = (r.renewal_company as string) || "Unknown";
    if (!byCompany.has(company)) byCompany.set(company, { count: 0, premium: 0 });
    const c = byCompany.get(company)!;
    c.count++;
    c.premium += Number(r.quoted_premium || 0);
  }

  // Get campaign target
  let targetPremium = 0;
  if (campaignId) {
    const { data: campaign } = await supabase
      .from("insurance_renewal_campaigns")
      .select("roi_target_premium")
      .eq("id", campaignId)
      .single();
    targetPremium = campaign?.roi_target_premium || 0;
  }

  const roi = {
    total_leads: total,
    renewed_via_us: renewedViaUs.length,
    renewed_elsewhere: renewedElsewhere.length,
    pending: pending.length,
    callback_later: callback.length,
    not_interested: notInterested.length,
    conversion_rate: total > 0 ? (renewedViaUs.length / total) * 100 : 0,
    total_premium_collected: totalPremium,
    avg_premium: avgPremium,
    target_premium: targetPremium,
    target_achievement: targetPremium > 0 ? (totalPremium / targetPremium) * 100 : 0,
    by_company: Array.from(byCompany.entries()).map(([company, stats]) => ({
      company,
      count: stats.count,
      premium: stats.premium,
    })).sort((a, b) => b.premium - a.premium),
  };

  return json({ success: true, roi });
}

// ─── expired_leads: Post-expiry emergency leads ────────────────────────────
async function handleExpiredLeads(supabase: SupabaseClient, body: Record<string, unknown>) {
  const campaignId = body.campaign_id ? Number(body.campaign_id) : null;
  const today = new Date().toISOString().split("T")[0];

  // Find assignments where insurance has already expired but not renewed
  let query = supabase
    .from("insurance_renewal_assignments")
    .select(`
      id, campaign_id, status, call_count, no_answer_count, call_notes,
      all_service_data!inner(
        id, first_name, last_name, contact_phones, model, vehicle_registration_number,
        last_insurance_expiry_date, vehicle_sale_date, sold_dealer, last_service_dealer,
        idv, last_insurance_comapny
      )
    `)
    .in("status", ["pending", "no_answer", "callback_later", "in_progress"]);

  if (campaignId) query = query.eq("campaign_id", campaignId);

  const { data, error } = await query;
  if (error) return errorResponse(error.message);

  const expired = (data || [])
    .map((a: Record<string, unknown>) => {
      const v = a.all_service_data as unknown as Record<string, unknown>;
      const insDate = estimateInsuranceDate(
        v.last_insurance_expiry_date as string,
        v.vehicle_sale_date as string
      );
      if (!insDate.date) return null;
      const daysExpired = Math.floor(
        (new Date(today).getTime() - new Date(insDate.date).getTime()) / 86400000
      );
      if (daysExpired <= 0) return null;
      return {
        id: a.id,
        campaign_id: a.campaign_id,
        status: a.status,
        call_count: a.call_count || 0,
        no_answer_count: a.no_answer_count || 0,
        call_notes: a.call_notes,
        days_expired: daysExpired,
        customer: {
          first_name: v.first_name,
          last_name: v.last_name,
          contact_phones: v.contact_phones,
          model: v.model,
          vehicle_registration_number: v.vehicle_registration_number,
          insurance_expiry_date: insDate.date,
          estimated: insDate.estimated,
          insurance_company: v.last_insurance_comapny,
          idv: v.idv,
          sold_dealer: v.sold_dealer,
          last_service_dealer: v.last_service_dealer,
        },
      };
    })
    .filter(Boolean)
    .sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
      (b.days_expired as number) - (a.days_expired as number)
    );

  return json({ success: true, expired, count: expired.length });
}

// ─── send_drip_message: Send Meta WhatsApp drip message ───────────────────
async function handleSendDripMessage(supabase: SupabaseClient, body: Record<string, unknown>) {
  const assignmentId = Number(body.assignment_id);
  const campaignId = Number(body.campaign_id);
  if (!assignmentId || !campaignId) return errorResponse("Missing required fields");

  // Get campaign Meta settings
  const { data: campaign } = await supabase
    .from("insurance_renewal_campaigns")
    .select("meta_enabled, meta_template_name, meta_template_lang, drip_enabled")
    .eq("id", campaignId)
    .single();

  if (!campaign?.meta_enabled || !campaign?.drip_enabled) {
    return errorResponse("Meta WhatsApp or drip not enabled for this campaign");
  }

  // Get Meta config from wa_agent_config
  const metaConfig = await getMetaConfig(supabase);
  if (!metaConfig) {
    return errorResponse("Meta WhatsApp not configured. Set up wa_agent_config first.");
  }

  // Get assignment + vehicle data
  const { data: assignment, error: assignError } = await supabase
    .from("insurance_renewal_assignments")
    .select(`
      id, no_answer_count,
      all_service_data!inner(first_name, last_name, contact_phones, model, vehicle_registration_number, last_insurance_expiry_date, vehicle_sale_date)
    `)
    .eq("id", assignmentId)
    .single();
  if (assignError || !assignment) return errorResponse("Assignment not found");

  const vehicle = assignment.all_service_data as unknown as Record<string, unknown>;
  const noAnswerCount = (assignment.no_answer_count as number) || 1;
  const customerName = `${vehicle.first_name || ""} ${vehicle.last_name || ""}`.trim();
  const insDate = estimateInsuranceDate(
    vehicle.last_insurance_expiry_date as string,
    vehicle.vehicle_sale_date as string
  );

  // Determine drip step and template
  const step = Math.min(noAnswerCount, 3);
  const templateName = campaign.meta_template_name || `insurance_renewal_${step === 1 ? "reminder" : step === 2 ? "urgent" : "final"}`;
  const templateLang = campaign.meta_template_lang || "en_US";

  // Template variables: name, model, reg number, expiry date
  const variables = [
    customerName || "Customer",
    (vehicle.model as string) || "your vehicle",
    (vehicle.vehicle_registration_number as string) || "",
    insDate.date || "soon",
  ];

  // Send Meta message
  const result = await sendMetaTemplateMessage(
    vehicle.contact_phones as string,
    templateName,
    templateLang,
    variables,
    metaConfig.meta_phone_number_id,
    metaConfig.meta_access_token
  );

  // Log to meta_logs table
  await supabase.from("insurance_renewal_meta_logs").insert({
    campaign_id: campaignId,
    assignment_id: assignmentId,
    phone: vehicle.contact_phones as string,
    template_name: templateName,
    template_lang: templateLang,
    step,
    status: result.success ? "sent" : "failed",
    meta_message_id: result.messageId || null,
    error: result.error || null,
    sent_at: new Date().toISOString(),
  });

  // Update assignment
  await supabase
    .from("insurance_renewal_assignments")
    .update({
      whatsapp_sent: true,
      whatsapp_status: `drip_step_${step}`,
      whatsapp_sent_at: new Date().toISOString(),
    })
    .eq("id", assignmentId);

  if (!result.success) {
    return json({ success: false, error: result.error });
  }

  // If step 3 (final), generate self-renewal link if enabled
  if (step === 3 && campaign.self_renewal_link_enabled !== false) {
    await generateSelfRenewalLinkInternal(supabase, campaignId, assignmentId, vehicle);
  }

  return json({ success: true, step, message_id: result.messageId });
}

// ─── generate_self_renewal_link: Create self-renewal payment link ──────────
async function handleGenerateSelfRenewalLink(supabase: SupabaseClient, body: Record<string, unknown>) {
  const assignmentId = Number(body.assignment_id);
  const campaignId = Number(body.campaign_id);
  if (!assignmentId || !campaignId) return errorResponse("Missing required fields");

  const { data: assignment } = await supabase
    .from("insurance_renewal_assignments")
    .select(`
      id, all_service_data!inner(first_name, last_name, contact_phones, model, vehicle_registration_number)
    `)
    .eq("id", assignmentId)
    .single();

  if (!assignment) return errorResponse("Assignment not found");

  const vehicle = assignment.all_service_data as unknown as Record<string, unknown>;
  const link = await generateSelfRenewalLinkInternal(supabase, campaignId, assignmentId, vehicle);

  return json({ success: true, link });
}

async function generateSelfRenewalLinkInternal(
  supabase: SupabaseClient,
  campaignId: number,
  assignmentId: number,
  vehicle: Record<string, unknown>
) {
  const token = crypto.randomUUID();
  const baseUrl = "https://techwheels-service.vercel.app";
  const linkUrl = `${baseUrl}/insurance-renewal/self?token=${token}`;

  const { data } = await supabase
    .from("insurance_renewal_self_renewal_links")
    .insert({
      campaign_id: campaignId,
      assignment_id: assignmentId,
      customer_phone: vehicle.contact_phones as string,
      customer_name: `${vehicle.first_name || ""} ${vehicle.last_name || ""}`.trim(),
      vehicle_reg: vehicle.vehicle_registration_number as string,
      model: vehicle.model as string,
      token,
      link_url: linkUrl,
      status: "sent",
      expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    })
    .select()
    .single();

  return data;
}

// ─── update_campaign_meta: Update Meta WhatsApp settings for campaign ──────
async function handleUpdateCampaignMeta(supabase: SupabaseClient, body: Record<string, unknown>) {
  const campaignId = Number(body.campaign_id);
  if (!campaignId) return errorResponse("Missing campaign_id");

  const updateData: Record<string, unknown> = {};
  if (body.meta_enabled !== undefined) updateData.meta_enabled = body.meta_enabled;
  if (body.meta_template_name !== undefined) updateData.meta_template_name = body.meta_template_name;
  if (body.meta_template_lang !== undefined) updateData.meta_template_lang = body.meta_template_lang;
  if (body.drip_enabled !== undefined) updateData.drip_enabled = body.drip_enabled;
  if (body.self_renewal_link_enabled !== undefined) updateData.self_renewal_link_enabled = body.self_renewal_link_enabled;
  if (body.priority_mode !== undefined) updateData.priority_mode = body.priority_mode;
  if (body.auto_refresh_enabled !== undefined) updateData.auto_refresh_enabled = body.auto_refresh_enabled;
  if (body.roi_target_premium !== undefined) updateData.roi_target_premium = body.roi_target_premium;

  const { error } = await supabase
    .from("insurance_renewal_campaigns")
    .update(updateData)
    .eq("id", campaignId);
  if (error) return errorResponse(error.message);
  return json({ success: true });
}

// ─── conquest_preview: Preview conquest leads (sold by others) ─────────────
async function handleConquestPreview(supabase: SupabaseClient, body: Record<string, unknown>) {
  const windowDays = Number(body.window_days) || 30;
  const excludeDealers = (body.exclude_dealers as string[]) || ["Techwheels"];

  const today = new Date().toISOString().split("T")[0];
  const futureDate = new Date(Date.now() + windowDays * 86400000).toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("all_service_data")
    .select("*")
    .not("contact_phones", "is", null)
    .neq("contact_phones", "")
    .not("last_insurance_expiry_date", "is", null)
    .gte("last_insurance_expiry_date", today)
    .lte("last_insurance_expiry_date", futureDate)
    .not("sold_dealer", "in", excludeDealers);

  if (error) return errorResponse(error.message);

  const seenChassis = new Set<string>();
  const unique = (data || []).filter((v: Record<string, unknown>) => {
    const chassis = v.chassis_no as string;
    if (!chassis) return true;
    if (seenChassis.has(chassis)) return false;
    seenChassis.add(chassis);
    return true;
  });

  return json({
    success: true,
    preview: {
      filtered_count: unique.length,
      raw_count: data?.length || 0,
      date_from: today,
      date_to: futureDate,
      type: "conquest",
    },
  });
}

// ─── conquest_create: Create conquest campaign ────────────────────────────
async function handleConquestCreate(supabase: SupabaseClient, body: Record<string, unknown>) {
  const campaignName = body.campaign_name as string;
  const windowDays = Number(body.window_days) || 30;
  const excludeDealers = (body.exclude_dealers as string[]) || ["Techwheels"];
  if (!campaignName) return errorResponse("Missing campaign_name");

  // Reuse create_campaign with conquest filter
  return handleCreateCampaign(supabase, {
    ...body,
    campaign_name: campaignName,
    window_days: windowDays,
    priority_mode: "idv_value", // Conquest campaigns prioritize high-value vehicles
    // Note: The dealer filter would exclude Techwheels — this needs the NOT IN filter
    // For now, the frontend can pass sold_dealer_filter with conquest dealers
  });
}

// ─── cron_daily_refresh: Auto-refresh all active campaigns ─────────────────
async function handleCronDailyRefresh() {
  const serviceKey = Deno.env.get("CRON_SERVICE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY") || "";  const supabase = createClient(SUPABASE_URL, serviceKey);

  // Get all active campaigns with auto_refresh_enabled
  const { data: campaigns, error } = await supabase
    .from("insurance_renewal_campaigns")
    .select("*")
    .eq("status", "active")
    .eq("auto_refresh_enabled", true);

  if (error) {
    console.error("Cron refresh error:", error);
    return json({ success: false, error: error.message });
  }

  if (!campaigns || campaigns.length === 0) {
    return json({ success: true, refreshed: 0, message: "No active campaigns to refresh." });
  }

  const results = [];
  for (const campaign of campaigns) {
    try {
      const refreshResult = await handleRefreshCampaign(supabase, {
        campaign_id: campaign.id,
      });
      const resp = await refreshResult.json();
      results.push({
        campaign_id: campaign.id,
        campaign_name: campaign.campaign_name,
        added: resp.refreshed?.[0]?.added || 0,
        retired: resp.refreshed?.[0]?.retired_out_of_window || 0,
      });
    } catch (e) {
      console.error(`Refresh failed for campaign ${campaign.id}:`, e);
      results.push({
        campaign_id: campaign.id,
        error: String(e),
      });
    }
  }

  // Also send drip messages for no-answer leads that are due for retry
  try { await sendPendingDripMessages(supabase); } catch (e) { console.error("Drip error:", e); }

  // Snapshot leaderboard for today
  try { await snapshotLeaderboard(supabase); } catch (e) { console.error("Leaderboard error:", e); }

  return json({ success: true, refreshed: campaigns.length, results });
}

// ─── Send pending drip messages (called by cron) ──────────────────────────
async function sendPendingDripMessages(supabase: SupabaseClient) {
  // Find assignments with no_answer that have WhatsApp drip enabled
  const { data: assignments } = await supabase
    .from("insurance_renewal_assignments")
    .select(`
      id, campaign_id, no_answer_count, whatsapp_sent, whatsapp_status,
      all_service_data!inner(contact_phones, first_name, last_name, model, vehicle_registration_number, last_insurance_expiry_date, vehicle_sale_date)
    `)
    .eq("status", "pending")
    .not("retry_after", "is", null)
    .lte("retry_after", new Date().toISOString().split("T")[0]);

  if (!assignments || assignments.length === 0) return;

  const metaConfig = await getMetaConfig(supabase);
  if (!metaConfig) return;

  for (const assignment of assignments) {
    const campaign = assignment.campaign_id;
    const { data: campaignData } = await supabase
      .from("insurance_renewal_campaigns")
      .select("meta_enabled, meta_template_name, meta_template_lang, drip_enabled")
      .eq("id", campaign)
      .single();

    if (!campaignData?.meta_enabled || !campaignData?.drip_enabled) continue;

    const vehicle = assignment.all_service_data as unknown as Record<string, unknown>;
    const step = Math.min((assignment.no_answer_count || 0) + 1, 3);
    const lastStep = assignment.whatsapp_status === "drip_step_3";

    if (lastStep) continue; // Already sent final drip

    const templateName = campaignData.meta_template_name || `insurance_renewal_${step === 1 ? "reminder" : step === 2 ? "urgent" : "final"}`;
    const templateLang = campaignData.meta_template_lang || "en_US";
    const customerName = `${vehicle.first_name || ""} ${vehicle.last_name || ""}`.trim();
    const insDate = estimateInsuranceDate(
      vehicle.last_insurance_expiry_date as string,
      vehicle.vehicle_sale_date as string
    );

    const variables = [
      customerName || "Customer",
      (vehicle.model as string) || "your vehicle",
      (vehicle.vehicle_registration_number as string) || "",
      insDate.date || "soon",
    ];

    const result = await sendMetaTemplateMessage(
      vehicle.contact_phones as string,
      templateName,
      templateLang,
      variables,
      metaConfig.meta_phone_number_id,
      metaConfig.meta_access_token
    );

    // Log
    await supabase.from("insurance_renewal_meta_logs").insert({
      campaign_id: campaign,
      assignment_id: assignment.id,
      phone: vehicle.contact_phones as string,
      template_name: templateName,
      template_lang: templateLang,
      step,
      status: result.success ? "sent" : "failed",
      meta_message_id: result.messageId || null,
      error: result.error || null,
      sent_at: new Date().toISOString(),
    });

    // Update assignment
    await supabase
      .from("insurance_renewal_assignments")
      .update({
        whatsapp_sent: true,
        whatsapp_status: `drip_step_${step}`,
        whatsapp_sent_at: new Date().toISOString(),
      })
      .eq("id", assignment.id);

    // If step 3, generate self-renewal link
    if (step === 3) {
      await generateSelfRenewalLinkInternal(supabase, campaign, assignment.id, vehicle);
    }

    // Rate limit: wait 500ms between messages
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

// ─── Trigger WhatsApp drip on no-answer (inline) ──────────────────────────
async function triggerWhatsAppDrip(supabase: SupabaseClient, assignmentId: number, campaignId: number, noAnswerCount: number) {
  const { data: campaign } = await supabase
    .from("insurance_renewal_campaigns")
    .select("meta_enabled, meta_template_name, meta_template_lang, drip_enabled, self_renewal_link_enabled")
    .eq("id", campaignId)
    .single();

  if (!campaign?.meta_enabled || !campaign?.drip_enabled) return;

  const metaConfig = await getMetaConfig(supabase);
  if (!metaConfig) return;

  const { data: assignment } = await supabase
    .from("insurance_renewal_assignments")
    .select(`
      id,
      all_service_data!inner(first_name, last_name, contact_phones, model, vehicle_registration_number, last_insurance_expiry_date, vehicle_sale_date)
    `)
    .eq("id", assignmentId)
    .single();

  if (!assignment) return;

  const vehicle = assignment.all_service_data as unknown as Record<string, unknown>;
  const step = Math.min(noAnswerCount, 3);
  const templateName = campaign.meta_template_name || `insurance_renewal_${step === 1 ? "reminder" : step === 2 ? "urgent" : "final"}`;
  const templateLang = campaign.meta_template_lang || "en_US";
  const customerName = `${vehicle.first_name || ""} ${vehicle.last_name || ""}`.trim();
  const insDate = estimateInsuranceDate(
    vehicle.last_insurance_expiry_date as string,
    vehicle.vehicle_sale_date as string
  );

  const variables = [
    customerName || "Customer",
    (vehicle.model as string) || "your vehicle",
    (vehicle.vehicle_registration_number as string) || "",
    insDate.date || "soon",
  ];

  const result = await sendMetaTemplateMessage(
    vehicle.contact_phones as string,
    templateName,
    templateLang,
    variables,
    metaConfig.meta_phone_number_id,
    metaConfig.meta_access_token
  );

  // Log
  await supabase.from("insurance_renewal_meta_logs").insert({
    campaign_id: campaignId,
    assignment_id: assignmentId,
    phone: vehicle.contact_phones as string,
    template_name: templateName,
    template_lang: templateLang,
    step,
    status: result.success ? "sent" : "failed",
    meta_message_id: result.messageId || null,
    error: result.error || null,
    sent_at: new Date().toISOString(),
  });

  // If step 3, generate self-renewal link
  if (step === 3 && campaign.self_renewal_link_enabled !== false) {
    await generateSelfRenewalLinkInternal(supabase, campaignId, assignmentId, vehicle);
  }
}

// ─── Update leaderboard ────────────────────────────────────────────────────
async function updateLeaderboard(
  supabase: SupabaseClient,
  campaignId: number,
  userId: string,
  userName: string,
  updates: Record<string, number>
) {
  const today = new Date().toISOString().split("T")[0];

  // Try to get existing record
  const { data: existing } = await supabase
    .from("insurance_renewal_leaderboard")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("telecaller_id", userId)
    .eq("snapshot_date", today)
    .single();

  if (existing) {
    const updateData: Record<string, number> = {};
    for (const [key, value] of Object.entries(updates)) {
      updateData[key] = (existing[key] || 0) + value;
    }
    await supabase
      .from("insurance_renewal_leaderboard")
      .update(updateData)
      .eq("id", existing.id);
  } else {
    await supabase
      .from("insurance_renewal_leaderboard")
      .insert({
        campaign_id: campaignId,
        telecaller_id: userId,
        telecaller_name: userName,
        snapshot_date: today,
        ...updates,
      });
  }
}

// ─── Snapshot leaderboard (called by cron) ────────────────────────────────
async function snapshotLeaderboard(supabase: SupabaseClient) {
  const today = new Date().toISOString().split("T")[0];
  const { data: campaigns } = await supabase
    .from("insurance_renewal_campaigns")
    .select("id")
    .eq("status", "active");

  for (const campaign of campaigns || []) {
    const { data: assignments } = await supabase
      .from("insurance_renewal_assignments")
      .select("assigned_to, assigned_to_name, status, quoted_premium, call_count")
      .eq("campaign_id", campaign.id)
      .not("assigned_to", "is", null)
      .gte("updated_at", today + "T00:00:00Z");

    const statsMap = new Map<string, Record<string, unknown>>();
    for (const row of assignments || []) {
      const key = row.assigned_to as string;
      if (!statsMap.has(key)) {
        statsMap.set(key, {
          campaign_id: campaign.id,
          telecaller_id: row.assigned_to,
          telecaller_name: row.assigned_to_name || "Unknown",
          snapshot_date: today,
          calls_made: 0,
          calls_connected: 0,
          renewed_via_us: 0,
          renewed_elsewhere: 0,
          callback_later: 0,
          no_answer: 0,
          not_interested: 0,
          premium_collected: 0,
          conversion_rate: 0,
          score: 0,
        });
      }
      const stats = statsMap.get(key)!;
      stats.calls_made = (stats.calls_made as number) + (row.call_count || 0);
      if (row.status === "renewed_via_us") {
        stats.renewed_via_us = (stats.renewed_via_us as number) + 1;
        stats.premium_collected = (stats.premium_collected as number) + Number(row.quoted_premium || 0);
        stats.calls_connected = (stats.calls_connected as number) + 1;
      }
      if (["renewed_elsewhere", "callback_later", "not_interested"].includes(row.status)) {
        stats.calls_connected = (stats.calls_connected as number) + 1;
      }
      if (row.status === "renewed_elsewhere") stats.renewed_elsewhere = (stats.renewed_elsewhere as number) + 1;
      if (row.status === "callback_later") stats.callback_later = (stats.callback_later as number) + 1;
      if (row.status === "no_answer") stats.no_answer = (stats.no_answer as number) + 1;
      if (row.status === "not_interested") stats.not_interested = (stats.not_interested as number) + 1;
    }

    for (const stats of statsMap.values()) {
      stats.conversion_rate = (stats.calls_made as number) > 0
        ? ((stats.renewed_via_us as number) / (stats.calls_made as number)) * 100
        : 0;
      stats.score = (stats.renewed_via_us as number) * 10 +
                    (stats.callback_later as number) * 3 +
                    (stats.calls_connected as number) * 1 +
                    Math.floor((stats.premium_collected as number) / 1000);

      // Upsert
      await supabase
        .from("insurance_renewal_leaderboard")
        .upsert(stats, { onConflict: "campaign_id,telecaller_id,snapshot_date" });
    }
  }
}

// ─── Update campaign counts ────────────────────────────────────────────────
async function updateCampaignCounts(supabase: SupabaseClient, campaignId: number) {
  const { data: assignments } = await supabase
    .from("insurance_renewal_assignments")
    .select("status")
    .eq("campaign_id", campaignId);

  const counts = {
    total_leads: assignments?.length || 0,
    pending_count: assignments?.filter((a: Record<string, unknown>) => a.status === "pending").length || 0,
    in_progress_count: assignments?.filter((a: Record<string, unknown>) => a.status === "in_progress").length || 0,
    callback_later_count: assignments?.filter((a: Record<string, unknown>) => a.status === "callback_later").length || 0,
    renewed_count: assignments?.filter((a: Record<string, unknown>) => a.status === "renewed_via_us").length || 0,
    completed_count: assignments?.filter((a: Record<string, unknown>) =>
      ["renewed_via_us", "renewed_elsewhere", "not_interested", "wrong_number", "not_reachable", "already_renewed_unknown"].includes(a.status as string)
    ).length || 0,
    out_of_window_count: assignments?.filter((a: Record<string, unknown>) => a.status === "out_of_window").length || 0,
  };

  await supabase
    .from("insurance_renewal_campaigns")
    .update(counts)
    .eq("id", campaignId);
}
