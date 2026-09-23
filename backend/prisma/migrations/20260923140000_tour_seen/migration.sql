-- The product tour's "already seen" flag moves from localStorage (per
-- browser — it hid the tour from every later signup on the same device) to
-- the user row.
ALTER TABLE "User" ADD COLUMN "tourSeenAt" DATETIME;

-- Existing accounts are treated as having seen it, so only NEW signups get
-- the tour rather than every current tester being interrupted.
UPDATE "User" SET "tourSeenAt" = CURRENT_TIMESTAMP WHERE "tourSeenAt" IS NULL;
