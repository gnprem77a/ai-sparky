import { Link } from "wouter";
import { Sparkles, Zap, Shield, Globe, Brain, ArrowLeft } from "lucide-react";

export default function AboutPage() {
  return (
    <PublicLayout title="About AI Sparky">
      <section className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <h2 className="text-xl font-bold text-foreground">What is AI Sparky?</h2>
        </div>
        <p className="text-muted-foreground leading-relaxed">
          AI Sparky is a personal AI assistant platform designed to help you write faster, think deeper, and get more done. Whether you're drafting emails, exploring ideas, analysing documents, or building automations — AI Sparky brings state-of-the-art language models to your fingertips in one clean interface.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-bold text-foreground mb-6">Why we built it</h2>
        <p className="text-muted-foreground leading-relaxed mb-4">
          Most AI tools are either too simple or too complicated. We wanted something that felt natural to use from day one, while still being powerful enough for advanced workflows. AI Sparky is built around that balance.
        </p>
        <p className="text-muted-foreground leading-relaxed">
          We care deeply about privacy. Your conversations are never used to train AI models. Your data is encrypted, never sold, and always yours.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-bold text-foreground mb-6">What you can do</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { icon: Brain, title: "Multiple AI models", desc: "Switch between Fast, Balanced, Creative, and Powerful models depending on the task." },
            { icon: Globe, title: "Live web search", desc: "Pro users can query the live internet for real-time answers." },
            { icon: Shield, title: "Privacy first", desc: "End-to-end focus on data protection. We never train on your chats." },
            { icon: Zap, title: "External API", desc: "Integrate AI Sparky into your own apps via a simple REST API." },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex gap-3 p-4 rounded-xl border border-border bg-card">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-foreground text-sm mb-1">{title}</p>
                <p className="text-muted-foreground text-sm leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold text-foreground mb-4">Get in touch</h2>
        <p className="text-muted-foreground leading-relaxed">
          Have a question, idea, or feedback? Visit our{" "}
          <Link href="/contact" className="text-primary hover:underline font-medium">Contact page</Link>{" "}
          and we'll get back to you as soon as possible.
        </p>
      </section>
    </PublicLayout>
  );
}

/* ── Shared public page layout ────────────────────────────────────── */
export function PublicLayout({ title, children }: { title: string; children: React.ReactNode }) {
  const year = new Date().getFullYear();
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <header className="border-b border-border/50 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-foreground font-bold text-lg hover:opacity-80 transition-opacity">
            <Sparkles className="w-5 h-5 text-primary" />
            AI Sparky
          </Link>
          <nav className="hidden sm:flex items-center gap-5 text-sm text-muted-foreground">
            <Link href="/about" className="hover:text-foreground transition-colors">About</Link>
            <Link href="/contact" className="hover:text-foreground transition-colors">Contact</Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-12">
        {/* Back link */}
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8">
          <ArrowLeft className="w-4 h-4" />
          Back to AI Sparky
        </Link>
        <h1 className="text-3xl font-bold text-foreground mb-8 tracking-tight">{title}</h1>
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 py-8">
        <div className="max-w-3xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <p>© {year} AI Sparky. All rights reserved.</p>
          <nav className="flex items-center gap-5">
            <Link href="/about" className="hover:text-foreground transition-colors">About</Link>
            <Link href="/contact" className="hover:text-foreground transition-colors">Contact</Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
