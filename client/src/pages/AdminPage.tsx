import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import {
  Shield, Trash2, UserCheck, UserX, ArrowLeft,
  Users, ShieldCheck, Crown, UserCircle, Calendar,
  ChevronDown, X, Check, Zap, DollarSign, ArrowDownUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TokenStats {
  totalInputTokens: number;
  totalOutputTokens: number;
  byUser: { userId: string; username: string; inputTokens: number; outputTokens: number }[];
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function estimateCost(inputTokens: number, outputTokens: number): string {
  const costUsd = (inputTokens / 1000) * 0.003 + (outputTokens / 1000) * 0.015;
  if (costUsd < 0.001) return "< $0.001";
  if (costUsd < 1) return `$${costUsd.toFixed(3)}`;
  return `$${costUsd.toFixed(2)}`;
}

interface AdminUser {
  id: string;
  username: string;
  isAdmin: boolean;
  plan: "free" | "pro";
  planExpiresAt: string | null;
  createdAt: string;
}

type Duration = "1w" | "1m" | "1y" | "permanent" | "custom";

const DURATION_OPTIONS: { value: Duration; label: string }[] = [
  { value: "1w", label: "1 Week" },
  { value: "1m", label: "1 Month" },
  { value: "1y", label: "1 Year" },
  { value: "permanent", label: "Permanent" },
  { value: "custom", label: "Custom date" },
];

function computeExpiry(duration: Duration, customDate: string): Date | null {
  const now = new Date();
  if (duration === "1w") return new Date(now.getTime() + 7 * 86400000);
  if (duration === "1m") { const d = new Date(now); d.setMonth(d.getMonth() + 1); return d; }
  if (duration === "1y") { const d = new Date(now); d.setFullYear(d.getFullYear() + 1); return d; }
  if (duration === "permanent") return null;
  if (duration === "custom" && customDate) return new Date(customDate);
  return null;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

function PlanBadge({ plan, expiresAt }: { plan: string; expiresAt: string | null }) {
  const expired = plan === "pro" && isExpired(expiresAt);
  if (plan === "pro" && !expired) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-500 ring-1 ring-amber-500/25">
        <Crown className="w-2.5 h-2.5" /> Pro
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-muted-foreground ring-1 ring-border">
      <UserCircle className="w-2.5 h-2.5" /> Free
    </span>
  );
}

function PlanManager({ user, currentUserId, onClose }: { user: AdminUser; currentUserId: string; onClose: () => void }) {
  const [selectedPlan, setSelectedPlan] = useState<"free" | "pro">(user.plan);
  const [duration, setDuration] = useState<Duration>("1m");
  const [customDate, setCustomDate] = useState("");

  const planMutation = useMutation({
    mutationFn: ({ plan, expiresAt }: { plan: "free" | "pro"; expiresAt: string | null }) =>
      apiRequest("PATCH", `/api/admin/users/${user.id}/plan`, { plan, expiresAt }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      onClose();
    },
  });

  const handleApply = () => {
    if (selectedPlan === "free") {
      planMutation.mutate({ plan: "free", expiresAt: null });
    } else {
      const expiry = computeExpiry(duration, customDate);
      planMutation.mutate({ plan: "pro", expiresAt: expiry ? expiry.toISOString() : null });
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-border bg-background p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Manage Plan</p>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Plan selector */}
      <div className="flex rounded-lg bg-muted p-1 gap-1">
        {(["free", "pro"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setSelectedPlan(p)}
            className={cn(
              "flex-1 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5",
              selectedPlan === p
                ? p === "pro"
                  ? "bg-amber-500/15 text-amber-500 ring-1 ring-amber-500/30"
                  : "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {p === "pro" ? <Crown className="w-3 h-3" /> : <UserCircle className="w-3 h-3" />}
            {p === "pro" ? "Pro" : "Free"}
          </button>
        ))}
      </div>

      {/* Duration (only for Pro) */}
      {selectedPlan === "pro" && (
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground font-medium">Duration</p>
          <div className="grid grid-cols-2 gap-1.5">
            {DURATION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setDuration(opt.value)}
                className={cn(
                  "py-1.5 px-2 rounded-lg text-xs font-medium border transition-all text-left flex items-center gap-1.5",
                  duration === opt.value
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
                )}
              >
                {duration === opt.value && <Check className="w-3 h-3 flex-shrink-0" />}
                {opt.label}
              </button>
            ))}
          </div>

          {duration === "custom" && (
            <div>
              <input
                type="date"
                value={customDate}
                min={new Date().toISOString().split("T")[0]}
                onChange={(e) => setCustomDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          )}

          {duration !== "custom" && (
            <p className="text-[11px] text-muted-foreground">
              Expires:{" "}
              <span className="font-semibold text-foreground">
                {duration === "permanent" ? "Never" : formatDate(computeExpiry(duration, "")?.toISOString() ?? null)}
              </span>
            </p>
          )}
        </div>
      )}

      {planMutation.isError && (
        <p className="text-xs text-destructive">{(planMutation.error as Error).message}</p>
      )}

      <button
        onClick={handleApply}
        disabled={planMutation.isPending || (selectedPlan === "pro" && duration === "custom" && !customDate)}
        data-testid={`button-apply-plan-${user.id}`}
        className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {planMutation.isPending ? "Saving…" : "Apply Plan"}
      </button>
    </div>
  );
}

export default function AdminPage() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const [openPlanId, setOpenPlanId] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && (!user || !user.isAdmin)) navigate("/");
  }, [user, isLoading]);

  const { data: users = [], isLoading: usersLoading } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
    queryFn: () => fetch("/api/admin/users", { credentials: "include" }).then((r) => r.json()),
    enabled: !!user?.isAdmin,
  });

  const { data: tokenStats } = useQuery<TokenStats>({
    queryKey: ["/api/admin/stats/tokens"],
    queryFn: () => fetch("/api/admin/stats/tokens", { credentials: "include" }).then((r) => r.json()),
    enabled: !!user?.isAdmin,
  });

  const toggleAdminMutation = useMutation({
    mutationFn: ({ id, isAdmin }: { id: string; isAdmin: boolean }) =>
      apiRequest("PATCH", `/api/admin/users/${id}/admin`, { isAdmin }).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/users/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] }),
  });

  if (isLoading || !user?.isAdmin) return null;

  const totalUsers = users.length;
  const adminCount = users.filter((u) => u.isAdmin).length;
  const proCount = users.filter((u) => u.plan === "pro" && !isExpired(u.planExpiresAt)).length;
  const freeCount = totalUsers - proCount;

  const stats = [
    { label: "Total Users", value: totalUsers, icon: Users, color: "text-blue-500", bg: "bg-blue-500/10" },
    { label: "Pro Users", value: proCount, icon: Crown, color: "text-amber-500", bg: "bg-amber-500/10" },
    { label: "Free Users", value: freeCount, icon: UserCircle, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: "Admins", value: adminCount, icon: ShieldCheck, color: "text-violet-500", bg: "bg-violet-500/10" },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/60 bg-card/60 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate("/")}
            data-testid="button-back-home"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Chat
          </button>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <span className="font-semibold text-foreground text-sm">Admin Dashboard</span>
          </div>
          <div className="ml-auto text-xs text-muted-foreground">
            Signed in as <span className="font-semibold text-foreground">{user.username}</span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-border bg-card p-4 flex items-center gap-3">
              <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0", stat.bg)}>
                <stat.icon className={cn("w-4.5 h-4.5", stat.color)} style={{ width: 18, height: 18 }} />
              </div>
              <div>
                <p className="text-xl font-bold text-foreground">{stat.value}</p>
                <p className="text-[11px] text-muted-foreground font-medium leading-tight">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Token Usage Section */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              <h2 className="font-semibold text-foreground">Token Usage</h2>
            </div>
            <span className="text-[11px] text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
              ≈ Sonnet pricing — estimate only
            </span>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-3 gap-4 mb-0">
              {/* Input tokens */}
              <div className="rounded-xl border border-border/50 bg-muted/20 p-4" data-testid="stat-input-tokens">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <ArrowDownUp className="w-3.5 h-3.5 text-blue-500" />
                  </div>
                  <span className="text-xs text-muted-foreground font-medium">Input Tokens</span>
                </div>
                <p className="text-2xl font-bold text-foreground">
                  {tokenStats ? fmtTokens(tokenStats.totalInputTokens) : "—"}
                </p>
              </div>
              {/* Output tokens */}
              <div className="rounded-xl border border-border/50 bg-muted/20 p-4" data-testid="stat-output-tokens">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-lg bg-violet-500/10 flex items-center justify-center">
                    <Zap className="w-3.5 h-3.5 text-violet-500" />
                  </div>
                  <span className="text-xs text-muted-foreground font-medium">Output Tokens</span>
                </div>
                <p className="text-2xl font-bold text-foreground">
                  {tokenStats ? fmtTokens(tokenStats.totalOutputTokens) : "—"}
                </p>
              </div>
              {/* Estimated cost */}
              <div className="rounded-xl border border-border/50 bg-muted/20 p-4" data-testid="stat-estimated-cost">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
                  </div>
                  <span className="text-xs text-muted-foreground font-medium">Est. Cost</span>
                </div>
                <p className="text-2xl font-bold text-foreground">
                  {tokenStats ? estimateCost(tokenStats.totalInputTokens, tokenStats.totalOutputTokens) : "—"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Plan Features Reference */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            {
              title: "Free Plan",
              icon: UserCircle,
              color: "text-muted-foreground",
              ring: "ring-border",
              bg: "bg-card",
              features: [
                "Limited messages per day (coming soon)",
                "Access to Fast model only (coming soon)",
                "Standard response speed",
                "Basic file attachments",
              ],
            },
            {
              title: "Pro Plan",
              icon: Crown,
              color: "text-amber-500",
              ring: "ring-amber-500/30",
              bg: "bg-amber-500/5",
              features: [
                "Unlimited messages",
                "Access to all models (Auto, Powerful, Creative)",
                "Priority response speed",
                "Advanced file & image attachments",
              ],
            },
          ].map((tier) => (
            <div key={tier.title} className={cn("rounded-2xl border p-4 ring-1", tier.bg, tier.ring)}>
              <div className="flex items-center gap-2 mb-3">
                <tier.icon className={cn("w-4 h-4", tier.color)} />
                <span className={cn("font-semibold text-sm", tier.color)}>{tier.title}</span>
                {tier.title === "Pro Plan" && (
                  <span className="ml-auto text-[10px] font-bold text-amber-500 bg-amber-500/15 px-1.5 py-0.5 rounded-full">PREMIUM</span>
                )}
              </div>
              <ul className="space-y-1.5">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Check className={cn("w-3 h-3 mt-0.5 flex-shrink-0", tier.color)} />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Users table */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border/60 flex items-center justify-between">
            <h2 className="font-semibold text-foreground">All Users</h2>
            <span className="text-xs text-muted-foreground">{totalUsers} total</span>
          </div>

          {usersLoading ? (
            <div className="flex items-center justify-center py-16 gap-2">
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-muted-foreground" />
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-muted-foreground" />
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-muted-foreground" />
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground text-sm">No users yet.</div>
          ) : (
            <div className="divide-y divide-border/50">
              {users.map((u) => {
                const expired = u.plan === "pro" && isExpired(u.planExpiresAt);
                const activePlan = u.plan === "pro" && !expired ? "pro" : "free";
                return (
                  <div key={u.id} data-testid={`row-user-${u.id}`} className="px-6 py-4">
                    <div className="flex items-center gap-4">
                      {/* Avatar */}
                      <div className={cn(
                        "w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0",
                        u.isAdmin
                          ? "bg-violet-500/15 text-violet-500 ring-1 ring-violet-500/30"
                          : activePlan === "pro"
                            ? "bg-amber-500/15 text-amber-500 ring-1 ring-amber-500/30"
                            : "bg-muted text-muted-foreground"
                      )}>
                        {u.username[0].toUpperCase()}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-foreground text-sm truncate">{u.username}</span>
                          {u.isAdmin && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-violet-500/15 text-violet-500 ring-1 ring-violet-500/20">
                              <Shield className="w-2.5 h-2.5" /> Admin
                            </span>
                          )}
                          <PlanBadge plan={activePlan} expiresAt={u.planExpiresAt} />
                          {u.id === user.id && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-primary/15 text-primary">You</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            Joined {formatDate(u.createdAt)}
                          </span>
                          {u.plan === "pro" && (
                            <span className={cn(
                              "text-[11px] flex items-center gap-1",
                              expired ? "text-destructive/70" : "text-muted-foreground"
                            )}>
                              <Crown className="w-3 h-3" />
                              {expired
                                ? "Pro expired " + formatDate(u.planExpiresAt)
                                : u.planExpiresAt
                                  ? "Pro until " + formatDate(u.planExpiresAt)
                                  : "Pro — no expiry"}
                            </span>
                          )}
                          {(() => {
                            const ut = tokenStats?.byUser.find((b) => b.userId === u.id);
                            if (!ut || (ut.inputTokens === 0 && ut.outputTokens === 0)) return null;
                            return (
                              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                <Zap className="w-3 h-3 text-primary/60" />
                                {fmtTokens(ut.inputTokens + ut.outputTokens)} tokens
                                <span className="text-muted-foreground/50">
                                  ({estimateCost(ut.inputTokens, ut.outputTokens)})
                                </span>
                              </span>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Action buttons */}
                      {u.id !== user.id && (
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={() => setOpenPlanId(openPlanId === u.id ? null : u.id)}
                            data-testid={`button-manage-plan-${u.id}`}
                            className={cn(
                              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all",
                              openPlanId === u.id
                                ? "border-primary/40 bg-primary/10 text-primary"
                                : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
                            )}
                          >
                            <Crown className="w-3.5 h-3.5" />
                            Plan
                            <ChevronDown className={cn("w-3 h-3 transition-transform", openPlanId === u.id && "rotate-180")} />
                          </button>
                          <button
                            onClick={() => toggleAdminMutation.mutate({ id: u.id, isAdmin: !u.isAdmin })}
                            disabled={toggleAdminMutation.isPending}
                            data-testid={`button-toggle-admin-${u.id}`}
                            title={u.isAdmin ? "Remove admin" : "Make admin"}
                            className={cn(
                              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all",
                              u.isAdmin
                                ? "border-orange-500/30 text-orange-500 hover:bg-orange-500/10"
                                : "border-violet-500/30 text-violet-500 hover:bg-violet-500/10"
                            )}
                          >
                            {u.isAdmin ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                            {u.isAdmin ? "Demote" : "Admin"}
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Delete user "${u.username}"? This cannot be undone.`)) {
                                deleteMutation.mutate(u.id);
                              }
                            }}
                            disabled={deleteMutation.isPending}
                            data-testid={`button-delete-user-${u.id}`}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-destructive/30 text-destructive hover:bg-destructive/10 transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Plan manager inline */}
                    {openPlanId === u.id && (
                      <PlanManager
                        user={u}
                        currentUserId={user.id}
                        onClose={() => setOpenPlanId(null)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
