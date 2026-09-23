import { useState } from "react";
import {
  Check,
  ChevronsUpDown,
  Layers,
  Plus,
  Settings2,
  Play,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

/** Uses the same trigger, popover and menu spacing as ProfileSwitcher. */
export function InstanceSelector({
  instances,
  value,
  disabled,
  label,
  addLabel,
  onSelect,
  onAdd,
  onManage,
  manageLabel,
  onLaunch,
  launchLabel,
}: {
  instances: readonly { id: string; name: string }[];
  value: string;
  disabled?: boolean;
  label: string;
  addLabel: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onManage?: () => void;
  manageLabel?: string;
  onLaunch?: () => void;
  launchLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = instances.find((i) => i.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-label={label}
          disabled={disabled}
          title={label}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/5 text-muted-foreground disabled:opacity-50"
        >
          <Layers className="h-4 w-4 shrink-0 opacity-70" />
          <span className="max-w-[9rem] truncate">
            {current?.name ?? label}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={6}
        className="z-[100] w-64 p-0"
      >
        <Command>
          <CommandList>
            <CommandGroup>
              {instances.map((i) => (
                <CommandItem
                  key={i.id}
                  value={i.id}
                  onSelect={() => {
                    setOpen(false);
                    onSelect(i.id);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      i.id === value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate">{i.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <div className="mx-1 my-1 h-px bg-border" />
            <CommandGroup>
              <CommandItem
                onSelect={() => {
                  setOpen(false);
                  onAdd();
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                {addLabel}
              </CommandItem>
              {onManage && (
                <CommandItem
                  onSelect={() => {
                    setOpen(false);
                    onManage();
                  }}
                >
                  <Settings2 className="mr-2 h-4 w-4" />
                  {manageLabel}
                </CommandItem>
              )}
              {onLaunch && (
                <CommandItem
                  onSelect={() => {
                    setOpen(false);
                    onLaunch();
                  }}
                >
                  <Play className="mr-2 h-4 w-4" />
                  {launchLabel}
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
