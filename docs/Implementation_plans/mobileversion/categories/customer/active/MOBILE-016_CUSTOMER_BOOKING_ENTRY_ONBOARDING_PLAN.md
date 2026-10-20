# Implementation Plan: MOBILE-016

**Plan ID:** MOBILE-016
**Created:** 2026-10-20
**Priority:** HIGH
**Owner:** Mobile Team + Platform

---

## Executive Summary

The service booking screens (`booking.tsx`, `my-bookings.tsx`) were built by Avinash on 18 Sep 2026 (commit `d67d8e43`) but are unreachable — they are registered with `href: null` in `_layout.tsx` and there is no entry point on the customer dashboard. Additionally, new customers who have never visited the workshop cannot log in at all because `customer_start_session` throws a hard DB exception when no vehicle is found.

This plan wires the full flow end-to-end: fix the login gate, add a vehicle self-registration screen, and add dashboard entry tiles.

**Risk Level:** 🟡 MEDIUM
**Estimated Duration:** 3–4 working days
**Rollback Strategy:** Revert the DB migration for `customer_start_session` (exception behaviour is restored). The register-vehicle RPC and source column are additive and safe to leave. Remove the two ActionTiles from `index.tsx`.

---

## Objectives

1. New customers (no DMS history) can log in with their mobile number and register their vehicle.
2. Existing customers see a "Book a Service" and "My Bookings" entry tile on the dashboard.
3. A user with multiple vehicles can register additional ones at any time.
4. No OTP, no SMS, no third-party auth — mobile number is username and password (existing pattern).

---

## Piece 1 — Fix the Login Gate

### Problem

`customer_start_session` (line 8520 in `supabase/backups/full_metadata.sql`) throws a hard exception when no vehicle is found:

```sql
IF v_vehicles IS NULL OR jsonb_array_length(v_vehicles) = 0 THEN
  RAISE EXCEPTION 'No vehicle found for this mobile number.';
END IF;
```

New users with no workshop history cannot get a session token.

### DB fix — new migration

**File:** `supabase/migrations/<ts>_customer_session_allow_new_user.sql`

Remove the exception. Replace with:

```sql
IF v_vehicles IS NULL THEN
  v_vehicles := '[]'::jsonb;
END IF;
```

Add `new_user` boolean to the return payload:

```sql
RETURN jsonb_build_object(
  'session_token', v_token,
  'expires_at',   v_expires,
  'phone',        v_user,
  'vehicles',     v_vehicles,
  'new_user',     (jsonb_array_length(v_vehicles) = 0),
  'terms',        v_terms
);
```

### App fix — `mobile/src/context/CustomerSessionContext.tsx`

In the `signIn` callback, after `setVehicles(result.data.vehicles)`:

```ts
const isNewUser = result.data.vehicles.length === 0
return { needsTerms, isNewUser }
```

Also add `addVehicle` to the context (used by register-vehicle screen):

```ts
const addVehicle = useCallback((v: CustomerVehicle) => {
  setVehicles(prev => [...prev, v])
  setSelectedReg(v.reg_number)
}, [])
```

Expose `addVehicle` on the `CustomerSessionContextType` interface.

### App fix — `mobile/src/app/(customer-auth)/login.tsx`

Handle the new `isNewUser` flag after `signIn`:

```ts
if (result.error) {
  setError(result.error)
} else if (result.needsTerms) {
  router.replace('/(customer-auth)/terms')
} else if (result.isNewUser) {
  router.replace('/(customer)/register-vehicle')   // NEW
} else {
  router.replace('/(customer)')
}
```

---

## Piece 2 — Register Vehicle Screen

### New screen

**File:** `mobile/src/app/(customer)/register-vehicle.tsx`

Uses existing components: `CustomerScreen`, `CustomerCard`, `PrimaryButton`, `CustomerToast`.
Branch chip picker reused from `booking.tsx` section 4 (same `customerFetchBranches()` call).

**Form fields:**

| Field | Input | Required |
|---|---|---|
| Registration Number | TextInput (auto-uppercase, alphanumeric) | Yes |
| Owner Name | TextInput | Yes |
| Mobile | Display only — auto-filled from session `phone` | — |
| Vehicle Model | ScrollView chip picker (Tata model list from constants) | Yes |
| Variant | TextInput | No |
| Approx KM Reading | TextInput (numeric keyboard) | No |
| Branch Preference | Chip picker — same as `booking.tsx` | No |

**On submit:** calls `customerRegisterVehicle(token, payload)` → on success calls `addVehicle(vehicle)` on context → navigates to `/(customer)/booking`.

**Add Another Vehicle path:** same screen reached from My Bookings. If the user already has vehicles (re-entry path), show a "Back to Dashboard" button instead of no back navigation.

### Register route in `_layout.tsx`

Add to `mobile/src/app/(customer)/_layout.tsx`:

```tsx
<Tabs.Screen name="register-vehicle" options={{ href: null, title: 'Register Vehicle' }} />
```

### DB — add source column to vehicles table

**File:** `supabase/migrations/<ts>_vehicles_add_source_column.sql`

```sql
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'dms';

COMMENT ON COLUMN public.vehicles.source IS
  'Origin: dms = imported from DMS/TML feed, customer_self_register = added via customer portal self-registration.';
```

### DB — new RPC: `customer_register_vehicle`

**File:** `supabase/migrations/<ts>_customer_register_vehicle_rpc.sql`

Behaviour:
- Validates session token via `customer_require_session`
- Normalises reg number via `customer_norm_reg`
- Inserts into `vehicles` with `source = 'customer_self_register'`
- Uses `ON CONFLICT (reg_number) DO NOTHING` — idempotent (if DMS record already exists, returns existing row)
- Returns the vehicle row as JSON matching the `CustomerVehicle` shape

```sql
CREATE FUNCTION public.customer_register_vehicle(
  p_session_token text,
  p_reg_number    text,
  p_owner_name    text,
  p_model         text,
  p_variant       text    DEFAULT NULL,
  p_km_reading    integer DEFAULT NULL,
  p_branch        text    DEFAULT NULL
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_sess   RECORD;
  v_reg    text;
  v_row    public.vehicles%ROWTYPE;
BEGIN
  v_sess := public.customer_require_session(p_session_token);
  v_reg  := public.customer_norm_reg(p_reg_number);
  IF v_reg IS NULL THEN
    RAISE EXCEPTION 'Invalid registration number format.';
  END IF;

  INSERT INTO public.vehicles (
    reg_number, owner_name, owner_phone, model, dealer_code,
    source
  ) VALUES (
    v_reg,
    trim(p_owner_name),
    v_sess.phone,
    trim(p_model),
    'SELF',
    'customer_self_register'
  )
  ON CONFLICT (reg_number) DO NOTHING;

  SELECT * INTO v_row FROM public.vehicles WHERE reg_number = v_reg;

  RETURN jsonb_build_object(
    'reg_number',  v_row.reg_number,
    'owner_name',  v_row.owner_name,
    'owner_phone', v_row.owner_phone,
    'model',       v_row.model,
    'source',      v_row.source
  );
END;
$$;

COMMENT ON FUNCTION public.customer_register_vehicle IS
  'MOBILE-016: Self-registration of a vehicle by a new customer via the customer portal. Inserts into vehicles with source=customer_self_register. Idempotent on conflict.';
```

### New API function in `mobile/src/lib/api/customerPortal.ts`

Add after `customerSubmitBooking`:

```ts
export async function customerRegisterVehicle(
  token: string,
  payload: {
    reg_number: string
    owner_name: string
    model: string
    variant?: string
    km_reading?: number
    branch?: string
  }
): Promise<CustomerVehicle> {
  const { data, error } = await cpRpc('customer_register_vehicle', {
    p_session_token: token,
    p_reg_number:   payload.reg_number,
    p_owner_name:   payload.owner_name,
    p_model:        payload.model,
    p_variant:      payload.variant ?? null,
    p_km_reading:   payload.km_reading ?? null,
    p_branch:       payload.branch ?? null,
  })
  if (error) throw new Error(rpcErrorMessage(error, 'Could not register vehicle.'))
  return data as CustomerVehicle
}
```

### Add Another Vehicle entry point on `my-bookings.tsx`

Add a secondary link below the "+ Book New Service" button in the header row:

```tsx
<TouchableOpacity
  onPress={() => router.push('/(customer)/register-vehicle')}
  className="bg-slate-100 px-3 py-2 rounded-xl border border-slate-200"
>
  <Text className="text-slate-600 text-xs font-bold">+ Add Vehicle</Text>
</TouchableOpacity>
```

---

## Piece 3 — Dashboard Entry Tiles

### File: `mobile/src/app/(customer)/index.tsx`

Add **after** the workshop record card, always visible:

```tsx
{/* ── BOOKING ENTRY TILES ── */}
<View style={{ marginBottom: 14, gap: 10 }}>
  <ActionTile
    icon="calendar"
    title="Book a Service"
    subtitle="Schedule maintenance, repairs or doorstep pickup"
    onPress={() => router.push('/(customer)/booking')}
  />
  <ActionTile
    icon="list"
    title="My Bookings"
    subtitle="View appointment status and history"
    onPress={() => router.push('/(customer)/my-bookings')}
  />
</View>
```

Check that `calendar` and `list` are present in the `IconName` union in `mobile/src/components/ui/Icon.tsx`. Add them if missing.

---

## DB Migration File Order

Run in this order:

1. `<ts>_customer_session_allow_new_user.sql`
2. `<ts>_vehicles_add_source_column.sql`
3. `<ts>_customer_register_vehicle_rpc.sql`

---

## Complete Flow

```
Customer opens app
    |
    v
Login  (mobile number = username = password)
    |
    +-- vehicles found (existing user) ──> Dashboard
    |                                          |
    |                             [Book a Service tile] ──> booking.tsx
    |                             [My Bookings tile]    ──> my-bookings.tsx
    |                             [My Bookings > + Add Vehicle] ──> register-vehicle.tsx
    |
    +-- no vehicles (new user) ──> register-vehicle.tsx
                                         |
                                   Vehicle saved to DB
                                   (vehicles table, source=customer_self_register)
                                         |
                                   ──> booking.tsx (direct, vehicle pre-selected)
```

---

## What Does NOT Need to Change

| File / Component | Reason |
|---|---|
| `booking.tsx` | No changes needed |
| `my-bookings.tsx` | Only the "+ Add Vehicle" button addition |
| `terms.tsx` | New users still go through terms flow (existing path) |
| `service_bookings` table | Already has all fields for self-registered vehicles |
| `customer_collect_vehicles` RPC | Already reads from `vehicles` table — picks up `source=customer_self_register` rows automatically |
| Multi-vehicle switcher | Already built in `CustomerSessionContext` |
| `CustomerSessionContext` vehicles[] | Already an array — supports multiple vehicles |

---

## Web Booking — Next Step (WEB-SERVICE-001)

The customer should also be able to book a service via **https://www.techwheels.in/service** (Techwheels Sales project — `/Users/vkbin/TECHWHEELS-WEB`).

**Current state:** `ServicePage.jsx` is a static marketing page with a placeholder comment: *"Online service booking will be enabled in upcoming phases."* No form, no DB connection.

**Approach:** Add a public no-login booking form directly to `ServicePage.jsx` in the Sales project. It connects to the **Service project Supabase** (different URL/key). No `customer_start_session` needed — visitor enters mobile + reg number + service type + date, which creates a `service_bookings` row with `booking_source = 'Website'`. Staff see it on `/service-booking` under the Website source filter.

**Dependency:** Implement MOBILE-016 first — the DB RPCs it creates (`customer_start_session` fixed, `customer_register_vehicle`) are prerequisites. Once MOBILE-016 is live, raise WEB-SERVICE-001.

---

## Notes

- A self-registered vehicle (source = `customer_self_register`) will appear in `customer_collect_vehicles` on next login automatically — that function queries the `vehicles` table directly and deduplicates by `reg_key`. No change needed to that function.
- If a customer self-registers a vehicle that later gets a DMS record (after a workshop visit), the `customer_collect_vehicles` deduplication logic ensures it appears only once. The reception entry (`source = 'reception'`) takes priority (src_rank = 1 vs 2 for vehicles table).
- `dealer_code` is set to `'SELF'` for self-registered vehicles — staff can identify and verify these from the reception screen if needed.
