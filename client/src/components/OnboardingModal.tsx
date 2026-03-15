import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Brain, Globe, Paperclip, BookOpen, Zap, Crown, ArrowRight, Check, Sparkles,
} from "lucide-react";

const STEPS = [
  {
    icon: <Sparkles className="w-8 h-8" />,
    iconBg: "bg-gradient-to-br from-violet-500 to-fuchsia-500",
    title: "Welcome to AI Sparky",
    subtitle: "Your personal AI, powered by frontier models",
    desc: "Ask anything, analyze documents, generate images, search the web in real-time — all from one chat interface.",
    bullets: null,
    cta: "Let's go →",
  },
  {
    icon: <Brain className="w-8 h-8" />,
    iconBg: "bg-gradient-to-br from-blue-500 to-cyan-500",
    title: "Choose the right AI",
    subtitle: "Multiple models, one place",
    desc: "Switch between AI models anytime using the dropdown in the chat bar.",
    bullets: [
      { icon: Zap, label: "Fast", desc: "Quick answers, perfect for everyday tasks" },
      { icon: Brain, label: "Balanced", desc: "Great all-round performance" },
      { icon: Crown, label: "Powerful", desc: "Deep reasoning for complex problems" },
    ],
    cta: "Next →",
  },
  {
    icon: <Globe className="w-8 h-8" />,
    iconBg: "bg-gradient-to-br from-emerald-500 to-teal-500",
    title: "More than just chat",
    subtitle: "A full toolkit in every conversation",
    desc: "Use these tools to get more from every conversation:",
    bullets: [
      { icon: Globe, label: "Web search", desc: "Get answers backed by live internet data" },
      { icon: Paperclip, label: "Upload files", desc: "Share PDFs, images, documents to analyze" },
      { icon: BookOpen, label: "Knowledge Base", desc: "Build a searchable library from your own docs" },
    ],
    cta: "Next →",
  },
  {
    icon: <Check className="w-8 h-8" />,
    iconBg: "bg-gradient-to-br from-emerald-500 to-green-500",
    title: "You're all set!",
    subtitle: "Start your first conversation",
    desc: "Type a message below to get started. You have 20 free messages per day — upgrade to Pro for unlimited access.",
    bullets: null,
    cta: "Start chatting",
  },
];

const STORAGE_KEY = "onboarding-complete-v1";

export function OnboardingModal() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const done = localStorage.getItem(STORAGE_KEY);
    if (!done) {
      setTimeout(() => setOpen(true), 800);
    }
  }, []);

  const finish = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setOpen(false);
  };

  const next = () => {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      finish();
    }
  };

  const current = STEPS[step];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) finish(); }}>
      <DialogContent className="sm:max-w-[460px] p-0 overflow-hidden border-none shadow-2xl gap-0">
        {/* Progress bar */}
        <div className="h-1 bg-muted w-full">
          <div
            className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-500"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        <div className="px-8 pt-8 pb-8 space-y-6">
          {/* Icon */}
          <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center text-white mx-auto shadow-lg", current.iconBg)}>
            {current.icon}
          </div>

          {/* Text */}
          <div className="text-center space-y-1.5">
            <p className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-widest">{current.subtitle}</p>
            <h2 className="text-2xl font-black tracking-tight text-foreground">{current.title}</h2>
            <p className="text-sm text-muted-foreground leading-relaxed mt-2">{current.desc}</p>
          </div>

          {/* Bullets */}
          {current.bullets && (
            <div className="space-y-2.5">
              {current.bullets.map(({ icon: Icon, label, desc }) => (
                <div key={label} className="flex items-start gap-3 px-3.5 py-3 rounded-xl bg-muted/30 border border-border/40">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            {/* Step dots */}
            <div className="flex items-center gap-1.5 flex-1">
              {STEPS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setStep(i)}
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    i === step ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/20"
                  )}
                />
              ))}
            </div>

            <div className="flex items-center gap-2">
              {step < STEPS.length - 1 && (
                <button
                  onClick={finish}
                  className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors px-2"
                  data-testid="button-skip-onboarding"
                >
                  Skip
                </button>
              )}
              <Button
                onClick={next}
                data-testid="button-onboarding-next"
                className="flex items-center gap-1.5 font-semibold"
              >
                {current.cta}
                {step < STEPS.length - 1 && <ArrowRight className="w-3.5 h-3.5" />}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
