import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Brain, Globe, Paperclip, BookOpen, Zap, Crown, ArrowRight, Check, Sparkles, Mic, Pin, LayoutList,
} from "lucide-react";

const STARTER_PROMPTS = [
  "Explain quantum computing to me like I'm 10 years old",
  "Write a professional email declining a meeting",
  "Summarize the key differences between Python and JavaScript",
];

interface OnboardingModalProps {
  onStartWithPrompt?: (prompt: string) => void;
}

function buildSteps(onStartWithPrompt?: (prompt: string) => void, onFinish?: () => void) {
  return [
    {
      icon: <Sparkles className="w-8 h-8" />,
      iconBg: "bg-gradient-to-br from-violet-500 to-fuchsia-500",
      title: "Welcome to AI Sparky",
      subtitle: "Your personal AI, powered by frontier models",
      desc: "Ask anything, analyze documents, generate images, search the web in real-time — all from one chat interface.",
      bullets: null,
      extra: null,
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
      extra: null,
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
      extra: null,
      cta: "Next →",
    },
    {
      icon: <Sparkles className="w-8 h-8" />,
      iconBg: "bg-gradient-to-br from-pink-500 to-rose-500",
      title: "Power user features",
      subtitle: "Work smarter with every conversation",
      desc: "A few extras that make a big difference:",
      bullets: [
        { icon: Pin, label: "Pin messages", desc: "Hover any reply → pin icon to bookmark it for later" },
        { icon: Mic, label: "Voice input", desc: "Tap the mic in the chat bar to dictate your message" },
        { icon: LayoutList, label: "Prompt library", desc: "Save favourite prompts and re-use them instantly" },
      ],
      extra: null,
      cta: "Next →",
    },
    {
      icon: <Check className="w-8 h-8" />,
      iconBg: "bg-gradient-to-br from-emerald-500 to-green-500",
      title: "You're all set!",
      subtitle: "Start your first conversation",
      desc: "Try one of these to get started, or type your own message below:",
      bullets: null,
      extra: (
        <div className="space-y-2">
          {STARTER_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              onClick={() => { onStartWithPrompt?.(prompt); onFinish?.(); }}
              className="w-full text-left px-3.5 py-3 rounded-xl bg-muted/30 border border-border/40 hover:bg-muted/60 hover:border-border/70 transition-all group"
            >
              <p className="text-xs text-foreground/80 group-hover:text-foreground leading-snug transition-colors">
                "{prompt}"
              </p>
              <p className="text-[10px] text-muted-foreground/50 mt-0.5 group-hover:text-muted-foreground/70 transition-colors">Click to try this →</p>
            </button>
          ))}
          <p className="text-[10px] text-center text-muted-foreground/40 pt-1">
            Free: 20 messages/day · Upgrade to Pro for unlimited access
          </p>
        </div>
      ),
      cta: "Start chatting",
    },
  ];
}

const STORAGE_KEY = "onboarding-complete-v1";

export function OnboardingModal({ onStartWithPrompt }: OnboardingModalProps) {
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

  const STEPS = buildSteps(onStartWithPrompt, finish);

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

          {/* Extra content (e.g. starter prompts) */}
          {current.extra}

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
