import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Layers, Play, FolderOpen, RotateCcw, Trash2 } from "lucide-react";
import { parse } from "smol-toml";
import { open as pickFile } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FullScreenPanel } from "@/components/common/FullScreenPanel";
import { InstanceSelector } from "@/components/common/InstanceSelector";
import JsonEditor from "@/components/JsonEditor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  codexInstancesApi as api,
  type CodexInstance,
  type InstanceConfig,
} from "@/lib/api/codexInstances";
import { providersApi } from "@/lib/api/providers";
import { settingsApi } from "@/lib/api/settings";
import type { Provider } from "@/types";

export function CodexInstances() {
  const { t } = useTranslation();
  const label = (key: string) => t(`codexInstances.${key}`);
  const [open, setOpen] = useState(false);
  const [instances, setInstances] = useState<CodexInstance[]>([]);
  const [providers, setProviders] = useState<Record<string, Provider>>({});
  const [snapshot, setSnapshot] = useState<InstanceConfig | null>(null);
  const [draft, setDraft] = useState("");
  const [model, setModel] = useState("");
  const [effort, setEffort] = useState("xhigh");
  const [modelBaseline, setModelBaseline] = useState({
    model: "",
    effort: "xhigh",
  });
  const [preset, setPreset] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    name: "",
    configDir: "",
    userDataDir: "",
    appPath: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [discard, setDiscard] = useState<(() => void) | null>(null);
  const [forget, setForget] = useState(false);
  const [dark, setDark] = useState(
    document.documentElement.classList.contains("dark"),
  );
  const modelDirty =
    model !== modelBaseline.model || effort !== modelBaseline.effort;
  const dirty = snapshot !== null && (draft !== snapshot.config || modelDirty);
  const formDirty = adding && Object.values(form).some(Boolean);
  useEffect(() => {
    const observer = new MutationObserver(() =>
      setDark(document.documentElement.classList.contains("dark")),
    );
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

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
  const replaceDraft = (config: string) => {
    setDraft(config);
    try {
      const d = parse(config);
      const next = {
        model: typeof d.model === "string" ? d.model : "",
        effort:
          typeof d.model_reasoning_effort === "string"
            ? d.model_reasoning_effort
            : "xhigh",
      };
      setModel(next.model);
      setEffort(next.effort);
      setModelBaseline(next);
    } catch {
      /* Keep invalid text visible so the user can correct it. */
    }
  };
  const accept = (value: InstanceConfig) => {
    setSnapshot(value);
    replaceDraft(value.config);
    setPreset("");
    setAdding(false);
    setForget(false);
    setForm({ name: "", configDir: "", userDataDir: "", appPath: "" });
  };
  const guard = (action: () => void) => {
    if (busy) return;
    if (dirty || formDirty) setDiscard(() => action);
    else action();
  };
  const load = (id: string) =>
    run(async () => {
      accept(await api.read(id));
    });
  const begin = () => {
    setOpen(true);
    setForm({ name: "", configDir: "", userDataDir: "", appPath: "" });
    setSnapshot(null);
    setAdding(false);
    void run(async () => {
      const [list, all] = await Promise.all([
        api.list(),
        providersApi.getAll("codex"),
      ]);
      setInstances(list);
      setProviders(all);
      if (list.length) accept(await api.read(list[0].id));
      else setAdding(true);
    });
  };
  const save = () =>
    run(async () => {
      if (!snapshot) return;
      const config = modelDirty
        ? await api.editModel(draft, model, effort)
        : draft;
      accept(await api.save(snapshot.instance.id, snapshot.revision, config));
      toast.success(label("saved"));
    });
  const register = () =>
    run(async () => {
      const item = await api.register({
        ...form,
        appPath: form.appPath.trim() || null,
      });
      setInstances(await api.list());
      accept(await api.read(item.id));
    });
  const footer = (
    <>
      <Button
        variant="outline"
        disabled={busy}
        onClick={() => guard(() => setOpen(false))}
      >
        {label("close")}
      </Button>
      {adding ? (
        <Button
          disabled={
            busy ||
            !form.name.trim() ||
            !form.configDir.trim() ||
            !form.userDataDir.trim()
          }
          onClick={() => void register()}
        >
          {label("register")}
        </Button>
      ) : (
        snapshot && (
          <>
            <Button
              variant="outline"
              disabled={busy || dirty || !snapshot.instance.appPath}
              onClick={() =>
                void run(async () => {
                  await api.launch(snapshot.instance.id);
                  toast.success(label("launched"));
                })
              }
            >
              <Play className="h-4 w-4" />
              {label("launch")}
            </Button>
            <Button
              disabled={busy || !dirty || !!discard}
              onClick={() => void save()}
            >
              {label("save")}
            </Button>
          </>
        )
      )}
    </>
  );

  return (
    <>
      <Button variant="ghost" size="sm" onClick={begin} title={label("title")}>
        <Layers className="h-4 w-4" />
        {label("entry")}
      </Button>
      <FullScreenPanel
        isOpen={open}
        title={label("title")}
        onClose={() => guard(() => setOpen(false))}
        footer={footer}
        motionPreset="slide-from-right"
      >
        <div className="mx-auto max-w-3xl space-y-6">
          <p className="text-sm text-muted-foreground">
            {label("description")}
          </p>
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400 whitespace-pre-wrap"
            >
              {error}
            </p>
          )}
          {discard && (
            <div
              role="alert"
              className="rounded-lg border border-border-default bg-muted/30 p-4 space-y-3"
            >
              <p className="text-sm">{label("unsaved")}</p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setDiscard(null)}>
                  {label("keepEditing")}
                </Button>
                <Button
                  onClick={() => {
                    const action = discard;
                    setDiscard(null);
                    action();
                  }}
                >
                  {label("discard")}
                </Button>
              </div>
            </div>
          )}
          <InstanceSelector
            instances={instances}
            value={adding ? "" : (snapshot?.instance.id ?? "")}
            disabled={busy || !!discard}
            label={label("select")}
            addLabel={label("register")}
            onSelect={(id) =>
              guard(() => {
                void load(id);
              })
            }
            onAdd={() =>
              guard(() => {
                setAdding(true);
                setForm({
                  name: "",
                  configDir: "",
                  userDataDir: "",
                  appPath: "",
                });
                setSnapshot(null);
                setDraft("");
              })
            }
          />
          {adding ? (
            <div className="rounded-xl border border-border-default bg-card p-5 space-y-4">
              <h3 className="text-base font-semibold">{label("register")}</h3>
              <p className="text-sm text-muted-foreground">
                {label("registerHelp")}
              </p>
              {(["name", "configDir", "userDataDir", "appPath"] as const).map(
                (key) => (
                  <div key={key} className="space-y-2">
                    <Label htmlFor={`instance-${key}`}>{label(key)}</Label>
                    <div className="flex gap-2">
                      <Input
                        id={`instance-${key}`}
                        disabled={busy}
                        value={form[key]}
                        onChange={(e) =>
                          setForm({ ...form, [key]: e.target.value })
                        }
                        placeholder={label(`${key}Placeholder`)}
                      />
                      {key !== "name" && (
                        <Button
                          variant="outline"
                          size="icon"
                          disabled={busy}
                          title={label("browse")}
                          aria-label={`${label("browse")} ${label(key)}`}
                          onClick={() =>
                            void run(async () => {
                              const path =
                                key === "appPath"
                                  ? await pickFile({
                                      multiple: false,
                                      directory: false,
                                      filters: [
                                        {
                                          name: "macOS application",
                                          extensions: ["app"],
                                        },
                                      ],
                                    })
                                  : await settingsApi.pickDirectory(
                                      form[key] || undefined,
                                    );
                              if (typeof path === "string")
                                setForm((prev) => ({ ...prev, [key]: path }));
                            })
                          }
                        >
                          <FolderOpen className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ),
              )}
              <p className="text-xs text-muted-foreground">
                {label("launcherHelp")}
              </p>
            </div>
          ) : (
            snapshot && (
              <>
                <div className="rounded-xl border border-border-default bg-card p-5 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold">
                        <strong>{snapshot.instance.name}</strong>
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {snapshot.provider ?? "openai"} ·{" "}
                        {snapshot.model ?? "—"} · {snapshot.effort ?? "—"}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        guard(() => {
                          void load(snapshot.instance.id);
                        })
                      }
                    >
                      <RotateCcw className="h-4 w-4" />
                      {label("reload")}
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_12rem] gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="instance-model">{label("model")}</Label>
                      <Input
                        id="instance-model"
                        value={model}
                        disabled={busy}
                        onChange={(e) => setModel(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="instance-effort">{label("effort")}</Label>
                      <Select
                        value={effort}
                        disabled={busy}
                        onValueChange={setEffort}
                      >
                        <SelectTrigger id="instance-effort">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[
                            "none",
                            "minimal",
                            "low",
                            "medium",
                            "high",
                            "xhigh",
                            "max",
                            "ultra",
                          ].map((v) => (
                            <SelectItem key={v} value={v}>
                              {v}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {label("modelHelp")}
                  </p>
                </div>
                <Accordion
                  type="multiple"
                  className="rounded-xl border border-border-default bg-card px-5"
                >
                  <AccordionItem value="paths">
                    <AccordionTrigger>
                      {label("instanceSettings")}
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-3 text-sm break-all">
                        <div>
                          <Label>{label("target")}</Label>
                          <p className="mt-1 text-muted-foreground">
                            {snapshot.instance.configDir}/config.toml
                          </p>
                        </div>
                        <div>
                          <Label>{label("userDataDir")}</Label>
                          <p className="mt-1 text-muted-foreground">
                            {snapshot.instance.userDataDir}
                          </p>
                        </div>
                        <div>
                          <Label>{label("appPath")}</Label>
                          <p className="mt-1 text-muted-foreground">
                            {snapshot.instance.appPath ?? "—"}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy || dirty}
                          onClick={() => setForget(true)}
                        >
                          <Trash2 className="h-4 w-4" />
                          {label("forget")}
                        </Button>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="preset">
                    <AccordionTrigger>{label("importPreset")}</AccordionTrigger>
                    <AccordionContent>
                      <p className="text-xs text-muted-foreground mb-3">
                        {label("presetHelp")}
                      </p>
                      <div className="flex gap-3">
                        <Select
                          value={preset}
                          disabled={busy}
                          onValueChange={setPreset}
                        >
                          <SelectTrigger aria-label={label("preset")}>
                            <SelectValue placeholder={label("preset")} />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.values(providers).map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="outline"
                          disabled={busy || !preset}
                          onClick={() =>
                            void run(async () =>
                              replaceDraft(
                                await api.previewProvider(draft, preset),
                              ),
                            )
                          }
                        >
                          {label("preview")}
                        </Button>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="config" className="border-b-0">
                    <AccordionTrigger>{label("advanced")}</AccordionTrigger>
                    <AccordionContent>
                      <p className="mb-3 text-xs text-muted-foreground">
                        {label("configHelp")}
                      </p>
                      <JsonEditor
                        ariaLabel={label("config")}
                        value={draft}
                        onChange={replaceDraft}
                        darkMode={dark}
                        language="javascript"
                        showValidation={false}
                        height={300}
                        readOnly={busy}
                      />
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
                <p className="text-xs text-muted-foreground break-all">
                  {label("target")}: {snapshot.instance.configDir}/config.toml
                  <br />
                  {label("saveHelp")}
                </p>
                {forget && (
                  <div
                    role="alert"
                    className="rounded-lg border border-border-default p-4 space-y-3"
                  >
                    <p className="text-sm">{label("forgetHelp")}</p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setForget(false)}
                        disabled={busy}
                      >
                        {label("cancel")}
                      </Button>
                      <Button
                        variant="destructive"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await api.forget(snapshot.instance.id);
                            const list = await api.list();
                            setInstances(list);
                            if (list.length) accept(await api.read(list[0].id));
                            else {
                              setSnapshot(null);
                              setAdding(true);
                              setForget(false);
                            }
                          })
                        }
                      >
                        {label("forget")}
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )
          )}
        </div>
      </FullScreenPanel>
    </>
  );
}
