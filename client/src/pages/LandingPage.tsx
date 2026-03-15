import { useLocation } from "wouter";
import { useState, useEffect, useRef } from "react";
import {
  ArrowRight, Zap, Globe, Mic, Paperclip, Brain,
  Image as ImageIcon, Check, Star, Sparkles,
  ChevronRight, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ── tiny hook ── */
function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setVisible(true); },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
}

/* ── data ── */
const BENTO = [
  {
    icon: <Brain className="w-6 h-6" />,
    title: "Multi-Model Intelligence",
    desc: "Switch between Claude Sonnet, Opus, Haiku, and Llama 3.1 — pick the right brain for every job.",
    span: "col-span-2",
    accent: "from-violet-500/20 to-violet-500/5",
    iconColor: "text-violet-400",
    iconBg: "bg-violet-400/10",
  },
  {
    icon: <Globe className="w-6 h-6" />,
    title: "Live Web Search",
    desc: "Real-time answers backed by the web, with source links.",
    span: "col-span-1",
    accent: "from-sky-500/20 to-sky-500/5",
    iconColor: "text-sky-400",
    iconBg: "bg-sky-400/10",
  },
  {
    icon: <Zap className="w-6 h-6" />,
    title: "Instant Streaming",
    desc: "Responses appear word-by-word as they're generated.",
    span: "col-span-1",
    accent: "from-yellow-500/20 to-yellow-500/5",
    iconColor: "text-yellow-400",
    iconBg: "bg-yellow-400/10",
  },
  {
    icon: <ImageIcon className="w-6 h-6" />,
    title: "AI Image Generation",
    desc: "Describe it, see it. Generate stunning images inside your chat.",
    span: "col-span-1",
    accent: "from-pink-500/20 to-pink-500/5",
    iconColor: "text-pink-400",
    iconBg: "bg-pink-400/10",
  },
  {
    icon: <Mic className="w-6 h-6" />,
    title: "Voice Input",
    desc: "Speak your thoughts. Live transcript, hands-free.",
    span: "col-span-1",
    accent: "from-green-500/20 to-green-500/5",
    iconColor: "text-green-400",
    iconBg: "bg-green-400/10",
  },
  {
    icon: <Paperclip className="w-6 h-6" />,
    title: "Files & Images",
    desc: "Upload PDFs and images. AI reads, summarizes, and analyzes them.",
    span: "col-span-2",
    accent: "from-orange-500/20 to-orange-500/5",
    iconColor: "text-orange-400",
    iconBg: "bg-orange-400/10",
  },
];

const MODELS = [
  { name: "Claude Sonnet", tag: "Balanced", glow: "shadow-violet-500/20", border: "border-violet-500/30", dot: "bg-violet-400" },
  { name: "Claude Opus",   tag: "Powerful", glow: "shadow-amber-500/20",  border: "border-amber-500/30",  dot: "bg-amber-400"  },
  { name: "Claude Haiku",  tag: "Fast",     glow: "shadow-sky-500/20",    border: "border-sky-500/30",    dot: "bg-sky-400"    },
  { name: "GPT-4o",        tag: "Creative", glow: "shadow-green-500/20",  border: "border-green-500/30",  dot: "bg-green-400"  },
];

const TESTIMONIALS = [
  { name: "Sarah M.", role: "Product Manager", avatar: "S", color: "bg-violet-500", quote: "AI Sparky replaced 3 different AI tools for me. It has everything in one place — and it's fast." },
  { name: "James K.", role: "Software Engineer", avatar: "J", color: "bg-blue-500", quote: "The multi-model switching is a game changer. I use fast mode for quick answers and Opus for complex code reviews." },
  { name: "Priya R.", role: "Content Creator", avatar: "P", color: "bg-pink-500", quote: "The Knowledge Base feature alone is worth it. I uploaded all my brand docs and the AI knows my voice perfectly." },
  { name: "Tom H.", role: "Freelance Writer", avatar: "T", color: "bg-amber-500", quote: "Web search grounding means I actually trust the answers. No more hallucinated sources." },
  { name: "Leila F.", role: "Startup Founder", avatar: "L", color: "bg-emerald-500", quote: "We run it as our internal AI tool for the whole team. The admin controls and usage limits are exactly what we needed." },
  { name: "Marcus D.", role: "Data Analyst", avatar: "M", color: "bg-cyan-500", quote: "PDF analysis and voice input save me hours every week. I can literally talk to my documents now." },
];

const FAQS = [
  { q: "What's the difference between Free and Pro?", a: "Free gives you 20 messages per day with the fast AI model. Pro unlocks unlimited messages, all AI models (including the most powerful ones), web search, image generation, and priority speed." },
  { q: "Can I switch AI models mid-conversation?", a: "Yes. You can change the model at any time using the selector in the chat bar. Each model has different strengths — try switching and see which one you prefer for a given task." },
  { q: "Is my data private?", a: "Yes. Your conversations are stored only in your account and are never used to train AI models. You can export or delete your data at any time." },
  { q: "What is the Knowledge Base?", a: "The Knowledge Base lets you upload your own documents (PDFs, text files, etc.). The AI can then search and reference them when you ask questions, making it a personalized expert on your content." },
  { q: "How does web search work?", a: "When web search is enabled, the AI fetches live data from the internet before responding, so it can answer questions about current events, prices, and anything that changes over time." },
  { q: "Can I use AI Sparky for my business?", a: "Yes. Pro plan includes API access so you can embed AI Sparky into your own apps. Webhooks, call history, and usage tracking make it easy to integrate with your existing workflows." },
];

export default function LandingPage() {
  const [, navigate] = useLocation();
  const [scrollY, setScrollY] = useState(0);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const heroSection = useInView(0.1);
  const bentoSection = useInView(0.1);
  const modelsSection = useInView(0.1);
  const pricingSection = useInView(0.1);
  const testimonialsSection = useInView(0.1);
  const faqSection = useInView(0.1);

  useEffect(() => {
    const fn = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <div className="min-h-screen bg-[#07070f] text-white overflow-x-hidden">

      {/* ── Sticky Nav ── */}
      <nav className={cn(
        "fixed top-0 inset-x-0 z-50 transition-all duration-500",
        scrollY > 40
          ? "bg-[#07070f]/80 backdrop-blur-xl border-b border-white/5 py-3"
          : "py-5"
      )}>
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="AI Sparky" className="w-8 h-8 rounded-xl object-cover shadow-lg shadow-violet-500/20" />
            <span className="font-bold text-base tracking-tight">AI Sparky</span>
          </div>

          <div className="hidden md:flex items-center gap-7 text-sm text-white/50">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#models"   className="hover:text-white transition-colors">Models</a>
            <a href="#pricing"  className="hover:text-white transition-colors">Pricing</a>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/login")}
              data-testid="link-nav-signin"
              className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors"
            >
              Sign in
            </button>
            <button
              onClick={() => navigate("/login")}
              data-testid="link-nav-getstarted"
              className="px-4 py-2 rounded-xl bg-white text-[#07070f] text-sm font-semibold hover:bg-white/90 transition-all shadow-lg shadow-white/10"
            >
              Get started
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 overflow-hidden">

        {/* Full-bleed background */}
        <div className="absolute inset-0 -z-10">
          <img
            src="/hero-bg.png"
            alt=""
            className="w-full h-full object-cover opacity-30"
            style={{ transform: `translateY(${scrollY * 0.2}px)` }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#07070f]/40 via-transparent to-[#07070f]" />
        </div>

        {/* Glow orb */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-violet-600/15 rounded-full blur-[120px] pointer-events-none" />

        <div
          ref={heroSection.ref}
          className={cn(
            "max-w-4xl mx-auto text-center transition-all duration-1000",
            heroSection.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          )}
        >
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-white/60 text-xs font-medium mb-8 backdrop-blur-sm">
            <Sparkles className="w-3.5 h-3.5 text-violet-400" />
            Built on Claude · Amazon Bedrock
          </div>

          {/* Headline */}
          <h1 className="text-6xl md:text-8xl font-black tracking-tighter leading-[0.9] mb-6">
            <span className="block text-white">Think faster.</span>
            <span className="block bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
              Create more.
            </span>
          </h1>

          <p className="text-lg md:text-xl text-white/50 max-w-xl mx-auto mb-10 leading-relaxed font-light">
            AI Sparky is your personal AI powered by frontier models — with web search,
            voice, image generation, and more. All in one place.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => navigate("/login")}
              data-testid="button-hero-getstarted"
              className="group w-full sm:w-auto flex items-center justify-center gap-2 px-7 py-3.5 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white text-base font-semibold hover:from-violet-500 hover:to-fuchsia-500 transition-all shadow-xl shadow-violet-500/30"
            >
              Start for free
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
            <button
              onClick={() => navigate("/login")}
              data-testid="button-hero-signin"
              className="w-full sm:w-auto px-7 py-3.5 rounded-2xl border border-white/10 text-white/70 text-base hover:border-white/20 hover:text-white hover:bg-white/5 transition-all backdrop-blur-sm"
            >
              Sign in
            </button>
          </div>

          {/* Social proof */}
          <p className="mt-8 text-white/25 text-xs">No credit card required · Free plan available</p>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 text-white/20 text-xs">
          <div className="w-px h-8 bg-gradient-to-b from-transparent to-white/20" />
          <span>scroll</span>
        </div>
      </section>

      {/* ── Capability strip ── */}
      <div className="border-y border-white/5 bg-white/[0.02] py-5 overflow-hidden">
        <div className="flex gap-10 items-center animate-marquee whitespace-nowrap">
          {[
            "Streaming Responses", "Web Search", "Voice Input", "Image Generation",
            "PDF Analysis", "Multi-Model", "Cloud History", "Prompt Library",
            "Export to PDF", "Dark Mode", "Custom Themes", "Split View",
            "Streaming Responses", "Web Search", "Voice Input", "Image Generation",
            "PDF Analysis", "Multi-Model", "Cloud History", "Prompt Library",
          ].map((item, i) => (
            <span key={i} className="flex items-center gap-2 text-white/30 text-sm font-medium flex-shrink-0">
              <span className="w-1 h-1 rounded-full bg-violet-400/50" />
              {item}
            </span>
          ))}
        </div>
      </div>

      {/* ── Bento Features ── */}
      <section id="features" className="py-28 px-6">
        <div className="max-w-5xl mx-auto">
          <div
            ref={bentoSection.ref}
            className={cn(
              "transition-all duration-700",
              bentoSection.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
            )}
          >
            <p className="text-xs uppercase tracking-widest text-violet-400/70 font-semibold mb-4 text-center">Features</p>
            <h2 className="text-4xl md:text-5xl font-black tracking-tight text-center mb-16">
              Everything. One place.
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {BENTO.map((b) => (
                <div
                  key={b.title}
                  className={cn(
                    "group relative p-6 rounded-2xl border border-white/5 bg-white/[0.03] hover:bg-white/[0.05] transition-all duration-300 overflow-hidden",
                    b.span
                  )}
                >
                  {/* Card glow */}
                  <div className={cn("absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity duration-500", b.accent)} />

                  <div className="relative">
                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center mb-4", b.iconBg, b.iconColor)}>
                      {b.icon}
                    </div>
                    <h3 className="font-bold text-base text-white mb-2">{b.title}</h3>
                    <p className="text-white/40 text-sm leading-relaxed">{b.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Models ── */}
      <section id="models" className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div
            ref={modelsSection.ref}
            className={cn(
              "transition-all duration-700",
              modelsSection.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
            )}
          >
            <p className="text-xs uppercase tracking-widest text-violet-400/70 font-semibold mb-4 text-center">AI Models</p>
            <h2 className="text-4xl md:text-5xl font-black tracking-tight text-center mb-6">
              The right model,<br />every time.
            </h2>
            <p className="text-white/40 text-center text-lg mb-16 max-w-lg mx-auto font-light">
              Switch between frontier AI models with a single tap.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {MODELS.map((m) => (
                <div
                  key={m.name}
                  className={cn(
                    "p-5 rounded-2xl border bg-white/[0.03] hover:bg-white/[0.06] transition-all duration-200 hover:shadow-lg",
                    m.border, m.glow
                  )}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span className={cn("w-2 h-2 rounded-full flex-shrink-0", m.dot)} />
                    <span className="text-xs font-semibold text-white/40 uppercase tracking-widest">{m.tag}</span>
                  </div>
                  <p className="font-bold text-sm text-white">{m.name}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="py-24 px-6">
        <div className="max-w-3xl mx-auto">
          <div
            ref={pricingSection.ref}
            className={cn(
              "transition-all duration-700",
              pricingSection.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
            )}
          >
            <p className="text-xs uppercase tracking-widest text-violet-400/70 font-semibold mb-4 text-center">Pricing</p>
            <h2 className="text-4xl md:text-5xl font-black tracking-tight text-center mb-16">
              Start free.<br />Scale when ready.
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Free */}
              <div className="p-7 rounded-2xl border border-white/8 bg-white/[0.03]">
                <div className="text-sm text-white/40 font-medium mb-1">Free</div>
                <div className="text-5xl font-black mb-1">$0</div>
                <div className="text-white/30 text-sm mb-7">Forever free</div>
                <button
                  onClick={() => navigate("/login")}
                  data-testid="button-free-plan"
                  className="w-full py-3 rounded-xl border border-white/10 text-white/70 text-sm font-semibold hover:border-white/20 hover:text-white hover:bg-white/5 transition-all mb-7"
                >
                  Get started free
                </button>
                <ul className="space-y-3 text-sm text-white/40">
                  {["20 messages / day", "Claude Haiku model", "Conversation history", "Voice input", "File uploads"].map(f => (
                    <li key={f} className="flex items-center gap-2.5">
                      <Check className="w-3.5 h-3.5 text-white/20 shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Pro */}
              <div className="relative p-7 rounded-2xl border border-violet-500/30 bg-gradient-to-b from-violet-500/10 to-transparent overflow-hidden">
                {/* Glow */}
                <div className="absolute -top-20 -right-20 w-60 h-60 bg-violet-600/20 rounded-full blur-[60px] pointer-events-none" />

                <div className="relative">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-sm text-white/40 font-medium">Pro</div>
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/20 border border-violet-500/30 text-violet-300 text-[10px] font-bold">
                      <Star className="w-2.5 h-2.5 fill-current" /> Popular
                    </div>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <div className="text-5xl font-black">$12</div>
                    <div className="text-white/30 text-sm">/mo</div>
                  </div>
                  <div className="text-white/30 text-sm mb-7">Billed monthly</div>
                  <button
                    onClick={() => navigate("/login")}
                    data-testid="button-pro-plan"
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white text-sm font-bold hover:from-violet-500 hover:to-fuchsia-500 transition-all shadow-lg shadow-violet-500/25 mb-7"
                  >
                    Start Pro
                  </button>
                  <ul className="space-y-3 text-sm text-white/70">
                    {[
                      "Unlimited messages",
                      "All AI models",
                      "Web search grounding",
                      "AI image generation",
                      "Export PDF & Markdown",
                      "Advanced prompt library",
                      "Priority speed",
                    ].map(f => (
                      <li key={f} className="flex items-center gap-2.5">
                        <Check className="w-3.5 h-3.5 text-violet-400 shrink-0" /> {f}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div
            ref={testimonialsSection.ref}
            className={cn("transition-all duration-700", testimonialsSection.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6")}
          >
            <p className="text-xs uppercase tracking-widest text-violet-400/70 font-semibold mb-4 text-center">Loved by users</p>
            <h2 className="text-4xl md:text-5xl font-black tracking-tight text-center mb-4">
              What people are saying
            </h2>
            <p className="text-white/40 text-center text-lg mb-16 font-light max-w-lg mx-auto">Real feedback from people using AI Sparky every day.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {TESTIMONIALS.map((t) => (
                <div key={t.name} className="p-5 rounded-2xl border border-white/5 bg-white/[0.03] hover:bg-white/[0.05] transition-all duration-300 flex flex-col gap-4">
                  <p className="text-white/60 text-sm leading-relaxed flex-1">"{t.quote}"</p>
                  <div className="flex items-center gap-3">
                    <div className={cn("w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0", t.color)}>
                      {t.avatar}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{t.name}</p>
                      <p className="text-xs text-white/30">{t.role}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-24 px-6">
        <div className="max-w-2xl mx-auto">
          <div
            ref={faqSection.ref}
            className={cn("transition-all duration-700", faqSection.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6")}
          >
            <p className="text-xs uppercase tracking-widest text-violet-400/70 font-semibold mb-4 text-center">FAQ</p>
            <h2 className="text-4xl md:text-5xl font-black tracking-tight text-center mb-16">
              Common questions
            </h2>

            <div className="space-y-3">
              {FAQS.map((faq, i) => (
                <div key={i} className="rounded-2xl border border-white/8 bg-white/[0.03] overflow-hidden">
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left hover:bg-white/[0.02] transition-colors"
                    data-testid={`faq-toggle-${i}`}
                  >
                    <span className="font-semibold text-sm text-white">{faq.q}</span>
                    <ChevronDown className={cn("w-4 h-4 text-white/40 flex-shrink-0 transition-transform", openFaq === i && "rotate-180")} />
                  </button>
                  {openFaq === i && (
                    <div className="px-6 pb-5">
                      <p className="text-white/50 text-sm leading-relaxed">{faq.a}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="py-24 px-6 relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <img src="/hero-bg.png" alt="" className="w-full h-full object-cover opacity-15" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#07070f] via-[#07070f]/80 to-[#07070f]" />
        </div>

        <div className="max-w-2xl mx-auto text-center">
          <img src="/logo.png" alt="AI Sparky" className="w-16 h-16 rounded-2xl object-cover mx-auto mb-6 shadow-2xl shadow-violet-500/30" />
          <h2 className="text-4xl md:text-5xl font-black tracking-tight mb-4">
            Ready to spark<br />something great?
          </h2>
          <p className="text-white/40 text-lg mb-10 font-light">
            Join thousands already using AI Sparky to think faster and create more.
          </p>
          <button
            onClick={() => navigate("/login")}
            data-testid="button-cta-getstarted"
            className="group inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white text-lg font-bold hover:from-violet-500 hover:to-fuchsia-500 transition-all shadow-2xl shadow-violet-500/30"
          >
            Get started free
            <ChevronRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
          </button>
          <p className="mt-4 text-white/20 text-xs">No credit card needed</p>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/5 py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="AI Sparky" className="w-5 h-5 rounded-md object-cover" />
            <span className="text-sm font-bold text-white/60">AI Sparky</span>
            <span className="text-white/20 text-xs">— aisparky.dev</span>
          </div>
          <p className="text-xs text-white/20">© {new Date().getFullYear()} AI Sparky. Powered by Claude on Amazon Bedrock.</p>
          <div className="flex items-center gap-5 text-xs text-white/30">
            <button onClick={() => navigate("/login")} className="hover:text-white/60 transition-colors">Sign in</button>
            <button onClick={() => navigate("/login")} className="hover:text-white/60 transition-colors">Get started</button>
          </div>
        </div>
      </footer>

      {/* Marquee animation */}
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 30s linear infinite;
        }
      `}</style>
    </div>
  );
}
