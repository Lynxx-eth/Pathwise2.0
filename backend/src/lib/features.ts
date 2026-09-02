// Feature flags (PATHWISE 2.0). One registry, read from env, enforced
// server-side — route handlers check these directly, so an ordinary client
// can't re-enable a frozen feature by editing frontend state. The frontend
// learns the current flags from GET /api/config.
import { env } from "./env.js";

export const features = {
  // Phase 0: Leaf Match is frozen. The code stays for a clean future
  // replacement (Wise Path), but the Garden XP economy is disabled.
  leafMatch: env.FEATURE_LEAF_MATCH,
} as const;

/** Shape returned by GET /api/config — safe to expose publicly. */
export function publicFeatures() {
  return { ...features };
}
