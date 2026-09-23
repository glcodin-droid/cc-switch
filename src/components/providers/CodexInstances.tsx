import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderOpen, Play, Plus, X } from "lucide-react";
import { open as pickFile } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const empty = { name: "", configDir: "", userDataDir: "", appPath: "" };
  const [form, setForm] = useState(empty);
  const current = instances.find((i) => i.id === selectedId);
  const load = async () => {
    const list = await api.list();
    setInstances(list);
    return list;
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
          onManage={() => setOpen(true)}
          manageLabel={label("instanceSettings")}
          onLaunch={
            current?.appPath
              ? () => {
                  void run(async () => {
                    await api.launch(current.id);
                    toast.success(label("launched"));
                  });
                }
              : undefined
          }
          launchLabel={label("launch")}
          onAdd={() => {
            setForm(empty);
            setOpen(true);
          }}
        />
      </div>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!busy) setOpen(v);
        }}
      >
        <DialogContent
          zIndex="top"
          className="max-w-xl max-h-[90vh] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>{label("instanceSettings")}</DialogTitle>
            <DialogDescription>{label("registryHelp")}</DialogDescription>
          </DialogHeader>
          <div className="px-6 py-4 space-y-4">
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {instances.map((i) => (
              <div
                key={i.id}
                className="rounded-lg border border-border-default p-3 flex items-center gap-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{i.name}</p>
                  <p
                    className="text-xs text-muted-foreground truncate"
                    title={i.configDir}
                  >
                    {i.configDir}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={busy || !i.appPath}
                  title={label("launch")}
                  onClick={() =>
                    void run(async () => {
                      await api.launch(i.id);
                      toast.success(label("launched"));
                    })
                  }
                >
                  <Play className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={busy}
                  title={label("forget")}
                  onClick={() =>
                    void run(async () => {
                      await api.forget(i.id);
                      await load();
                      if (selectedId === i.id) onSelect(null);
                    })
                  }
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div className="border-t border-border-default pt-4 space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Plus className="h-4 w-4" />
                {label("register")}
              </h3>
              {(["name", "configDir", "userDataDir", "appPath"] as const).map(
                (key) => (
                  <div key={key} className="space-y-1.5">
                    <Label htmlFor={`instance-${key}`}>{label(key)}</Label>
                    <div className="flex gap-2">
                      <Input
                        id={`instance-${key}`}
                        value={form[key]}
                        disabled={busy}
                        placeholder={label(`${key}Placeholder`)}
                        onChange={(e) =>
                          setForm({ ...form, [key]: e.target.value })
                        }
                      />
                      {key !== "name" && (
                        <Button
                          variant="outline"
                          size="icon"
                          title={label("browse")}
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              const path =
                                key === "appPath"
                                  ? await pickFile({
                                      multiple: false,
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
                                setForm((old) => ({ ...old, [key]: path }));
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
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              {label("close")}
            </Button>
            <Button
              disabled={
                busy ||
                !form.name.trim() ||
                !form.configDir.trim() ||
                !form.userDataDir.trim()
              }
              onClick={() =>
                void run(async () => {
                  const item = await api.register({
                    ...form,
                    appPath: form.appPath || null,
                  });
                  await load();
                  onSelect(item.id);
                  setOpen(false);
                  setForm(empty);
                })
              }
            >
              {label("register")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
