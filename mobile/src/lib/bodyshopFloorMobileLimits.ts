/**
 * Mobile Bodyshop Floor list bounds (avoid Hermes OOM / white screen).
 *
 * Prod snapshot 2026-10-09 (all dealers, DB totals):
 * - Live on floor (stage 11–14): 44 (Floor 2: 27, Floor 3: 17)
 * - Active pipeline (not closed): 739
 */
export const BODYSHOP_FLOOR_MOBILE_MAX_CARS_LIVE = 80
export const BODYSHOP_FLOOR_MOBILE_MAX_CARS_PIPELINE = 400

/** RPC pages × 100 rows/page — live needs ≤1 page; pipeline capped below full history. */
export const BODYSHOP_FLOOR_MOBILE_MAX_RPC_PAGES_LIVE = 2
export const BODYSHOP_FLOOR_MOBILE_MAX_RPC_PAGES_ALL = 5

/** Reception model/phone enrich — match max cars we ever load on mobile. */
export const BODYSHOP_FLOOR_MOBILE_MAX_RECEPTION_ENRICH = 400

/** @deprecated use BODYSHOP_FLOOR_MOBILE_MAX_CARS_LIVE or _PIPELINE */
export const BODYSHOP_FLOOR_MOBILE_MAX_CARS = BODYSHOP_FLOOR_MOBILE_MAX_CARS_PIPELINE
