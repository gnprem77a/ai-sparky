import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles } from "lucide-react";

export type ModelId = "claude-sonnet" | "claude-opus";

export interface ModelOption {
  id: ModelId;
  label: string;
  description: string;
}

export const MODELS: ModelOption[] = [
  {
    id: "claude-sonnet",
    label: "Claude Sonnet",
    description: "Fast & capable",
  },
  {
    id: "claude-opus",
    label: "Claude Opus",
    description: "Most powerful",
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
        className="h-9 gap-1.5 border-border bg-background text-sm font-medium w-auto min-w-[160px]"
      >
        <Sparkles className="w-3.5 h-3.5 text-primary" />
        <SelectValue>
          {selected?.label}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {MODELS.map((model) => (
          <SelectItem key={model.id} value={model.id} data-testid={`option-model-${model.id}`}>
            <div className="flex flex-col items-start">
              <span className="font-medium">{model.label}</span>
              <span className="text-xs text-muted-foreground">{model.description}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
