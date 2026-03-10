import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Crown, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpgrade?: () => void;
}

export function UpgradeModal({ open, onOpenChange, onUpgrade }: UpgradeModalProps) {
  const features = [
    { name: "Daily messages", free: "20", pro: "Unlimited", highlight: true },
    { name: "Advanced models (GPT-4, Claude 3)", free: false, pro: true },
    { name: "Image generation", free: "Limited", pro: "Priority" },
    { name: "Web search access", free: false, pro: true },
    { name: "Early access to new features", free: false, pro: true },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] p-0 overflow-hidden border-none shadow-2xl">
        <div className="h-2 w-full bg-gradient-to-r from-primary via-violet-500 to-fuchsia-500" />
        
        <div className="p-8 space-y-6">
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

          <div className="rounded-xl border border-border/50 bg-muted/30 overflow-hidden">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border/50 bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Feature</th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">Free</th>
                  <th className="px-4 py-3 text-center font-medium text-primary">Pro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {features.map((f, i) => (
                  <tr key={i} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 text-foreground/80 font-medium">{f.name}</td>
                    <td className="px-4 py-3 text-center">
                      {typeof f.free === "string" ? (
                        <span className="text-xs font-semibold">{f.free}</span>
                      ) : f.free ? (
                        <Check className="w-4 h-4 text-emerald-500 mx-auto" />
                      ) : (
                        <X className="w-4 h-4 text-muted-foreground/30 mx-auto" />
                      )}
                    </td>
                    <td className="px-4 py-3 text-center bg-primary/5">
                      {typeof f.pro === "string" ? (
                        <span className="text-xs font-semibold text-primary">{f.pro}</span>
                      ) : f.pro ? (
                        <Check className="w-4 h-4 text-primary mx-auto" />
                      ) : (
                        <X className="w-4 h-4 text-muted-foreground/30 mx-auto" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3">
            <Button 
              size="lg" 
              className="w-full font-bold h-12 text-base shadow-lg shadow-primary/20 hover-elevate active-elevate-2"
              onClick={() => {
                onUpgrade?.();
                onOpenChange(false);
              }}
              data-testid="button-upgrade-pro"
            >
              Upgrade to Pro
            </Button>
            <Button 
              variant="ghost" 
              className="w-full text-muted-foreground hover:text-foreground"
              onClick={() => onOpenChange(false)}
              data-testid="button-remind-later"
            >
              Remind me tomorrow
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
