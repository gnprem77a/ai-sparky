import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Crown, Check, X, Sparkles, Mail, MessageSquare, Zap, Brain, Infinity, Globe, Lock, BookOpen, ImageIcon } from "lucide-react";

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpgrade?: () => void;
  reason?: "limit" | "model" | "feature";
  featureName?: string;
  featureDescription?: string;
}

const PRO_HIGHLIGHTS = [
  { icon: Infinity, label: "Unlimited messages", sub: "No daily cap, ever", color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { icon: Brain, label: "All AI models", sub: "Balanced, Powerful & Creative", color: "text-violet-400", bg: "bg-violet-500/10" },
  { icon: Globe, label: "Web search", sub: "Real-time internet access", color: "text-blue-400", bg: "bg-blue-500/10" },
  { icon: Sparkles, label: "Priority processing", sub: "Faster responses under load", color: "text-amber-400", bg: "bg-amber-500/10" },
];

const COMPARISON = [
  { feature: "Daily messages", free: "20/day", pro: "Unlimited" },
  { feature: "AI models", free: "Fast only", pro: "All models" },
  { feature: "Web search", free: false, pro: true },
  { feature: "Knowledge Base", free: "Limited", pro: "Full access" },
  { feature: "Image generation", free: false, pro: true },
  { feature: "Priority support", free: false, pro: true },
];

const FEATURE_META: Record<string, { icon: React.ElementType; color: string; bg: string; gradient: string; bar: string }> = {
  "Knowledge Base": {
    icon: BookOpen, color: "text-blue-400", bg: "bg-blue-500/15",
    gradient: "from-blue-500/15 via-indigo-500/8 to-background",
    bar: "from-blue-400 via-indigo-500 to-blue-400",
  },
  "Image generation": {
    icon: ImageIcon, color: "text-fuchsia-400", bg: "bg-fuchsia-500/15",
    gradient: "from-fuchsia-500/15 via-violet-500/8 to-background",
    bar: "from-fuchsia-400 via-violet-500 to-fuchsia-400",
  },
};

const DEFAULT_FEATURE = {
  icon: Lock, color: "text-primary", bg: "bg-primary/15",
  gradient: "from-primary/15 via-violet-500/8 to-background",
  bar: "from-primary via-violet-500 to-fuchsia-500",
};

export function UpgradeModal({ open, onOpenChange, reason = "limit", featureName, featureDescription }: UpgradeModalProps) {
  const isLimit = reason === "limit";
  const isFeature = reason === "feature";
  const [contactEmail, setContactEmail] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      fetch("/api/public/contact")
        .then((r) => r.json())
        .then((d) => setContactEmail(d.contactEmail || null))
        .catch(() => {});
    }
  }, [open]);

  const featureMeta = featureName ? (FEATURE_META[featureName] ?? DEFAULT_FEATURE) : DEFAULT_FEATURE;
  const FeatureIcon = featureMeta.icon;

  const headerGradient = isLimit
    ? "bg-gradient-to-br from-amber-500/15 via-orange-500/8 to-background"
    : isFeature
    ? `bg-gradient-to-br ${featureMeta.gradient}`
    : "bg-gradient-to-br from-primary/15 via-violet-500/8 to-background";

  const topBar = isLimit
    ? "bg-gradient-to-r from-amber-400 via-orange-500 to-amber-400"
    : isFeature
    ? `bg-gradient-to-r ${featureMeta.bar}`
    : "bg-gradient-to-r from-primary via-violet-500 to-fuchsia-500";

  const iconBg = isLimit
    ? "bg-gradient-to-br from-amber-400 to-orange-500 shadow-amber-500/30"
    : isFeature
    ? `${featureMeta.bg} shadow-primary/20`
    : "bg-gradient-to-br from-primary to-violet-600 shadow-primary/30";

  const ctaClass = isLimit
    ? "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white border-0 shadow-amber-500/25"
    : "shadow-primary/25";

  const title = isLimit
    ? "You've hit your daily limit"
    : isFeature
    ? `${featureName ?? "This"} is a Pro feature`
    : "Unlock Pro Models";

  const subtitle = isLimit
    ? "You've used all 20 free messages for today. Your limit resets at midnight — or upgrade to Pro for unlimited access."
    : isFeature
    ? (featureDescription ?? `Upgrade to Pro to unlock ${featureName ?? "this feature"} and get full access to everything AI Sparky has to offer.`)
    : "Pro members get full access to every AI model — including the most powerful and creative options available.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] p-0 overflow-hidden border-none shadow-2xl">
        {/* Gradient header */}
        <div className={`relative px-8 pt-8 pb-6 ${headerGradient}`}>
          {/* Top color bar */}
          <div className={`absolute top-0 left-0 right-0 h-1 ${topBar}`} />

          <div className="flex flex-col items-center text-center gap-3">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg ${iconBg}`}>
              {isLimit ? (
                <Zap className="w-8 h-8 text-white" />
              ) : isFeature ? (
                <FeatureIcon className={`w-8 h-8 ${featureMeta.color}`} />
              ) : (
                <Crown className="w-8 h-8 text-white" />
              )}
            </div>
            <div>
              <DialogTitle className="text-2xl font-black tracking-tight mb-1.5">{title}</DialogTitle>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-[340px] mx-auto">{subtitle}</p>
            </div>
          </div>
        </div>

        <div className="px-8 pb-8 space-y-5">
          {isLimit ? (
            <>
              {/* Pro highlights grid */}
              <div className="grid grid-cols-2 gap-2.5">
                {PRO_HIGHLIGHTS.map(({ icon: Icon, label, sub, color, bg }) => (
                  <div key={label} className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 border border-border/40">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${bg}`}>
                      <Icon className={`w-4 h-4 ${color}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground leading-tight">{label}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{sub}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Free vs Pro comparison */}
              <div className="rounded-xl border border-border/50 overflow-hidden">
                <div className="grid grid-cols-3 text-[11px] font-semibold border-b border-border/50 bg-muted/40">
                  <div className="px-3 py-2 text-muted-foreground">Feature</div>
                  <div className="px-3 py-2 text-center text-muted-foreground">Free</div>
                  <div className="px-3 py-2 text-center text-primary bg-primary/5">✦ Pro</div>
                </div>
                {COMPARISON.map((row) => (
                  <div key={row.feature} className="grid grid-cols-3 border-b border-border/30 last:border-0 text-[12px]">
                    <div className="px-3 py-2 text-foreground/70">{row.feature}</div>
                    <div className="px-3 py-2 text-center text-muted-foreground">
                      {typeof row.free === "boolean" ? (
                        row.free ? <Check className="w-3.5 h-3.5 text-emerald-500 mx-auto" /> : <X className="w-3.5 h-3.5 text-muted-foreground/30 mx-auto" />
                      ) : row.free}
                    </div>
                    <div className="px-3 py-2 text-center bg-primary/3 text-primary font-medium">
                      {typeof row.pro === "boolean" ? (
                        row.pro ? <Check className="w-3.5 h-3.5 text-primary mx-auto" /> : <X className="w-3.5 h-3.5 mx-auto" />
                      ) : row.pro}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : isFeature ? (
            <>
              {/* Feature-specific locked view */}
              <div className="rounded-xl border border-border/50 bg-muted/20 overflow-hidden">
                <div className="p-4 flex items-start gap-3 border-b border-border/30">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${featureMeta.bg}`}>
                    <Lock className={`w-5 h-5 ${featureMeta.color}`} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Locked on Free plan</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {featureName ?? "This feature"} requires a Pro subscription. Upgrade to unlock it instantly.
                    </p>
                  </div>
                </div>
                <div className="p-4 grid grid-cols-2 gap-2.5">
                  {PRO_HIGHLIGHTS.map(({ icon: Icon, label, sub, color, bg }) => (
                    <div key={label} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-background/60 border border-border/40">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${bg}`}>
                        <Icon className={`w-3.5 h-3.5 ${color}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-foreground leading-tight">{label}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{sub}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            /* ── Model unlock view ── */
            <div className="rounded-xl border border-border/50 overflow-hidden">
              <div className="grid grid-cols-3 text-[11px] font-semibold border-b border-border/50 bg-muted/40">
                <div className="px-3 py-2 text-muted-foreground">Model</div>
                <div className="px-3 py-2 text-center text-muted-foreground">Free</div>
                <div className="px-3 py-2 text-center text-primary bg-primary/5">✦ Pro</div>
              </div>
              {[
                { name: "Fast model", free: true, pro: true },
                { name: "Balanced model", free: false, pro: true },
                { name: "Powerful model", free: false, pro: true },
                { name: "Creative model", free: false, pro: true },
                { name: "Auto-select best", free: false, pro: true },
                { name: "Unlimited messages", free: false, pro: true },
              ].map((row) => (
                <div key={row.name} className="grid grid-cols-3 border-b border-border/30 last:border-0 text-[12px]">
                  <div className="px-3 py-2 text-foreground/70 font-medium">{row.name}</div>
                  <div className="px-3 py-2 text-center">
                    {row.free ? <Check className="w-3.5 h-3.5 text-emerald-500 mx-auto" /> : <X className="w-3.5 h-3.5 text-muted-foreground/30 mx-auto" />}
                  </div>
                  <div className="px-3 py-2 text-center bg-primary/3">
                    <Check className="w-3.5 h-3.5 text-primary mx-auto" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Contact CTA */}
          <div className="space-y-2.5">
            {contactEmail ? (
              <Button
                size="lg"
                className={`w-full font-bold h-12 text-base shadow-lg hover-elevate active-elevate-2 ${ctaClass}`}
                asChild
                data-testid="button-contact-admin"
              >
                <a href={`mailto:${contactEmail}?subject=Pro%20Subscription%20Request&body=Hi%2C%20I%27d%20like%20to%20upgrade%20to%20Pro.`}>
                  <Mail className="w-4 h-4 mr-2" />
                  Contact Admin — {contactEmail}
                </a>
              </Button>
            ) : (
              <Button
                size="lg"
                className={`w-full font-bold h-12 text-base shadow-lg hover-elevate active-elevate-2 ${ctaClass}`}
                onClick={() => onOpenChange(false)}
                data-testid="button-contact-admin"
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                Contact your administrator for Pro access
              </Button>
            )}
            <Button
              variant="ghost"
              className="w-full text-muted-foreground hover:text-foreground text-sm"
              onClick={() => onOpenChange(false)}
              data-testid="button-remind-later"
            >
              {isLimit ? "Remind me tomorrow" : "Maybe later"}
            </Button>
          </div>

          <p className="text-center text-[10px] text-muted-foreground/40">
            Pro access is managed by your administrator &nbsp;·&nbsp; 🔒 We never train on your conversations
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
