import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  ChevronDown,
  ChevronsUpDown,
  FolderOpen,
  Play,
  RefreshCw,
  X,
} from "lucide-react";
import { open as pickFile } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { InstanceSelector } from "@/components/common/InstanceSelector";
import {
  codexInstancesApi as api,
  type CodexInstance,
  type InstanceCandidate,
  type InstanceDiscovery,
} from "@/lib/api/codexInstances";
import { settingsApi } from "@/lib/api/settings";

export function CodexInstances({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { t } = useTranslation();
  const label = (key: string) => t(`codexInstances.${key}`);
  const [instances, setInstances] = useState<CodexInstance[]>([]);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"add" | "manage">("add");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const empty = { name: "", configDir: "", userDataDir: "", appPath: "" };
  const [form, setForm] = useState(empty);
  const [discovery, setDiscovery] = useState<InstanceDiscovery | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [discoveryError, setDiscoveryError] = useState("");
  const [scan, setScan] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [chosen, setChosen] = useState<InstanceCandidate | null>(null);
  const current = instances.find((i) => i.id === selectedId);
  const displayPath = (path: string) => {
    const home = discovery?.searchDir.replace(/\/$/, "");
    return home && path.startsWith(`${home}/`)
      ? `~${path.slice(home.length)}`
      : path;
  };
  const choose = (candidate: InstanceCandidate) => {
    setChosen(candidate);
    setError("");
    setForm({ ...empty, name: candidate.name, configDir: candidate.configDir });
    setPickerOpen(false);
  };
  const add = () => {
    setForm(empty);
    setChosen(null);
    setAdvanced(false);
    setPickerOpen(false);
    setError("");
    setMode("add");
    setOpen(true);
  };
  const load = async () => {
    const list = await api.list();
    setInstances(list);
  };
  useEffect(() => {
    let active = true;
    api
      .list()
      .then((list) => {
        if (active) setInstances(list);
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    let active = true;
    setDetecting(true);
    setDiscoveryError("");
    api
      .discover()
      .then((result) => {
        if (active) setDiscovery(result);
      })
      .catch((e) => {
        if (active) setDiscoveryError(String(e));
      })
      .finally(() => {
        if (active) setDetecting(false);
      });
    return () => {
      active = false;
    };
  }, [open, scan]);
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const pickConfig = () =>
    void run(async () => {
      const path = await pickFile({
        title: label("pickConfig"),
        multiple: false,
        directory: false,
        defaultPath:
          form.configDir ||
          discovery?.configs[0]?.configDir ||
          discovery?.searchDir,
        filters: [{ name: "Codex config.toml", extensions: ["toml"] }],
      });
      if (typeof path === "string") choose(await api.inspectConfig(path));
    });
  return (
    <>
      <div className="flex items-center gap-1 max-w-[19rem]">
        <InstanceSelector
          instances={[
            { id: "default", name: label("defaultInstance") },
            ...instances,
          ]}
          value={selectedId ?? "default"}
          disabled={busy}
          label={label("select")}
          addLabel={label("register")}
          onSelect={(id) => onSelect(id === "default" ? null : id)}
          onManage={() => {
            setError("");
            setMode("manage");
            setOpen(true);
          }}
          manageLabel={label("instanceSettings")}
          onAdd={add}
          onLaunch={
            current?.appPath
              ? () =>
                  void run(async () => {
                    await api.launch(current.id);
                    toast.success(label("launched"));
                  })
              : undefined
          }
          launchLabel={label("launch")}
        />
      </div>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!busy) {
            setOpen(v);
            if (!v) setPickerOpen(false);
          }
        }}
      >
        {/* Match ProfileSwitcher creation / ProfileManageDialog, including their header/footer overrides. */}
        <DialogContent
          zIndex="top"
          className={mode === "add" ? "max-w-sm" : "max-w-md"}
        >
          <DialogHeader className="space-y-3 border-b-0 bg-transparent pb-0">
            <DialogTitle>
              {label(mode === "add" ? "register" : "instanceSettings")}
            </DialogTitle>
            <DialogDescription>
              {label(mode === "add" ? "addDescription" : "manageDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto px-6 pb-2 pt-3 space-y-4">
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {mode === "manage" ? (
              <div className="space-y-1">
                {instances.length === 0 && (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    {label("noInstances")}
                  </p>
                )}
                {instances.map((i) => (
                  <div
                    key={i.id}
                    className="flex items-center gap-1.5 rounded-md px-2 py-1.5 hover:bg-muted/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{i.name}</p>
                      <p
                        className="truncate text-xs text-muted-foreground"
                        title={i.configDir}
                      >
                        {displayPath(i.configDir)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={busy || !i.appPath}
                      title={label("launch")}
                      onClick={() =>
                        void run(async () => {
                          await api.launch(i.id);
                          toast.success(label("launched"));
                        })
                      }
                    >
                      <Play className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={busy}
                      title={label("forget")}
                      onClick={() =>
                        void run(async () => {
                          await api.forget(i.id);
                          await load();
                          setScan((n) => n + 1);
                          if (selectedId === i.id) onSelect(null);
                        })
                      }
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="instance-config">
                      {label("chooseConfig")}
                    </Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-1.5"
                      disabled={busy}
                      title={label("pickConfig")}
                      onClick={pickConfig}
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                      {label("fromFile")}
                    </Button>
                  </div>
                  <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        id="instance-config"
                        variant="outline"
                        role="combobox"
                        aria-expanded={pickerOpen}
                        aria-label={label("chooseConfig")}
                        disabled={busy}
                        className="w-full justify-between rounded-md px-3 font-normal"
                      >
                        <span className="truncate text-foreground">
                          {chosen?.name ?? label("configPlaceholder")}
                        </span>
                        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      className="z-[120] w-[var(--radix-popover-trigger-width)] p-0"
                    >
                      <Command
                        label={label("searchConfigs")}
                        filter={(value, search, keywords) =>
                          [value, ...(keywords ?? [])]
                            .join(" ")
                            .toLowerCase()
                            .includes(search.toLowerCase())
                            ? 1
                            : 0
                        }
                      >
                        <CommandInput
                          placeholder={label("searchConfigs")}
                          aria-label={label("searchConfigs")}
                        />
                        <CommandList>
                          {detecting ? (
                            <p
                              role="status"
                              className="px-3 py-4 text-sm text-muted-foreground"
                            >
                              {label("detecting")}
                            </p>
                          ) : (
                            <>
                              <CommandEmpty>
                                {label(
                                  discovery?.configs.length
                                    ? "noMatches"
                                    : "noConfigs",
                                )}
                              </CommandEmpty>
                              <CommandGroup>
                                {(discovery?.configs ?? []).map((c) => (
                                  <CommandItem
                                    key={c.configDir}
                                    value={c.configDir}
                                    keywords={[
                                      c.name,
                                      c.model ?? "",
                                      c.provider ?? "",
                                    ]}
                                    onSelect={() => choose(c)}
                                  >
                                    <Check
                                      className={
                                        form.configDir === c.configDir
                                          ? "opacity-100"
                                          : "opacity-0"
                                      }
                                    />
                                    <span className="min-w-0 flex-1">
                                      <span className="flex items-center gap-2">
                                        <span className="truncate">
                                          {c.name}
                                        </span>
                                        <span className="ml-auto truncate text-xs text-muted-foreground">
                                          {c.model}
                                        </span>
                                      </span>
                                      <span
                                        className="block truncate text-xs text-muted-foreground"
                                        title={c.configDir}
                                      >
                                        {displayPath(c.configDir)}
                                      </span>
                                    </span>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </>
                          )}
                        </CommandList>
                      </Command>
                      <div className="border-t px-1 py-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start"
                          disabled={detecting || busy}
                          onClick={() => setScan((n) => n + 1)}
                        >
                          <RefreshCw
                            className={`h-3.5 w-3.5 ${detecting ? "animate-spin" : ""}`}
                          />
                          {label("rescan")}
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                  {chosen && (
                    <p
                      className="truncate text-xs text-muted-foreground"
                      title={`${form.configDir}/config.toml`}
                    >
                      {displayPath(form.configDir)} ·{" "}
                      {chosen.model || label("noModel")}
                    </p>
                  )}
                  {discoveryError && (
                    <p
                      role="alert"
                      className="text-xs text-destructive"
                      title={discoveryError}
                    >
                      {label("discoveryFailed")}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="instance-name">{label("name")}</Label>
                  <Input
                    id="instance-name"
                    value={form.name}
                    disabled={busy || !chosen}
                    placeholder={label("namePlaceholder")}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <Collapsible open={advanced} onOpenChange={setAdvanced}>
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-0 hover:bg-transparent"
                      disabled={busy || !chosen}
                    >
                      <ChevronDown
                        className={`h-3.5 w-3.5 transition-transform ${advanced ? "rotate-180" : ""}`}
                      />
                      {label("launchSettings")}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-3 pt-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="instance-appPath">
                        {label("appPath")}
                      </Label>
                      <div className="flex gap-2">
                        <Select
                          value={form.appPath || "none"}
                          disabled={busy}
                          onValueChange={(v) =>
                            setForm({ ...form, appPath: v === "none" ? "" : v })
                          }
                        >
                          <SelectTrigger
                            id="instance-appPath"
                            className="min-w-0 flex-1"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="z-[120]">
                            <SelectItem value="none">
                              {label("manageOnly")}
                            </SelectItem>
                            {[
                              ...new Set([
                                ...(discovery?.apps ?? []),
                                ...(form.appPath ? [form.appPath] : []),
                              ]),
                            ].map((path) => (
                              <SelectItem key={path} value={path} title={path}>
                                {path
                                  .split("/")
                                  .pop()
                                  ?.replace(/\.app$/, "")}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="outline"
                          size="icon"
                          className="shrink-0"
                          title={label("pickApp")}
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              const path = await pickFile({
                                multiple: false,
                                filters: [
                                  {
                                    name: "macOS application",
                                    extensions: ["app"],
                                  },
                                ],
                              });
                              if (typeof path === "string")
                                setForm((old) => ({ ...old, appPath: path }));
                            })
                          }
                        >
                          <FolderOpen className="h-4 w-4" />
                        </Button>
                      </div>
                      {form.appPath && (
                        <p
                          className="truncate text-xs text-muted-foreground"
                          title={form.appPath}
                        >
                          {displayPath(form.appPath)}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {label("launcherHelp")}
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="instance-userDataDir">
                        {label("userDataDir")}
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          id="instance-userDataDir"
                          value={form.userDataDir}
                          disabled={busy}
                          placeholder={label("userDataDirPlaceholder")}
                          aria-describedby="instance-data-help"
                          onChange={(e) =>
                            setForm({ ...form, userDataDir: e.target.value })
                          }
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          className="shrink-0"
                          title={label("browse")}
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              const path = await settingsApi.pickDirectory(
                                form.userDataDir || undefined,
                              );
                              if (typeof path === "string")
                                setForm((old) => ({
                                  ...old,
                                  userDataDir: path,
                                }));
                            })
                          }
                        >
                          <FolderOpen className="h-4 w-4" />
                        </Button>
                      </div>
                      <p
                        id="instance-data-help"
                        className="text-xs text-muted-foreground"
                      >
                        {label("userDataHelp")}
                      </p>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </>
            )}
          </div>
          <DialogFooter className="flex gap-2 border-t-0 bg-transparent pt-2 sm:justify-end">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              {label(mode === "add" ? "cancel" : "close")}
            </Button>
            {mode === "manage" ? (
              <Button disabled={busy} onClick={add}>
                {label("register")}
              </Button>
            ) : (
              <Button
                disabled={busy || !form.name.trim() || !form.configDir.trim()}
                onClick={() =>
                  void run(async () => {
                    const item = await api.register({
                      ...form,
                      userDataDir: form.userDataDir.trim() || null,
                      appPath: form.appPath || null,
                    });
                    await load();
                    onSelect(item.id);
                    setOpen(false);
                    setForm(empty);
                    setChosen(null);
                  })
                }
              >
                {label("add")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
