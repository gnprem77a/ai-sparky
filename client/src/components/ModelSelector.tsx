import { Sparkles, Scale, Brain, Palette, Zap } from "lucide-react";
import { MODEL_REGISTRY } from "@shared/models";

export type ModelId = "auto" | "balanced" | "powerful" | "creative" | "fast";

export interface ModelOption {
  id: ModelId;
  friendlyName: string;
  exactName: string;
  description: string;
  badgeLabel: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
}

export const MODELS: ModelOption[] = [
  {
    id: "auto",
    friendlyName: "Auto",
    exactName: "Auto",
    description: "Best model selected for you",
    badgeLabel: "Auto",
    icon: <Sparkles className="w-4 h-4" />,
    iconBg: "bg-cyan-500/10",
    iconColor: "text-cyan-400",
  },
  {
    id: "balanced",
    friendlyName: MODEL_REGISTRY.balanced.friendlyName,
    exactName: MODEL_REGISTRY.balanced.exactName,
    description: MODEL_REGISTRY.balanced.description,
    badgeLabel: MODEL_REGISTRY.balanced.badgeLabel,
    icon: <Scale className="w-4 h-4" />,
    iconBg: "bg-violet-500/10",
    iconColor: "text-violet-400",
  },
  {
    id: "powerful",
    friendlyName: MODEL_REGISTRY.powerful.friendlyName,
    exactName: MODEL_REGISTRY.powerful.exactName,
    description: MODEL_REGISTRY.powerful.description,
    badgeLabel: MODEL_REGISTRY.powerful.badgeLabel,
    icon: <Brain className="w-4 h-4" />,
    iconBg: "bg-amber-500/10",
    iconColor: "text-amber-400",
  },
  {
    id: "creative",
    friendlyName: MODEL_REGISTRY.creative.friendlyName,
    exactName: MODEL_REGISTRY.creative.exactName,
    description: MODEL_REGISTRY.creative.description,
    badgeLabel: MODEL_REGISTRY.creative.badgeLabel,
    icon: <Palette className="w-4 h-4" />,
    iconBg: "bg-emerald-500/10",
    iconColor: "text-emerald-400",
  },
  {
    id: "fast",
    friendlyName: MODEL_REGISTRY.fast.friendlyName,
    exactName: MODEL_REGISTRY.fast.exactName,
    description: MODEL_REGISTRY.fast.description,
    badgeLabel: MODEL_REGISTRY.fast.badgeLabel,
    icon: <Zap className="w-4 h-4" />,
    iconBg: "bg-blue-500/10",
    iconColor: "text-blue-400",
  },
];

/** Badge styles keyed by badgeLabel (what the server sends back). */
export const BADGE_STYLE: Record<string, { color: string; bg: string }> = {
  [MODEL_REGISTRY.balanced.badgeLabel]: { color: "text-violet-400",  bg: "bg-violet-500/10"  },
  [MODEL_REGISTRY.powerful.badgeLabel]: { color: "text-amber-400",   bg: "bg-amber-500/10"   },
  [MODEL_REGISTRY.creative.badgeLabel]: { color: "text-emerald-400", bg: "bg-emerald-500/10" },
  [MODEL_REGISTRY.fast.badgeLabel]:     { color: "text-blue-400",    bg: "bg-blue-500/10"    },
};

/** @deprecated use BADGE_STYLE */
export const MODEL_USED_STYLES = BADGE_STYLE;
