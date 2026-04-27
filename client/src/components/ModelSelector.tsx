import { Sparkles, Scale, Brain, Palette, Zap, Lock, Crown, Search, Layers, FlaskConical } from "lucide-react";
import { MODEL_REGISTRY } from "@shared/models";
import { cn } from "@/lib/utils";

export type ModelId = "auto" | "balanced" | "powerful" | "creative" | "fast" | "sonnet" | "minimax" | "kimi";

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
    description: "Best model auto-selected per query",
    badgeLabel: "Auto",
    icon: <Sparkles className="w-4 h-4" />,
    iconBg: "bg-cyan-500/10",
    iconColor: "text-cyan-400",
    proOnly: false,
  },
  {
    id: "powerful",
    friendlyName: "Powerful",
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
    id: "sonnet",
    friendlyName: "Sonnet",
    exactName: MODEL_REGISTRY.sonnet.exactName,
    description: MODEL_REGISTRY.sonnet.description,
    badgeLabel: MODEL_REGISTRY.sonnet.badgeLabel,
    icon: <Brain className="w-4 h-4" />,
    iconBg: "bg-rose-500/10",
    iconColor: "text-rose-400",
    proOnly: false,
    isNew: true,
  },
  {
    id: "balanced",
    friendlyName: "Balanced",
    exactName: MODEL_REGISTRY.balanced.exactName,
    description: MODEL_REGISTRY.balanced.description,
    badgeLabel: MODEL_REGISTRY.balanced.badgeLabel,
    icon: <Scale className="w-4 h-4" />,
    iconBg: "bg-violet-500/10",
    iconColor: "text-violet-400",
    proOnly: false,
  },
  {
    id: "creative",
    friendlyName: "Creative",
    exactName: MODEL_REGISTRY.creative.exactName,
    description: MODEL_REGISTRY.creative.description,
    badgeLabel: MODEL_REGISTRY.creative.badgeLabel,
    icon: <Palette className="w-4 h-4" />,
    iconBg: "bg-emerald-500/10",
    iconColor: "text-emerald-400",
    proOnly: false,
  },
  {
    id: "fast",
    friendlyName: "Fast",
    exactName: MODEL_REGISTRY.fast.exactName,
    description: MODEL_REGISTRY.fast.description,
    badgeLabel: MODEL_REGISTRY.fast.badgeLabel,
    icon: <Zap className="w-4 h-4" />,
    iconBg: "bg-blue-500/10",
    iconColor: "text-blue-400",
    proOnly: false,
  },
  {
    id: "minimax",
    friendlyName: "MiniMax",
    exactName: MODEL_REGISTRY.minimax.exactName,
    description: MODEL_REGISTRY.minimax.description,
    badgeLabel: MODEL_REGISTRY.minimax.badgeLabel,
    icon: <Layers className="w-4 h-4" />,
    iconBg: "bg-teal-500/10",
    iconColor: "text-teal-400",
    proOnly: false,
  },
  {
    id: "kimi",
    friendlyName: "Kimi",
    exactName: MODEL_REGISTRY.kimi.exactName,
    description: MODEL_REGISTRY.kimi.description,
    badgeLabel: MODEL_REGISTRY.kimi.badgeLabel,
    icon: <FlaskConical className="w-4 h-4" />,
    iconBg: "bg-orange-500/10",
    iconColor: "text-orange-400",
    proOnly: false,
  },
];

/**
 * Badge styles keyed by badgeLabel OR raw model name/ID returned by providers.
 * Covers all models currently configured as providers.
 */
export const BADGE_STYLE: Record<string, { color: string; bg: string }> = {
  // ── Friendly badge labels ──────────────────────────────────────
  "Opus 4.7":    { color: "text-amber-400",   bg: "bg-amber-500/10"   },
  "Sonnet 4.5":  { color: "text-rose-400",    bg: "bg-rose-500/10"    },
  "Mistral L3":  { color: "text-violet-400",  bg: "bg-violet-500/10"  },
  "GPT 5.3":     { color: "text-emerald-400", bg: "bg-emerald-500/10" },
  "Haiku":       { color: "text-blue-400",    bg: "bg-blue-500/10"    },
  "Auto":        { color: "text-cyan-400",    bg: "bg-cyan-500/10"    },

  // ── Raw Anthropic / Azure model names ─────────────────────────
  "claude-opus-1715":          { color: "text-amber-400",   bg: "bg-amber-500/10"   },
  "claude-opus-4-7":           { color: "text-amber-400",   bg: "bg-amber-500/10"   },
  "claude-opus-4.7":           { color: "text-amber-400",   bg: "bg-amber-500/10"   },
  "claude-sonnet-4-5":         { color: "text-rose-400",    bg: "bg-rose-500/10"    },
  "claude-sonnet":             { color: "text-rose-400",    bg: "bg-rose-500/10"    },
  "claude-haiku-prod2":        { color: "text-blue-400",    bg: "bg-blue-500/10"    },
  "claude-3-5-haiku-20241022": { color: "text-blue-400",    bg: "bg-blue-500/10"    },
  "claude-haiku-3-5":          { color: "text-blue-400",    bg: "bg-blue-500/10"    },

  // ── Raw Mistral model IDs ──────────────────────────────────────
  "Mistral-Large-3":           { color: "text-violet-400",  bg: "bg-violet-500/10"  },
  "mistral-large-3":           { color: "text-violet-400",  bg: "bg-violet-500/10"  },
  "mistral-large":             { color: "text-violet-400",  bg: "bg-violet-500/10"  },

  // ── Raw GPT model IDs ─────────────────────────────────────────
  "gpt-5.3-chat":              { color: "text-emerald-400", bg: "bg-emerald-500/10" },
  "gpt-5.3":                   { color: "text-emerald-400", bg: "bg-emerald-500/10" },

  // ── MiniMax ───────────────────────────────────────────────────
  "MiniMax M2.5":              { color: "text-teal-400",   bg: "bg-teal-500/10"   },
  "MiniMax-M2.5":              { color: "text-teal-400",   bg: "bg-teal-500/10"   },
  "FW-MiniMax-M2.5":           { color: "text-teal-400",   bg: "bg-teal-500/10"   },
  "minimax-m2.5":              { color: "text-teal-400",   bg: "bg-teal-500/10"   },

  // ── Kimi ─────────────────────────────────────────────────────
  "Kimi K2.5":                 { color: "text-orange-400", bg: "bg-orange-500/10" },
  "Kimi-K2.5":                 { color: "text-orange-400", bg: "bg-orange-500/10" },
  "kimi-2.5":                  { color: "text-orange-400", bg: "bg-orange-500/10" },

  // ── Computed from MODEL_REGISTRY (stays in sync) ──────────────
  [MODEL_REGISTRY.powerful.badgeLabel]: { color: "text-amber-400",   bg: "bg-amber-500/10"   },
  [MODEL_REGISTRY.balanced.badgeLabel]: { color: "text-violet-400",  bg: "bg-violet-500/10"  },
  [MODEL_REGISTRY.creative.badgeLabel]: { color: "text-emerald-400", bg: "bg-emerald-500/10" },
  [MODEL_REGISTRY.fast.badgeLabel]:     { color: "text-blue-400",    bg: "bg-blue-500/10"    },
  [MODEL_REGISTRY.minimax.badgeLabel]:  { color: "text-teal-400",    bg: "bg-teal-500/10"    },
  [MODEL_REGISTRY.kimi.badgeLabel]:     { color: "text-orange-400",  bg: "bg-orange-500/10"  },
};

/** @deprecated use BADGE_STYLE */
export const MODEL_USED_STYLES = BADGE_STYLE;

/**
 * Maps a raw provider modelName (as returned by the server) to a short, friendly label
 * shown in chat message badges. Falls back to the raw string trimmed to 20 chars.
 */
const RAW_TO_FRIENDLY: Record<string, string> = {
  "claude-opus-1715":    "Opus 4.7",
  "claude-opus-4-7":     "Opus 4.7",
  "claude-opus-4.7":     "Opus 4.7",
  "claude-sonnet-4-5":   "Sonnet 4.5",
  "claude-sonnet":       "Sonnet 4.5",
  "claude-haiku-prod2":  "Haiku",
  "Mistral-Large-3":     "Mistral L3",
  "mistral-large-3":     "Mistral L3",
  "gpt-5.3-chat":        "GPT 5.3",
  "gpt-5.3":             "GPT 5.3",
  "FW-MiniMax-M2.5":     "MiniMax M2.5",
  "MiniMax-M2.5":        "MiniMax M2.5",
  "minimax-m2.5":        "MiniMax M2.5",
  "Kimi-K2.5":           "Kimi K2.5",
  "kimi-2.5":            "Kimi K2.5",
};

export function getFriendlyModelLabel(raw: string): string {
  return RAW_TO_FRIENDLY[raw] ?? (raw.length > 20 ? raw.slice(0, 20) + "…" : raw);
}

interface ModelSelectorDropdownProps {
  selectedId: ModelId;
  onSelect: (id: ModelId) => void;
  isPro: boolean;
  onClose: () => void;
}

export function ModelSelectorDropdown({ selectedId, onSelect, isPro, onClose }: ModelSelectorDropdownProps) {
  return (
    <div className="absolute bottom-full mb-2 left-0 z-50 w-[300px] rounded-xl border border-border bg-popover shadow-2xl overflow-hidden py-1.5">
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
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
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
              <p className="text-[11px] text-muted-foreground truncate">{m.exactName} · {m.description}</p>
            </div>
          </button>
        );
      })}

      {/* KB-only models note */}
      <div className="mx-2 mt-1 px-3 py-2 rounded-lg bg-muted/30 border border-border/40 flex items-start gap-2">
        <Search className="w-3 h-3 text-muted-foreground/60 mt-0.5 flex-shrink-0" />
        <p className="text-[10px] text-muted-foreground/60 leading-snug">
          <span className="font-semibold text-muted-foreground/80">Cohere Rerank</span> &amp; <span className="font-semibold text-muted-foreground/80">Embed v4</span> power your Knowledge Base search automatically.
        </p>
      </div>

      {!isPro && (
        <div className="mx-2 mt-1 mb-0.5 px-3 py-2 rounded-lg bg-amber-500/8 border border-amber-500/15">
          <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
            Upgrade to Pro to unlock all models including Opus 4.7
          </p>
        </div>
      )}
    </div>
  );
}
