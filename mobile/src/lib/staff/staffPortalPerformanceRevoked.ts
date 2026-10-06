/**
 * Staff portal: Avinash load-reduction rollout reverted (pagination RPCs + optimistic UI
 * caused list/action mismatch). Use legacy full-table loads and server-first saves.
 */
export const STAFF_PORTAL_SERVER_FIRST_ACTIONS = true
