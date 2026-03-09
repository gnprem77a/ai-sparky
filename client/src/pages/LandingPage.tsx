import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import {
  Zap, MessageSquare, Globe, Mic, Paperclip, History,
  Check, Star, ArrowRight, Sparkles, Shield, Brain,
  Image as ImageIcon, Search, ChevronRight, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const FEATURES = [
  {
    icon: <Zap className="w-5 h-5" />,
    title: "Real-time Streaming",
    desc: "Responses stream word-by-word instantly — no waiting for the full reply.",
    color: "text-yellow-400",
    bg: "bg-yellow-400/10",
  },
  {
    icon: <Brain className="w-5 h-5" />,
    title: "Multi-Model Routing",
    desc: "Pick from Claude Sonnet, Opus, Haiku, or Llama — the right model for every task.",
    color: "text-violet-400",
    bg: "bg-violet-400/10",
  },
  {
    icon: <Globe className="w-5 h-5" />,
    title: "Web Search Grounding",
    desc: "AI answers backed by live web results with source citations you can verify.",
    color: "text-sky-400",
    bg: "bg-sky-400/10",
  },
  {
    icon: <Mic className="w-5 h-5" />,
    title: "Voice Input",
    desc: "Speak naturally — live transcript appears as you talk, hands-free.",
    color: "text-green-400",
    bg: "bg-green-400/10",
  },
  {
    icon: <Paperclip className="w-5 h-5" />,
    title: "File & Image Uploads",
    desc: "Attach PDFs, images, or documents. AI reads and analyzes them instantly.",
    color: "text-orange-400",
    bg: "bg-orange-400/10",
  },
  {
    icon: <History className="w-5 h-5" />,
    title: "Cloud Conversation History",
    desc: "All your chats saved and searchable. Pick up where you left off, on any device.",
    color: "text-pink-400",
    bg: "bg-pink-400/10",
  },
  {
    icon: <ImageIcon className="w-5 h-5" />,
    title: "AI Image Generation",
    desc: "Generate stunning images right inside your chat — just describe what you want.",
    color: "text-fuchsia-400",
    bg: "bg-fuchsia-400/10",
  },
  {
    icon: <Search className="w-5 h-5" />,
    title: "Prompt Library",
    desc: "Save your best prompts and reuse them with one click. Build your personal toolkit.",
    color: "text-teal-400",
    bg: "bg-teal-400/10",
  },
  {
    icon: <Shield className="w-5 h-5" />,
    title: "Private & Secure",
    desc: "Your conversations are yours. No training on your data. Always encrypted.",
    color: "text-emerald-400",
    bg: "bg-emerald-400/10",
  },
];

const MODELS = [
  { name: "Claude Sonnet", badge: "Balanced", desc: "Fast, smart, affordable. Best for everyday tasks.", color: "border-violet-500/40 bg-violet-500/5" },
  { name: "Claude Opus", badge: "Powerful", desc: "Maximum intelligence for complex reasoning and analysis.", color: "border-amber-500/40 bg-amber-500/5" },
  { name: "Claude Haiku", badge: "Fast", desc: "Lightning-quick responses for simple questions.", color: "border-sky-500/40 bg-sky-500/5" },
  { name: "Llama 3.1 70B", badge: "Creative", desc: "Open-source powerhouse, great for creative writing.", color: "border-green-500/40 bg-green-500/5" },
];

const FREE_FEATURES = [
  "20 messages per day",
  "Claude Haiku model",
  "Conversation history",
  "Voice input",
  "File & image uploads",
];

const PRO_FEATURES = [
  "Unlimited messages",
  "All models (Sonnet, Opus, Llama)",
  "Web search grounding",
  "AI image generation",
  "Priority response speed",
  "Export to PDF & Markdown",
  "Advanced prompt library",
  "Custom AI personas",
];

export default function LandingPage() {
  const [, navigate] = useLocation();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">

      {/* ── Nav ── */}
      <header className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
        scrolled ? "bg-background/90 backdrop-blur-md border-b border-border/40 shadow-sm" : "bg-transparent"
      )}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="AI Sparky" className="w-8 h-8 rounded-lg object-cover" />
            <span className="font-bold text-lg tracking-tight">AI Sparky</span>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#models" className="hover:text-foreground transition-colors">Models</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
          </nav>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/login")} data-testid="link-nav-signin">
              Sign In
            </Button>
            <Button size="sm" onClick={() => navigate("/login")} data-testid="link-nav-getstarted"
              className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5">
              Get Started <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative pt-32 pb-24 px-6 text-center overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-primary/10 rounded-full blur-[120px]" />
          <div className="absolute top-20 left-1/4 w-[300px] h-[300px] bg-violet-600/8 rounded-full blur-[80px]" />
          <div className="absolute top-20 right-1/4 w-[300px] h-[300px] bg-sky-600/8 rounded-full blur-[80px]" />
        </div>

        <div className="max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-6">
            <Sparkles className="w-3.5 h-3.5" />
            Powered by Claude on Amazon Bedrock
          </div>

          <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-tight mb-6">
            Your personal AI,
            <br />
            <span className="bg-gradient-to-r from-primary via-violet-400 to-sky-400 bg-clip-text text-transparent">
              supercharged
            </span>
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            AI Sparky brings together the best AI models, live web search, voice input,
            and image generation — all in one beautifully designed chat experience.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-16">
            <Button
              size="lg"
              onClick={() => navigate("/login")}
              data-testid="button-hero-getstarted"
              className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground px-8 h-12 text-base font-semibold gap-2 shadow-lg shadow-primary/20"
            >
              Get Started Free <ArrowRight className="w-4 h-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => navigate("/login")}
              data-testid="button-hero-signin"
              className="w-full sm:w-auto px-8 h-12 text-base border-border/60"
            >
              Sign In
            </Button>
          </div>

          {/* Hero image */}
          <div className="relative mx-auto max-w-5xl">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/30 via-violet-500/20 to-sky-500/30 rounded-2xl blur-sm" />
            <div className="relative rounded-2xl overflow-hidden border border-border/40 shadow-2xl shadow-black/40">
              <img
                src="/hero-mockup.png"
                alt="AI Sparky chat interface"
                className="w-full h-auto"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/60 via-transparent to-transparent" />
            </div>
          </div>
        </div>
      </section>

      {/* ── Stat bar ── */}
      <section className="border-y border-border/40 bg-muted/20 py-8 px-6">
        <div className="max-w-4xl mx-auto grid grid-cols-3 gap-8 text-center">
          {[
            { value: "4+", label: "AI Models" },
            { value: "∞", label: "Conversations" },
            { value: "100%", label: "Private" },
          ].map((s) => (
            <div key={s.label}>
              <div className="text-3xl font-bold text-foreground mb-1">{s.value}</div>
              <div className="text-sm text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
              Everything you need in one place
            </h2>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              No switching between tools. AI Sparky packs in all the features power users actually want.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="group p-5 rounded-xl border border-border/40 bg-card hover:border-border hover:shadow-md transition-all duration-200"
              >
                <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center mb-4", f.bg, f.color)}>
                  {f.icon}
                </div>
                <h3 className="font-semibold text-sm mb-1.5">{f.title}</h3>
                <p className="text-muted-foreground text-xs leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Models ── */}
      <section id="models" className="py-24 px-6 bg-muted/10">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
              Pick your AI model
            </h2>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              Switch between frontier models on-the-fly. Use the right tool for the right task.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {MODELS.map((m) => (
              <div key={m.name} className={cn(
                "p-5 rounded-xl border flex items-start gap-4 transition-all duration-200 hover:shadow-md",
                m.color
              )}>
                <div className="w-10 h-10 rounded-lg bg-background/60 border border-border/40 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm">{m.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-background/60 border border-border/40 text-muted-foreground font-medium">
                      {m.badge}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{m.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
              Simple, transparent pricing
            </h2>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              Start for free. Upgrade when you're ready for unlimited power.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Free */}
            <div className="p-7 rounded-2xl border border-border/50 bg-card">
              <div className="mb-6">
                <div className="text-sm text-muted-foreground font-medium mb-1">Free</div>
                <div className="text-4xl font-bold mb-1">$0</div>
                <div className="text-sm text-muted-foreground">No credit card needed</div>
              </div>
              <Button
                variant="outline"
                className="w-full mb-6"
                onClick={() => navigate("/login")}
                data-testid="button-free-plan"
              >
                Get Started Free
              </Button>
              <ul className="space-y-3">
                {FREE_FEATURES.map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                    <Check className="w-4 h-4 text-green-400 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            {/* Pro */}
            <div className="relative p-7 rounded-2xl border border-primary/40 bg-card shadow-lg shadow-primary/5">
              <div className="absolute -top-3 left-6">
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary text-primary-foreground text-xs font-semibold shadow-md">
                  <Star className="w-3 h-3 fill-current" />
                  Most Popular
                </div>
              </div>
              <div className="mb-6">
                <div className="text-sm text-muted-foreground font-medium mb-1">Pro</div>
                <div className="flex items-baseline gap-1">
                  <div className="text-4xl font-bold">$12</div>
                  <div className="text-muted-foreground text-sm">/month</div>
                </div>
                <div className="text-sm text-muted-foreground">Billed monthly</div>
              </div>
              <Button
                className="w-full mb-6 bg-primary hover:bg-primary/90 shadow-md shadow-primary/20 gap-1.5"
                onClick={() => navigate("/login")}
                data-testid="button-pro-plan"
              >
                Start Pro Trial <ChevronRight className="w-4 h-4" />
              </Button>
              <ul className="space-y-3">
                {PRO_FEATURES.map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm">
                    <Check className="w-4 h-4 text-primary shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA Banner ── */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="relative p-10 rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/8 via-violet-500/5 to-sky-500/8 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent rounded-3xl" />
            <div className="relative">
              <img src="/logo.png" alt="AI Sparky" className="w-14 h-14 rounded-2xl object-cover mx-auto mb-5 shadow-xl shadow-primary/20" />
              <h2 className="text-3xl font-bold mb-3">Ready to spark your productivity?</h2>
              <p className="text-muted-foreground mb-8 text-lg">
                Join thousands of users who've upgraded their AI workflow with AI Sparky.
              </p>
              <Button
                size="lg"
                onClick={() => navigate("/login")}
                data-testid="button-cta-getstarted"
                className="bg-primary hover:bg-primary/90 px-8 h-12 text-base font-semibold gap-2 shadow-lg shadow-primary/25"
              >
                Get Started Free <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border/40 py-10 px-6">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="AI Sparky" className="w-6 h-6 rounded-md object-cover" />
            <span className="font-semibold text-sm">AI Sparky</span>
            <span className="text-muted-foreground text-xs">— aisparky.dev</span>
          </div>
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} AI Sparky. Powered by Claude on Amazon Bedrock.
          </p>
          <div className="flex items-center gap-5 text-xs text-muted-foreground">
            <button onClick={() => navigate("/login")} className="hover:text-foreground transition-colors">
              Sign In
            </button>
            <button onClick={() => navigate("/login")} className="hover:text-foreground transition-colors">
              Get Started
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
