import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Crown, Check, X, Sparkles } from "lucide-react";
import { SiAnthropic } from "react-icons/si";

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpgrade?: () => void;
  reason?: "limit" | "model";
}

const LIMIT_FEATURES = [
  { name: "Daily messages", free: "20", pro: "Unlimited" },
  { name: "Claude Pro models (Sonnet, Opus…)", free: false, pro: true },
  { name: "Image generation", free: "Limited", pro: "Priority" },
  { name: "Web search access", free: false, pro: true },
  { name: "Knowledge Base", free: "Basic", pro: "Full access" },
  { name: "Early access to new features", free: false, pro: true },
];

const MODEL_FEATURES = [
  { name: "Fast — Claude Haiku", free: true, pro: true },
  { name: "Balanced — Claude Sonnet", free: false, pro: true },
  { name: "Powerful — Claude Opus", free: false, pro: true },
  { name: "Creative — Claude Sonnet", free: false, pro: true },
  { name: "Auto — best model selected", free: false, pro: true },
  { name: "Unlimited daily messages", free: false, pro: true },
];

export function UpgradeModal({ open, onOpenChange, onUpgrade, reason = "limit" }: UpgradeModalProps) {
  const isModel = reason === "model";
  const features = isModel ? MODEL_FEATURES : LIMIT_FEATURES;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden border-none shadow-2xl">
        {/* Top accent bar */}
        <div className={`h-1.5 w-full ${isModel
          ? "bg-gradient-to-r from-orange-500 via-amber-400 to-yellow-400"
          : "bg-gradient-to-r from-primary via-violet-500 to-fuchsia-500"
        }`} />

        <div className="p-8 space-y-6">
          {/* Header */}
          {isModel ? (
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="relative">
                <div className="w-14 h-14 rounded-2xl bg-[#D4763B]/10 flex items-center justify-center">
                  <SiAnthropic className="w-7 h-7 text-[#D4763B]" />
                </div>
                <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-amber-400 flex items-center justify-center shadow-sm">
                  <Crown className="w-2.5 h-2.5 text-amber-900" />
                </div>
              </div>
              <div>
                <DialogTitle className="text-2xl font-bold tracking-tight">
                  Unlock Claude Models
                </DialogTitle>
                <p className="text-muted-foreground text-sm mt-1.5 max-w-[340px] mx-auto">
                  Pro members get full access to Anthropic's Claude AI model suite — from lightning-fast responses to deep reasoning.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                <Crown className="w-6 h-6 text-primary" />
              </div>
              <DialogTitle className="text-2xl font-bold tracking-tight">
                You've hit your daily limit
              </DialogTitle>
              <p className="text-muted-foreground">
                You've used <span className="text-foreground font-semibold">20/20</span> free messages for today.
              </p>
            </div>
          )}

          {/* Feature table */}
          <div className="rounded-xl border border-border/50 bg-muted/30 overflow-hidden">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border/50 bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    {isModel ? "Model / Feature" : "Feature"}
                  </th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">Free</th>
                  <th className={`px-4 py-3 text-center font-semibold ${isModel ? "text-amber-500" : "text-primary"}`}>
                    <span className="flex items-center justify-center gap-1">
                      <Crown className="w-3 h-3" /> Pro
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {features.map((f, i) => (
                  <tr key={i} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2.5 text-foreground/80 font-medium text-[13px]">{f.name}</td>
                    <td className="px-4 py-2.5 text-center">
                      {typeof f.free === "string" ? (
                        <span className="text-xs font-semibold text-muted-foreground">{f.free}</span>
                      ) : f.free ? (
                        <Check className="w-4 h-4 text-emerald-500 mx-auto" />
                      ) : (
                        <X className="w-4 h-4 text-muted-foreground/30 mx-auto" />
                      )}
                    </td>
                    <td className={`px-4 py-2.5 text-center ${isModel ? "bg-amber-500/5" : "bg-primary/5"}`}>
                      {typeof f.pro === "string" ? (
                        <span className={`text-xs font-semibold ${isModel ? "text-amber-500" : "text-primary"}`}>{f.pro}</span>
                      ) : f.pro ? (
                        <Check className={`w-4 h-4 mx-auto ${isModel ? "text-amber-500" : "text-primary"}`} />
                      ) : (
                        <X className="w-4 h-4 text-muted-foreground/30 mx-auto" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* CTA buttons */}
          <div className="flex flex-col gap-3">
            <Button
              size="lg"
              className={`w-full font-bold h-12 text-base shadow-lg hover-elevate active-elevate-2 ${isModel
                ? "bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white border-0 shadow-orange-500/20"
                : "shadow-primary/20"
              }`}
              onClick={() => {
                onUpgrade?.();
                onOpenChange(false);
              }}
              data-testid="button-upgrade-pro"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              {isModel ? "Upgrade to Pro — Unlock Claude" : "Upgrade to Pro"}
            </Button>
            <Button
              variant="ghost"
              className="w-full text-muted-foreground hover:text-foreground"
              onClick={() => onOpenChange(false)}
              data-testid="button-remind-later"
            >
              {isModel ? "Maybe later" : "Remind me tomorrow"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
