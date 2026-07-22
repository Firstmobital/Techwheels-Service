# SUPABASE-004 — IDSPay Service Documentation Audit

**Plan ID:** SUPABASE-004  
**Audit date:** 2026-07-22  
**Auditor:** Platform Team (planning pass)  
**Source document:** `ServiceDocumentation.pdf` (IDSPay API Technical Documentation v1.0, 8 pages)  
**Operator copy reviewed:** `/Users/vkbin/Downloads/ServiceDocumentation.pdf`  
**Service:** RC Advance Verification (API category v1.0)

---

## 1) Document Summary

| Field | PDF value | Matches plan §1.1 |
|-------|-----------|-------------------|
| Service name | RC Advance Verification | Yes |
| HTTP method | POST | Yes |
| Endpoint path | `/srv2/validation/rc` | Yes |
| Production base URL | `https://javabackend.idspay.in/api/v1/prod` | Yes |
| UAT base URL | `https://javabackend.idspay.in/api/v1/uat` | Yes |
| Full prod URL | `{prod base}/srv2/validation/rc` | Yes |
| Content-Type | `application/json` | Yes |
| Transport | HTTPS (mandatory) | Plan must enforce HTTPS URL only |

**Product description (PDF):** Returns vehicle + owner details from RC number, including insurance, financier, vehicle, and owner (address, name, father's name).

---

## 2) Request Body (PDF + dashboard)

| Key | Requirement | Notes |
|-----|-------------|--------|
| `api_id` | Mandatory | **Login ID** is the API ID (example pattern `APID03XXXX`; dashboard instance `APID2175`) |
| `api_key` | Mandatory | From **IP Whitelist** menu (example pattern may include `&`; UUID format also shown in samples) |
| `token_id` | Mandatory | Issued **after IP is whitelisted**; **different Token ID per whitelisted IP address** |
| `reg_no` | Mandatory | Vehicle registration number |

**Environment rule (PDF + dashboard):** Same credentials for Production and UAT; **only base URL changes** with environment.

**Account rule (operator + PDF):** API account must be **activated** before use. Business Wallet must have balance (dashboard; not detailed in PDF body).

---

## 3) Success Response (PDF pages 2–5)

Structure aligns with plan §1.7:

- Top-level: `status` object (`code`, `type`, `message`), duplicate string `message`, object `data`.
- Success example: `status.code` = 200, `status.type` = `success`.
- `data` includes all fields already listed in plan §1.7 / §5.0.1 (`split_*_address`, `challan_details`, `rto_code`, `financed`, etc.).

**Plan implication:** Success detection should use `status.code === 200` and populated `data` (not HTTP status alone).

---

## 4) Error Response (PDF pages 6–7)

PDF labels sample as **Error Code: N/A** with message **Verification Failed.**

Body matches plan §1.8:

- `success`: false  
- `status_code`: 422  
- `message`: Verification Failed.  
- `message_code`: `verification_failed`  
- `data`: alternate schema (`rc_number`, `vehicle_chasi_number`, `maker_model`, `fuel_type`, `color`, …, `response_metadata`)

**Plan implication:** Treat as failed verification; do not map to §5.0.1 success columns unless product owner opts in (§12 G5).

---

## 5) Documented Error Codes (PDF page 8)

| Error code (PDF) | HTTP status (PDF) | Description |
|------------------|-------------------|-------------|
| `UNKNOWN_ERROR` | N/A | (no description text) |
| (unnamed) | N/A | Verification Failed. |

**Audit finding:** Error catalogue is **minimal**. Implementation must still handle:

- Network / TLS failures  
- Non-JSON responses  
- Auth / IP whitelist rejections (not formally documented in PDF)  
- Wallet / account inactive (dashboard ops)

Log upstream status + body shape; map to safe edge errors with `provider` slug.

---

## 6) Basic Integration (PDF page 8)

| Rule | Text |
|------|------|
| API key | Valid API key issued by IDSPay |
| HTTPS | All requests via HTTPS |
| Content-Type | `application/json` |
| Testing | Use **UAT** before production |

**Plan alignment:** Phase 3 should include UAT curl proof before `IDSPAY_ENV=prod` default in production project.

---

## 7) Critical Gap — IP Whitelist vs Supabase Edge

PDF + operator notes require:

1. **IP Whitelist** before `token_id` is valid.  
2. **Token ID varies by whitelisted IP.**

Supabase Edge Functions invoke IDSPay from **Supabase-managed egress IPs** (region-dependent; not the same as developer laptop IP used in dashboard “Test API”).

| Risk | Mitigation options (choose before Phase 3) |
|------|---------------------------------------------|
| Edge egress IP not whitelisted | Whitelist Supabase project egress IPs with IDSPay (confirm current list with Supabase support/docs for `ap-south-1`) |
| Token tied to wrong IP | Use `token_id` issued for the **same IP** Edge uses outbound |
| Egress IP changes | Static egress (enterprise networking), fixed proxy/VPS caller, or periodic whitelist updates |
| Dashboard test works but Edge fails | Expected if only office IP whitelisted |

**Phase 0 exit:** Document outbound IP(s) from a test Edge deploy (e.g. call a echo-IP diagnostic or IDSPay support) and register in IDSPay IP Whitelist menu.

---

## 8) PDF vs Plan — Consistency Matrix

| Topic | PDF | Plan SUPABASE-004 | Status |
|-------|-----|-------------------|--------|
| Endpoint path | `/srv2/validation/rc` | Same | OK |
| Body auth fields | 4 keys | Same | OK |
| Success `data` fields | Full sample | §1.7 + §5.0.1 | OK |
| Failure shape | §1.8 sample | §1.8 | OK |
| `rto_cache` persistence | Not in PDF | §5.0 (project requirement) | OK (app layer) |
| Techwheels normalized envelope | Not in PDF | §1.6 (reference v3) | OK (app layer) |
| IP whitelist / token per IP | Implied by operator notes | **Added §1.10 + §12 G12** | Needs ops |
| HTTP status on 422 failure | Not stated | §12 G4 | Needs live trace |

---

## 9) Recommended Evidence Artifacts (execution)

1. Redacted PDF archived under this folder (optional): `IDSPay_RC_Advance_Verification_ServiceDocumentation_v1.0.pdf`  
2. Screenshot: IP Whitelist menu showing whitelisted IP(s) + matching Token ID  
3. Phase 3 curl: UAT then prod, success + intentional failure reg  
4. Log line: Edge outbound IP used for first successful prod call  

---

## 10) Contacts (PDF footer)

- Website: https://www.idspay.in  
- API user portal: https://www.apiuser.idspay.in/SignUpForm  
- Support: support@idspay.in  
