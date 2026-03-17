import { useState } from "react";
import { Mail, MessageSquare, Clock, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { PublicLayout } from "./AboutPage";

export default function ContactPage() {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) return;
    setSending(true);
    await new Promise(r => setTimeout(r, 800));
    setSending(false);
    toast({ title: "Message sent!", description: "We'll get back to you as soon as possible." });
    setName(""); setEmail(""); setMessage("");
  };

  return (
    <PublicLayout title="Contact Us">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        {[
          { icon: Mail, title: "Email support", desc: "We respond to every message personally." },
          { icon: Clock, title: "Response time", desc: "Usually within 1–2 business days." },
          { icon: MessageSquare, title: "Feedback welcome", desc: "Feature ideas, bug reports, anything." },
        ].map(({ icon: Icon, title, desc }) => (
          <div key={title} className="flex flex-col gap-2 p-4 rounded-xl border border-border bg-card">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Icon className="w-4 h-4 text-primary" />
            </div>
            <p className="font-semibold text-foreground text-sm">{title}</p>
            <p className="text-muted-foreground text-sm leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
        <h2 className="text-lg font-bold text-foreground mb-6">Send us a message</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">Name</label>
              <Input
                placeholder="Your name"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                data-testid="input-contact-name"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">Email</label>
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                data-testid="input-contact-email"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">Message</label>
            <Textarea
              placeholder="Tell us what's on your mind…"
              value={message}
              onChange={e => setMessage(e.target.value)}
              required
              rows={5}
              className="resize-none"
              data-testid="input-contact-message"
            />
          </div>
          <Button
            type="submit"
            disabled={sending || !name || !email || !message}
            className="self-end gap-2"
            data-testid="button-contact-submit"
          >
            {sending ? "Sending…" : <><Send className="w-4 h-4" /> Send message</>}
          </Button>
        </form>
      </div>
    </PublicLayout>
  );
}
