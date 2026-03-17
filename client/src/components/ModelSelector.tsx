import { Sparkles, Scale, Brain, Palette, Zap, Lock, Crown } from "lucide-react";
import { MODEL_REGISTRY } from "@shared/models";
import { cn } from "@/lib/utils";

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
  proOnly?: boolean;
  isNew?: boolean;
  isFeatured?: boolean;
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
    proOnly: true,
  },
  {
    id: "powerful",
    friendlyName: MODEL_REGISTRY.powerful.friendlyName,
    exactName: MODEL_REGISTRY.powerful.exactName,
    description: MODEL_REGISTRY.powerful.description,
    badgeLabel: MODEL_REGISTRY.powerful.badgeLabel,
    icon: <Crown className="w-4 h-4" />,
    iconBg: "bg-amber-500/15",
    iconColor: "text-amber-400",
    proOnly: true,
    isNew: true,
    isFeatured: true,
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
    proOnly: true,
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
    proOnly: true,
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
    proOnly: false,
  },
];

/** Badge styles keyed by badgeLabel or raw model name (what the server sends back). */
export const BADGE_STYLE: Record<string, { color: string; bg: string }> = {
  // Friendly labels (MODEL_REGISTRY.*.badgeLabel)
  "Opus 4.6":    { color: "text-amber-400",   bg: "bg-amber-500/10"   },
  "Sonnet 4.6":  { color: "text-violet-400",  bg: "bg-violet-500/10"  },
  "Haiku":       { color: "text-blue-400",    bg: "bg-blue-500/10"    },
  "Auto":        { color: "text-cyan-400",    bg: "bg-cyan-500/10"    },
  // Raw Anthropic model IDs (what providers return as modelName)
  "claude-opus-4-6":      { color: "text-amber-400",   bg: "bg-amber-500/10"   },
  "claude-opus-4.6":      { color: "text-amber-400",   bg: "bg-amber-500/10"   },
  "claude-sonnet-4-6":    { color: "text-violet-400",  bg: "bg-violet-500/10"  },
  "claude-sonnet-4.6":    { color: "text-violet-400",  bg: "bg-violet-500/10"  },
  "claude-3-5-haiku-20241022": { color: "text-blue-400", bg: "bg-blue-500/10" },
  "claude-haiku-3-5":     { color: "text-blue-400",    bg: "bg-blue-500/10"    },
  "claude-haiku-prod2":   { color: "text-blue-400",    bg: "bg-blue-500/10"    },
  // Computed from MODEL_REGISTRY (keeps these in sync)
  [MODEL_REGISTRY.balanced.badgeLabel]: { color: "text-violet-400",  bg: "bg-violet-500/10"  },
  [MODEL_REGISTRY.powerful.badgeLabel]: { color: "text-amber-400",   bg: "bg-amber-500/10"   },
  [MODEL_REGISTRY.creative.badgeLabel]: { color: "text-emerald-400", bg: "bg-emerald-500/10" },
  [MODEL_REGISTRY.fast.badgeLabel]:     { color: "text-blue-400",    bg: "bg-blue-500/10"    },
};

/** @deprecated use BADGE_STYLE */
export const MODEL_USED_STYLES = BADGE_STYLE;

interface ModelSelectorDropdownProps {
  selectedId: ModelId;
  onSelect: (id: ModelId) => void;
  isPro: boolean;
  onClose: () => void;
}

export function ModelSelectorDropdown({ selectedId, onSelect, isPro, onClose }: ModelSelectorDropdownProps) {
  return (
    <div className="absolute bottom-full mb-2 left-0 z-50 w-72 rounded-xl border border-border bg-popover shadow-2xl overflow-hidden py-1.5">
      {MODELS.map((m) => {
        const locked = m.proOnly && !isPro;
        const active = m.id === selectedId;
        return (
          <button
            key={m.id}
            onClick={() => {
              if (locked) return;
              onSelect(m.id);
              onClose();
            }}
            disabled={locked}
            data-testid={`button-model-${m.id}`}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors relative",
              m.isFeatured && !active && "bg-amber-500/4 hover:bg-amber-500/8",
              !m.isFeatured && (active ? "bg-primary/10" : "hover:bg-muted/60"),
              m.isFeatured && active && "bg-amber-500/12",
              locked && "opacity-50 cursor-not-allowed"
            )}
          >
            {m.isFeatured && (
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-500/30 to-transparent" />
            )}
            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0", m.iconBg)}>
              <span className={m.iconColor}>{m.icon}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn(
                  "text-sm font-medium",
                  m.isFeatured ? "text-amber-500 dark:text-amber-400" : (active ? "text-primary" : "text-foreground")
                )}>
                  {m.friendlyName}
                </span>
                {m.isNew && !locked && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/15 text-amber-500 uppercase tracking-wide">
                    New
                  </span>
                )}
                {locked && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/15 text-amber-500">
                    <Lock className="w-2 h-2" /> Pro
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate">{m.exactName}</p>
            </div>
          </button>
        );
      })}
      {!isPro && (
        <div className="mx-2 mt-1 mb-0.5 px-3 py-2 rounded-lg bg-amber-500/8 border border-amber-500/15">
          <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
            Upgrade to Pro to unlock all models including Opus 4.6
          </p>
        </div>
      )}
    </div>
  );
}
