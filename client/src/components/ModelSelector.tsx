import { Sparkles, Scale, Brain, Palette, Zap } from "lucide-react";

export type ModelId = "auto" | "balanced" | "powerful" | "creative" | "fast";

export interface ModelOption {
  id: ModelId;
  label: string;
  description: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  badge: string;
  badgeColor: string;
}

export const MODELS: ModelOption[] = [
  {
    id: "auto",
    label: "Auto",
    description: "Best model selected for you",
    icon: <Sparkles className="w-4 h-4" />,
    iconBg: "bg-cyan-500/10",
    iconColor: "text-cyan-400",
    badge: "Smart",
    badgeColor: "bg-cyan-500/10 text-cyan-400",
  },
  {
    id: "balanced",
    label: "Balanced",
    description: "Claude Sonnet · Fast & capable",
    icon: <Scale className="w-4 h-4" />,
    iconBg: "bg-violet-500/10",
    iconColor: "text-violet-400",
    badge: "Sonnet",
    badgeColor: "bg-violet-500/10 text-violet-400",
  },
  {
    id: "powerful",
    label: "Powerful",
    description: "Claude Opus · Most intelligent",
    icon: <Brain className="w-4 h-4" />,
    iconBg: "bg-amber-500/10",
    iconColor: "text-amber-400",
    badge: "Opus",
    badgeColor: "bg-amber-500/10 text-amber-400",
  },
  {
    id: "creative",
    label: "Creative",
    description: "Llama 3 · Imaginative & expressive",
    icon: <Palette className="w-4 h-4" />,
    iconBg: "bg-emerald-500/10",
    iconColor: "text-emerald-400",
    badge: "Llama",
    badgeColor: "bg-emerald-500/10 text-emerald-400",
  },
  {
    id: "fast",
    label: "Fast",
    description: "Claude Haiku · Instant responses",
    icon: <Zap className="w-4 h-4" />,
    iconBg: "bg-blue-500/10",
    iconColor: "text-blue-400",
    badge: "Haiku",
    badgeColor: "bg-blue-500/10 text-blue-400",
  },
];

export const MODEL_USED_STYLES: Record<string, { label: string; color: string; bg: string }> = {
  Balanced: { label: "Balanced",  color: "text-violet-400",  bg: "bg-violet-500/10" },
  Powerful: { label: "Powerful",  color: "text-amber-400",   bg: "bg-amber-500/10"  },
  Creative: { label: "Creative",  color: "text-emerald-400", bg: "bg-emerald-500/10"},
  Fast:     { label: "Fast",      color: "text-blue-400",    bg: "bg-blue-500/10"   },
};
