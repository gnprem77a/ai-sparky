import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown } from "lucide-react";

export type ModelId = "claude-sonnet" | "claude-opus";

export interface ModelOption {
  id: ModelId;
  label: string;
  shortLabel: string;
  badge: string;
}

export const MODELS: ModelOption[] = [
  {
    id: "claude-sonnet",
    label: "Claude 3.5 Sonnet",
    shortLabel: "Sonnet",
    badge: "Fast",
  },
  {
    id: "claude-opus",
    label: "Claude 3 Opus",
    shortLabel: "Opus",
    badge: "Powerful",
  },
];

interface ModelSelectorProps {
  value: ModelId;
  onChange: (model: ModelId) => void;
  disabled?: boolean;
}

export function ModelSelector({ value, onChange, disabled }: ModelSelectorProps) {
  const selected = MODELS.find((m) => m.id === value);

  return (
    <Select value={value} onValueChange={(v) => onChange(v as ModelId)} disabled={disabled}>
      <SelectTrigger
        data-testid="select-model"
        className="h-8 gap-1 border-0 bg-transparent shadow-none text-sm font-medium text-foreground/80 w-auto px-2 focus:ring-0 focus:ring-offset-0"
      >
        <span className="font-medium">{selected?.label}</span>
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground ml-0.5 opacity-60" />
      </SelectTrigger>
      <SelectContent className="min-w-[200px]">
        {MODELS.map((model) => (
          <SelectItem key={model.id} value={model.id} data-testid={`option-model-${model.id}`}>
            <div className="flex items-center justify-between gap-4 w-full">
              <span className="font-medium">{model.label}</span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground uppercase tracking-wide">
                {model.badge}
              </span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
