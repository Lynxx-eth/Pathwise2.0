// Product analytics for the Success Metrics (Step 16 item 4).
//
// Deliberately a plain table rather than a third-party SDK: the metrics we care
// about at launch (activation, upload completion, quiz completion, retention,
// mastery growth, premium conversion) are all answerable with SQL, and this
// avoids shipping user data to another vendor before the privacy review.
import { prisma } from "./prisma.js";

export type EventName =
  // Activation funnel
  | "signup"
  // Guest mode (PATHWISE 2.0 Phase 1): sampling the product, then converting.
  | "guest_started"
  | "guest_claimed"
  | "privacy_accepted"
  | "course_created"
  | "upload_started"
  | "upload_completed"
  | "upload_failed"
  | "upload_rejected"
  | "knowledge_map_built"
  // Core loop
  | "quiz_started"
  | "quiz_completed"
  | "quiz_answer"
  | "socratic_started"
  | "socratic_message"
  | "socratic_ended"
  | "socratic_leak_blocked"
  | "mastery_changed"
  | "review_completed"
  // Gamification
  | "xp_awarded"
  | "rank_up"
  | "badge_earned"
  | "streak_freeze_used"
  | "minigame_completed"
  | "shop_purchase"
  // Monetization
  | "upgrade_viewed"
  | "checkout_started"
  | "premium_activated"
  | "premium_canceled"
  // Growth
  | "referral_prompt_shown"
  | "referral_signup"
  | "referral_rewarded"
  // Retention
  | "session_start"
  | "notification_sent";

/**
 * Record an event. Never throws — analytics must not be able to fail a request.
 */
export async function track(
  userId: string | null,
  name: EventName,
  props: Record<string, unknown> = {}
): Promise<void> {
  try {
    await prisma.analyticsEvent.create({
      data: { userId, name, propsJson: JSON.stringify(props) },
    });
  } catch (err) {
    console.error(`⚠️  analytics: failed to record ${name}`, err);
  }
}

export interface FunnelSummary {
  signups: number;
  privacyAccepted: number;
  coursesCreated: number;
  uploadsCompleted: number;
  quizzesCompleted: number;
  premiumActivated: number;
}

/** The activation funnel, for the ops dashboard. */
export async function funnel(sinceDays = 30): Promise<FunnelSummary> {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const rows = await prisma.analyticsEvent.groupBy({
    by: ["name"],
    where: { createdAt: { gte: since } },
    _count: { _all: true },
  });
  const count = (n: EventName) =>
    rows.find((r) => r.name === n)?._count._all ?? 0;

  return {
    signups: count("signup"),
    privacyAccepted: count("privacy_accepted"),
    coursesCreated: count("course_created"),
    uploadsCompleted: count("upload_completed"),
    quizzesCompleted: count("quiz_completed"),
    premiumActivated: count("premium_activated"),
  };
}
