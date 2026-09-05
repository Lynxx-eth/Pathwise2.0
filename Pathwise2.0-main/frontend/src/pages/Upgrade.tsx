// Monetization screen (Step 13) — real checkout, plan choice, and cancellation.
//
// Doubles as the course-cap wall (Step 3 item 4). With BILLING_PROVIDER=mock the
// whole loop works end-to-end without Stripe keys, so the flow is testable
// before payments go live.
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useApi } from "../lib/useApi";
import {
  SparklesIcon,
  BookOpenIcon,
  TrendingUpIcon,
  BrainCircuitIcon,
  CheckIcon,
} from "../components/icons";
import { InlineError, InlineNotice, Loading } from "../components/states";

interface Plan {
  interval: "monthly" | "annual";
  priceCents: number;
  label: string;
  savingsPct: number;
}

interface PlansResponse {
  plans: Plan[];
  provider: string;
  entitlements: { isPremium: boolean; courseCap: number | null };
  subscription: {
    tier: string;
    interval: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  };
}

const benefits = [
  {
    Icon: BookOpenIcon,
    title: "Unlimited courses",
    body: "Add as many as you're taking",
  },
  {
    Icon: TrendingUpIcon,
    title: "Full analytics history",
    body: "See your whole progress trend, not just the last two weeks",
  },
  {
    Icon: BrainCircuitIcon,
    title: "Cosmetic pet items",
    body: "Pro-only accessories for your companion",
  },
];

function price(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function Upgrade() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { refresh } = useAuth();
  const { data, loading, reload } = useApi<PlansResponse>("/api/billing/plans");

  const [interval, setInterval] = useState<"monthly" | "annual">("annual");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Returning from Stripe Checkout.
  useEffect(() => {
    const status = params.get("status");
    if (status === "success") {
      setNotice("Payment received — welcome to Pathwise Pro.");
      void refresh();
      reload();
    } else if (status === "canceled") {
      setNotice("Checkout canceled — nothing was charged.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  // Mock provider redirects back here with ?mock_checkout=<interval> instead of
  // going out to a payment page.
  useEffect(() => {
    const mock = params.get("mock_checkout");
    if (!mock || busy) return;
    setBusy(true);
    api
      .post("/api/billing/mock/complete", { interval: mock })
      .then(async () => {
        setNotice("Test upgrade complete — Pro features are unlocked.");
        await refresh();
        reload();
      })
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : "Couldn't complete that.")
      )
      .finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  async function checkout() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ url: string; mock: boolean }>(
        "/api/billing/checkout",
        { interval }
      );
      // Both providers hand back a URL; the mock one points back into the app.
      window.location.href = res.url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't start checkout.");
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.post("/api/billing/cancel");
      setNotice(
        "Your plan is canceled. Your courses and progress stay exactly where they are."
      );
      await refresh();
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't cancel.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="auth-wrap">
        <Loading />
      </div>
    );
  }

  const isPremium = data?.entitlements.isPremium ?? false;
  const selected = data?.plans.find((p) => p.interval === interval);
  const annual = data?.plans.find((p) => p.interval === "annual");

  return (
    <div className="auth-wrap">
      <div className="auth-card" style={{ width: 460, textAlign: "center" }}>
        <div className="auth-mascot" style={{ margin: "0 auto 18px auto" }}>
          <SparklesIcon cls="icon-lg" />
        </div>

        {isPremium ? (
          <>
            <h1 style={{ fontSize: 21, marginBottom: 8 }}>You're on Pathwise Pro</h1>
            <p style={{ color: "var(--ink-soft)", fontSize: 13, marginBottom: 22 }}>
              {data?.subscription.cancelAtPeriodEnd
                ? "Your plan ends at the end of the current period. You'll keep Pro until then."
                : `Billed ${data?.subscription.interval ?? "monthly"}.`}
              {data?.subscription.currentPeriodEnd &&
                ` Renews ${new Date(data.subscription.currentPeriodEnd).toLocaleDateString()}.`}
            </p>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 21, marginBottom: 8 }}>
              {params.get("status") || params.get("mock_checkout")
                ? "Pathwise Pro"
                : "You've reached your course limit"}
            </h1>
            <p style={{ color: "var(--ink-soft)", fontSize: 13, marginBottom: 22 }}>
              Free plans cover up to {data?.entitlements.courseCap ?? 3} courses.
              Pro removes the cap and opens up your full history.
            </p>
          </>
        )}

        <InlineError message={error} />
        <InlineNotice message={notice} />

        <div className="card" style={{ textAlign: "left", marginBottom: 22 }}>
          {benefits.map(({ Icon, title, body }, i) => (
            <div
              key={title}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                marginBottom: i < benefits.length - 1 ? 14 : 0,
              }}
            >
              <Icon cls="icon" style={{ color: "var(--primary-dark)", marginTop: 1 }} />
              <div style={{ fontSize: 13 }}>
                <strong>{title}</strong>
                <br />
                <span style={{ color: "var(--ink-soft)" }}>{body}</span>
              </div>
            </div>
          ))}
        </div>

        {!isPremium && data && (
          <>
            <div
              className="segmented"
              role="group"
              aria-label="Billing interval"
              style={{ marginBottom: 18 }}
            >
              {data.plans.map((p) => (
                <button
                  key={p.interval}
                  onClick={() => setInterval(p.interval)}
                  aria-pressed={interval === p.interval}
                >
                  {p.label}
                  {p.savingsPct > 0 && ` · save ${p.savingsPct}%`}
                </button>
              ))}
            </div>

            <button
              className="btn btn-primary btn-block"
              style={{ marginBottom: 10 }}
              onClick={checkout}
              disabled={busy}
            >
              {busy
                ? "Starting…"
                : `Upgrade — ${price(selected?.priceCents ?? 0)}/${
                    interval === "annual" ? "yr" : "mo"
                  }`}
            </button>

            {data.provider === "mock" && (
              <p style={{ fontSize: 11.5, color: "var(--ink-faint)", marginBottom: 10 }}>
                Test mode — no payment will be taken.
              </p>
            )}

            {interval === "monthly" && annual && annual.savingsPct > 0 && (
              <p style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 10 }}>
                The annual plan saves {annual.savingsPct}%.
              </p>
            )}
          </>
        )}

        {isPremium && !data?.subscription.cancelAtPeriodEnd && (
          <button
            className="btn btn-ghost btn-block"
            style={{ marginBottom: 10 }}
            onClick={cancel}
            disabled={busy}
          >
            {busy ? "Working…" : "Cancel plan"}
          </button>
        )}

        {isPremium && (
          <p
            style={{
              fontSize: 11.5,
              color: "var(--ink-faint)",
              marginBottom: 10,
              display: "flex",
              gap: 6,
              justifyContent: "center",
            }}
          >
            <CheckIcon cls="icon-sm" /> Cancelling never deletes your courses or
            progress.
          </p>
        )}

        <button
          onClick={() => navigate("/courses")}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 12.5,
            color: "var(--ink-soft)",
            fontWeight: 600,
          }}
        >
          {isPremium ? "Back to courses" : "Not now"}
        </button>
      </div>
    </div>
  );
}
