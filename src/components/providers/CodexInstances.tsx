import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Layers, Play, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  codexInstancesApi as api,
  type CodexInstance,
  type InstanceConfig,
} from "@/lib/api/codexInstances";
import { providersApi } from "@/lib/api/providers";
import type { Provider } from "@/types";

export function CodexInstances() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [instances, setInstances] = useState<CodexInstance[]>([]);
  const [providers, setProviders] = useState<Record<string, Provider>>({});
  const [snapshot, setSnapshot] = useState<InstanceConfig | null>(null);
  const [draft, setDraft] = useState("");
  const [model, setModel] = useState("");
  const [effort, setEffort] = useState("xhigh");
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
  const dirty = snapshot !== null && draft !== snapshot.config;
  const cls = "h-9 rounded-md border bg-background px-3 text-sm w-full";
  const label = (key: string) => t(`codexInstances.${key}`);

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
  const accept = (value: InstanceConfig) => {
    setSnapshot(value);
    setDraft(value.config);
    setModel(value.model ?? "");
    setEffort(value.effort ?? "xhigh");
    setPreset("");
    setAdding(false);
    setForget(false);
  };
  const guard = (action: () => void) => {
    if (busy) return;
    if (dirty) setDiscard(() => action);
    else action();
  };
  const load = (id: string) =>
    run(async () => {
      accept(await api.read(id));
    });
  const begin = () => {
    setOpen(true);
    void run(async () => {
      const [list, all] = await Promise.all([
        api.list(),
        providersApi.getAll("codex"),
      ]);
      setInstances(list);
      setProviders(all);
      if (list.length) accept(await api.read(list[0].id));
      else {
        setSnapshot(null);
        setAdding(true);
      }
    });
  };

  return (
    <>
      <Button variant="ghost" size="sm" onClick={begin} title={label("title")}>
        <Layers className="mr-1 h-4 w-4" />
        {label("title")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) guard(() => setOpen(false));
        }}
      >
        <DialogContent
          zIndex="top"
          className="max-w-4xl max-h-[90vh] overflow-hidden"
        >
          <DialogHeader>
            <div className="flex items-center justify-between gap-2">
              <DialogTitle>{label("title")}</DialogTitle>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => guard(() => setOpen(false))}
              >
                {label("close")}
              </Button>
            </div>
            <DialogDescription>{label("description")}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto space-y-4 px-6 py-4">
            {error && (
              <p
                role="alert"
                className="text-sm text-destructive whitespace-pre-wrap"
              >
                {error}
              </p>
            )}
            {discard && (
              <div role="alert" className="border rounded-lg p-3 space-y-2">
                <p>{label("unsaved")}</p>
                <Button variant="outline" onClick={() => setDiscard(null)}>
                  {label("keepEditing")}
                </Button>
                <Button
                  className="ml-2"
                  onClick={() => {
                    const action = discard;
                    setDiscard(null);
                    action();
                  }}
                >
                  {label("discard")}
                </Button>
              </div>
            )}
            <div className="flex gap-2">
              <select
                className={cls}
                aria-label={label("select")}
                disabled={busy || !!discard}
                value={adding ? "" : (snapshot?.instance.id ?? "")}
                onChange={(e) => {
                  const id = e.target.value;
                  guard(() => {
                    void load(id);
                  });
                }}
              >
                <option value="" disabled>
                  {label("select")}
                </option>
                {instances.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} — {i.configDir}
                  </option>
                ))}
              </select>
              <Button
                variant="outline"
                disabled={busy || !!discard}
                onClick={() =>
                  guard(() => {
                    setAdding(true);
                    setSnapshot(null);
                    setDraft("");
                  })
                }
              >
                <Plus className="mr-1 h-4 w-4" />
                {label("register")}
              </Button>
            </div>
            {adding ? (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    const item = await api.register({
                      ...form,
                      appPath: form.appPath.trim() || null,
                    });
                    setInstances(await api.list());
                    accept(await api.read(item.id));
                    setForm({
                      name: "",
                      configDir: "",
                      userDataDir: "",
                      appPath: "",
                    });
                  });
                }}
              >
                <p className="text-sm text-muted-foreground">
                  {label("registerHelp")}
                </p>
                {(["name", "configDir", "userDataDir", "appPath"] as const).map(
                  (key) => (
                    <label key={key} className="block text-sm space-y-1">
                      <span>{label(key)}</span>
                      <Input
                        disabled={busy}
                        value={form[key]}
                        required={key !== "appPath"}
                        onChange={(e) =>
                          setForm({ ...form, [key]: e.target.value })
                        }
                        placeholder={label(`${key}Placeholder`)}
                      />
                    </label>
                  ),
                )}
                <p className="text-xs text-muted-foreground">
                  {label("launcherHelp")}
                </p>
                <Button type="submit" disabled={busy}>
                  {label("register")}
                </Button>
              </form>
            ) : (
              snapshot && (
                <>
                  <div className="rounded-lg border p-3 text-sm space-y-1 break-all">
                    <p>
                      <strong>{snapshot.instance.name}</strong>
                    </p>
                    <p>
                      {label("target")}: {snapshot.instance.configDir}
                      /config.toml
                    </p>
                    <p>
                      {label("userDataDir")}: {snapshot.instance.userDataDir}
                    </p>
                    <p>
                      {label("savedProvider")}: {snapshot.provider ?? "openai"}{" "}
                      · {snapshot.model ?? "—"} · {snapshot.effort ?? "—"}
                    </p>
                  </div>
                  <div className="grid grid-cols-[1fr_8rem_auto] items-end gap-2">
                    <label className="text-sm space-y-1">
                      <span>{label("model")}</span>
                      <Input
                        value={model}
                        disabled={busy}
                        onChange={(e) => setModel(e.target.value)}
                      />
                    </label>
                    <label className="text-sm space-y-1">
                      <span>{label("effort")}</span>
                      <select
                        className={cls}
                        value={effort}
                        disabled={busy}
                        onChange={(e) => setEffort(e.target.value)}
                      >
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
                          <option key={v}>{v}</option>
                        ))}
                      </select>
                    </label>
                    <Button
                      variant="outline"
                      disabled={busy || !model.trim()}
                      onClick={() =>
                        void run(async () =>
                          setDraft(await api.editModel(draft, model, effort)),
                        )
                      }
                    >
                      {label("updateDraft")}
                    </Button>
                  </div>
                  <details className="rounded-lg border p-3 text-sm">
                    <summary className="cursor-pointer">
                      {label("importPreset")}
                    </summary>
                    <p className="text-muted-foreground py-2">
                      {label("presetHelp")}
                    </p>
                    <div className="flex gap-2">
                      <select
                        className={cls}
                        aria-label={label("preset")}
                        value={preset}
                        disabled={busy}
                        onChange={(e) => setPreset(e.target.value)}
                      >
                        <option value="">{label("preset")}</option>
                        {Object.values(providers).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <Button
                        variant="outline"
                        disabled={busy || !preset}
                        onClick={() =>
                          void run(async () =>
                            setDraft(await api.previewProvider(draft, preset)),
                          )
                        }
                      >
                        {label("preview")}
                      </Button>
                    </div>
                  </details>
                  <label className="block text-sm space-y-1">
                    <span>{label("config")}</span>
                    <textarea
                      aria-label={label("config")}
                      className="w-full min-h-64 rounded-md border bg-background p-3 font-mono text-xs"
                      value={draft}
                      disabled={busy}
                      spellCheck={false}
                      onChange={(e) => setDraft(e.target.value)}
                    />
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {label("saveHelp")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={busy || !dirty || !!discard}
                      onClick={() =>
                        void run(async () => {
                          accept(
                            await api.save(
                              snapshot.instance.id,
                              snapshot.revision,
                              draft,
                            ),
                          );
                          toast.success(label("saved"));
                        })
                      }
                    >
                      {label("save")}
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        guard(() => {
                          void load(snapshot.instance.id);
                        })
                      }
                    >
                      {label("reload")}
                    </Button>
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
                      <Play className="mr-1 h-4 w-4" />
                      {label("launch")}
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={busy || dirty}
                      onClick={() => setForget(true)}
                    >
                      {label("forget")}
                    </Button>
                  </div>
                  {forget && (
                    <div
                      role="alert"
                      className="rounded-lg border p-3 space-y-2"
                    >
                      <p className="text-sm">{label("forgetHelp")}</p>
                      <Button
                        variant="outline"
                        onClick={() => setForget(false)}
                        disabled={busy}
                      >
                        {label("cancel")}
                      </Button>
                      <Button
                        variant="destructive"
                        className="ml-2"
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
                  )}
                </>
              )
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
