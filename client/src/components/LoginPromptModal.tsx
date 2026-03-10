import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Zap, LogIn, UserPlus } from "lucide-react";

interface LoginPromptModalProps {
  open: boolean;
  onClose: () => void;
}

export function LoginPromptModal({ open, onClose }: LoginPromptModalProps) {
  const [, navigate] = useLocation();

  const go = (tab: "login" | "register") => {
    onClose();
    navigate(`/login?tab=${tab}`);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm border-border/50 bg-card p-0 overflow-hidden gap-0" data-testid="modal-login-prompt">
        {/* Top glow strip */}
        <div className="h-1 w-full bg-gradient-to-r from-violet-600 via-fuchsia-500 to-blue-600" />

        <div className="flex flex-col items-center px-8 py-8 gap-5">
          {/* Logo */}
          <div className="relative">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center shadow-xl shadow-primary/30">
              <img src="/logo.png" alt="AI Sparky" className="w-10 h-10 rounded-xl object-cover" />
            </div>
            <div className="absolute inset-0 rounded-2xl bg-primary/30 blur-2xl scale-150 -z-10" />
          </div>

          {/* Copy */}
          <div className="text-center">
            <h2 className="text-xl font-black tracking-tight text-foreground mb-1.5">
              Sign in to chat
            </h2>
            <p className="text-sm text-muted-foreground/70 leading-relaxed max-w-[240px]">
              Create a free account or sign in to start chatting with AI Sparky.
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2.5 w-full">
            <Button
              className="w-full font-semibold bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 border-0 shadow-lg shadow-primary/20"
              onClick={() => go("register")}
              data-testid="button-create-account"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Create free account
            </Button>
            <Button
              variant="outline"
              className="w-full font-medium border-border/50 hover:bg-card/80"
              onClick={() => go("login")}
              data-testid="button-sign-in"
            >
              <LogIn className="w-4 h-4 mr-2" />
              Sign in
            </Button>
          </div>

          <p className="text-[11px] text-muted-foreground/40 text-center">
            Free tier includes 20 messages/day. No credit card required.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
