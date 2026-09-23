import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Shared interaction; config formats and launch semantics stay in app adapters. */
export function InstanceSelector({
  instances,
  value,
  disabled,
  label,
  addLabel,
  onSelect,
  onAdd,
}: {
  instances: readonly { id: string; name: string }[];
  value: string;
  disabled?: boolean;
  label: string;
  addLabel: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <Select
        value={value}
        onValueChange={onSelect}
        disabled={disabled || !instances.length}
      >
        <SelectTrigger aria-label={label} className="min-w-0 flex-1">
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          {instances.map((i) => (
            <SelectItem key={i.id} value={i.id}>
              {i.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="outline" disabled={disabled} onClick={onAdd}>
        <Plus className="h-4 w-4" />
        {addLabel}
      </Button>
    </div>
  );
}
