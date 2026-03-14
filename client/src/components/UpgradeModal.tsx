import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Crown, Check, X, Sparkles, Mail, MessageSquare } from "lucide-react";

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpgrade?: () => void;
  reason?: "limit" | "model";
}

const MODEL_FEATURES = [
  { name: "Fast (free tier model)", free: true, pro: true },
  { name: "Balanced model", free: false, pro: true },
  { name: "Powerful model", free: false, pro: true },
  { name: "Creative model", free: false, pro: true },
  { name: "Auto — best model selected", free: false, pro: true },
  { name: "Unlimited daily messages", free: false, pro: true },
];

export function UpgradeModal({ open, onOpenChange, reason = "limit" }: UpgradeModalProps) {
  const isModel = reason === "model";
  const [contactEmail, setContactEmail] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      fetch("/api/public/contact")
        .then((r) => r.json())
        .then((d) => setContactEmail(d.contactEmail || null))
        .catch(() => {});
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] p-0 overflow-hidden border-none shadow-2xl">
        {/* Top accent bar */}
        <div className={`h-1.5 w-full ${isModel
          ? "bg-gradient-to-r from-violet-500 via-primary to-fuchsia-500"
          : "bg-gradient-to-r from-amber-500 via-orange-500 to-red-400"
        }`} />

        <div className="p-8 space-y-5">
          {isModel ? (
            /* ── Model unlock ── */
            <>
              <div className="flex flex-col items-center text-center space-y-3">
                <div className="w-13 h-13 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Crown className="w-7 h-7 text-primary" />
                </div>
                <div>
                  <DialogTitle className="text-2xl font-bold tracking-tight">
                    Unlock Pro Models
                  </DialogTitle>
                  <p className="text-muted-foreground text-sm mt-1.5 max-w-[340px] mx-auto">
                    Pro members get full access to all advanced AI models — including the most powerful and creative options.
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-border/50 bg-muted/30 overflow-hidden">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-border/50 bg-muted/50">
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Model / Feature</th>
                      <th className="px-4 py-3 text-center font-medium text-muted-foreground">Free</th>
                      <th className="px-4 py-3 text-center font-semibold text-primary">
                        <span className="flex items-center justify-center gap-1">
                          <Crown className="w-3 h-3" /> Pro
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {MODEL_FEATURES.map((f, i) => (
                      <tr key={i} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2.5 text-foreground/80 font-medium text-[13px]">{f.name}</td>
                        <td className="px-4 py-2.5 text-center">
                          {f.free ? (
                            <Check className="w-4 h-4 text-emerald-500 mx-auto" />
                          ) : (
                            <X className="w-4 h-4 text-muted-foreground/30 mx-auto" />
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-center bg-primary/5">
                          <Check className="w-4 h-4 text-primary mx-auto" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Admin contact CTA */}
              <div className="flex flex-col gap-3">
                {contactEmail ? (
                  <Button
                    size="lg"
                    className="w-full font-bold h-12 text-base shadow-lg shadow-primary/20 hover-elevate active-elevate-2"
                    asChild
                    data-testid="button-contact-admin"
                  >
                    <a href={`mailto:${contactEmail}?subject=Pro%20Subscription%20Request`}>
                      <Mail className="w-4 h-4 mr-2" />
                      Contact Admin — {contactEmail}
                    </a>
                  </Button>
                ) : (
                  <Button
                    size="lg"
                    className="w-full font-bold h-12 text-base shadow-lg shadow-primary/20 hover-elevate active-elevate-2"
                    onClick={() => onOpenChange(false)}
                    data-testid="button-contact-admin"
                  >
                    <MessageSquare className="w-4 h-4 mr-2" />
                    Contact Admin for Pro Access
                  </Button>
                )}
                <Button
                  variant="ghost"
                  className="w-full text-muted-foreground hover:text-foreground"
                  onClick={() => onOpenChange(false)}
                  data-testid="button-remind-later"
                >
                  Maybe later
                </Button>
              </div>
            </>
          ) : (
            /* ── Daily limit reached ── */
            <>
              <div className="flex flex-col items-center text-center space-y-3">
                <div className="w-14 h-14 rounded-full bg-amber-500/10 flex items-center justify-center">
                  <Sparkles className="w-7 h-7 text-amber-500" />
                </div>
                <div>
                  <DialogTitle className="text-2xl font-bold tracking-tight">
                    Daily limit reached
                  </DialogTitle>
                  <p className="text-muted-foreground mt-1.5">
                    You've used <span className="text-foreground font-semibold">20/20</span> free messages for today.
                    Your limit resets at midnight.
                  </p>
                </div>
              </div>

              {/* Pro upgrade info card */}
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Crown className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <p className="text-sm font-semibold text-foreground">Upgrade to Pro for unlimited access</p>
                </div>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                    Unlimited daily messages
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                    Access to all Pro AI models
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                    Priority processing &amp; web search
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                    Full Knowledge Base access
                  </li>
                </ul>
              </div>

              {/* Contact admin */}
              <div className="rounded-xl border border-border/50 bg-muted/30 p-4">
                <p className="text-sm text-muted-foreground text-center">
                  To subscribe to Pro, please contact your administrator
                </p>
                {contactEmail && (
                  <p className="text-center mt-2">
                    <a
                      href={`mailto:${contactEmail}?subject=Pro%20Subscription%20Request`}
                      className="text-sm font-semibold text-primary hover:underline inline-flex items-center gap-1.5"
                      data-testid="link-admin-email"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      {contactEmail}
                    </a>
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                {contactEmail ? (
                  <Button
                    size="lg"
                    className="w-full font-bold h-12 text-base bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white border-0 shadow-lg shadow-amber-500/20 hover-elevate active-elevate-2"
                    asChild
                    data-testid="button-contact-admin"
                  >
                    <a href={`mailto:${contactEmail}?subject=Pro%20Subscription%20Request`}>
                      <Mail className="w-4 h-4 mr-2" />
                      Email Admin for Pro Subscription
                    </a>
                  </Button>
                ) : (
                  <Button
                    size="lg"
                    className="w-full font-bold h-12 text-base bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white border-0 shadow-lg shadow-amber-500/20 hover-elevate active-elevate-2"
                    onClick={() => onOpenChange(false)}
                    data-testid="button-contact-admin"
                  >
                    <Crown className="w-4 h-4 mr-2" />
                    Contact Admin for Pro Access
                  </Button>
                )}
                <Button
                  variant="ghost"
                  className="w-full text-muted-foreground hover:text-foreground"
                  onClick={() => onOpenChange(false)}
                  data-testid="button-remind-later"
                >
                  Remind me tomorrow
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
