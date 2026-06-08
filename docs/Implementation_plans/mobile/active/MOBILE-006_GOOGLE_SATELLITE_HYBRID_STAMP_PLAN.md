# MOBILE-006: Google Satellite Hybrid GPS Stamp Plan

**Plan ID:** MOBILE-006  
**Created:** 2026-05-28  
**Last Updated:** 2026-05-28  
**Priority:** HIGH  
**Owner:** Techwheels Product + Mobile/Web Dev Team  
**Status:** PENDING (documented for later execution)

---

## Executive Summary

This plan defines a hybrid approach for AutoDoc GPS image stamps:

1. Keep the current always-visible fallback map-style tile as the reliability baseline.
2. Add true Google satellite static imagery for production-quality stamps.
3. Fetch satellite imagery only from a server-side endpoint (never directly from browser/mobile clients).
4. Cache map tiles by rounded coordinates to reduce cost and improve speed.
5. Enforce billing guardrails (hard quota + alerts) from day one.

This gives best visual parity with the reference sample while keeping uploads reliable even during provider/network failures.

---

## Why This Approach

### Benefits

1. Exact visual quality target: Google satellite imagery in stamped output.
2. Reliability: fallback tile remains available when map provider fails.
3. Security: API keys remain server-side only.
4. Cost control: cache + quota + alerts reduce surprise billing risk.

### Constraints

1. Google Maps imagery is not truly free for long-term production.
2. Monthly free credits may cover low-volume testing only.
3. Production usage must be treated as paid and monitored.

---

## Scope

### In Scope

1. Server-side static satellite image fetch pipeline.
2. Signed/proxied map request endpoint.
3. Coordinate-based cache layer.
4. Fallback rendering policy and failure handling.
5. Cost, quota, alerting, and rollout controls.

### Out of Scope

1. Historical restamping of already uploaded photos.
2. Replacing fallback tile design baseline.
3. Client-side direct Google API calls.

---

## Target Architecture

1. Client (web/mobile) sends GPS metadata with upload request.
2. Stamping path asks backend map service for map tile image.
3. Backend map service:
   - rounds coordinates (for cache key)
   - checks cache/storage first
   - on miss, fetches Google Static Maps satellite image with server-side key/signature
   - stores result in cache/storage with TTL
4. Image stamp renderer composes:
   - satellite tile (preferred)
   - fallback tile if fetch/cost/quota/network fails
5. Final stamped image is uploaded and persisted as usual.

---

## Security and Key Management

1. Keep Google API key only in server environment (not frontend/mobile).
2. Restrict key by API scope and project usage.
3. Optionally sign requests with server-held secret where required.
4. Add endpoint-level auth/rate-limiting to prevent abuse.
5. Log request counts and failure reasons for audit.

---

## Cost Control Strategy

1. Configure hard budget and alert thresholds in Google Cloud Billing.
2. Configure quota caps for Static Maps API.
3. Cache map images using rounded coordinate key:
   - suggested precision: 5-6 decimals
   - include zoom/size/maptype in key
4. Reuse cached tiles for repeat locations.
5. If quota is reached, automatically switch to fallback tile (no upload block).

---

## Caching Design

### Cache Key

Use deterministic key format:

`lat_round:lng_round:zoom:size:maptype`

Example precision behavior:

1. 5 decimals: lower cost, higher cache hits, less exact tile center.
2. 6 decimals: more exact center, slightly lower cache hit rate.

### Cache Policy

1. TTL for hot usage (for example 7-30 days based on access pattern).
2. Optional long-term object storage for frequently reused locations.
3. Add cache hit/miss telemetry.

---

## Rollout Plan

### Phase 0 - Prerequisites

1. Google Cloud project with billing enabled.
2. Static Maps API enabled.
3. Budget + quota + alerts configured.
4. API key restrictions validated.

### Phase 1 - Backend Map Proxy

1. Build server endpoint for satellite tile fetch.
2. Add authentication and input validation.
3. Add coordinate rounding and cache lookup/store.
4. Add structured logs (hit/miss/error/quota).

### Phase 2 - Stamp Integration

1. Integrate backend satellite endpoint with stamping flow.
2. Keep existing fallback tile as default backup path.
3. Add deterministic failover order:
   - use satellite on success
   - fallback tile on any failure

### Phase 3 - Testing and Verification

1. Validate image quality against reference sample.
2. Validate no client-exposed map key.
3. Simulate quota exhaustion and confirm fallback behavior.
4. Verify stamping still succeeds under map provider outage.

### Phase 4 - Controlled Rollout

1. Enable for internal users first.
2. Monitor error rate, cache hit rate, and daily map usage.
3. Expand to full rollout after 2-5 days stable metrics.

---

## Acceptance Criteria

1. Stamped images show true Google satellite map when provider is available.
2. No user-visible "map unavailable" text in final stamp output.
3. Fallback tile always renders when satellite fetch fails.
4. No Google API key exposure in client bundles/network calls.
5. Daily usage and cost remain within configured budget threshold.
6. Upload flow does not break when map provider is down.

---

## Risks and Mitigations

1. Risk: Unexpected billing spikes.
   - Mitigation: hard quota + alerts + cache + monitoring.
2. Risk: Provider/network outages.
   - Mitigation: fallback tile with no upload blocking.
3. Risk: Key misuse.
   - Mitigation: server-only keys, restrictions, endpoint auth/rate-limit.
4. Risk: Slow stamp latency.
   - Mitigation: caching and async prefetch for repeated locations.

---

## Operational Monitoring

Track these metrics daily after rollout:

1. Map API requests/day.
2. Cache hit ratio.
3. Average map fetch latency.
4. Satellite fetch failure rate.
5. Fallback usage rate.
6. Cost/day and projected month-end cost.

---

## Decisions Locked by This Plan

1. Hybrid strategy is approved baseline.
2. Fallback tile remains mandatory safety path.
3. Google satellite fetch must be server-side only.
4. Cost guardrails are mandatory before production enablement.

---

## Implementation Notes for Later Session

1. Reuse current GPS metadata pipeline and existing stamp card text formatting.
2. Keep current map tile block dimensions and pin overlay style unless product asks for redesign.
3. Add feature flag for satellite provider enablement (`SATELLITE_MAP_PROVIDER=google|off`).
4. Do not remove fallback code path even after satellite rollout.

---

## Next Action When Execution Starts

1. Create backend satellite proxy endpoint and wire environment variables.
2. Integrate cache and observability.
3. Switch stamp renderer to provider-first with fallback.
4. Execute staging validation before production rollout.
