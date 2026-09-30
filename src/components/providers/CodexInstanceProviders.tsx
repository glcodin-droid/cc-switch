import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { toast } from "sonner";
import { ProviderCard } from "./ProviderCard";
import { EditProviderDialog } from "./EditProviderDialog";
import { AddProviderDialog } from "./AddProviderDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  codexInstancesApi as api,
  type InstanceProviderState,
} from "@/lib/api/codexInstances";
import { settingsApi } from "@/lib/api/settings";
import type { Provider } from "@/types";

export function CodexInstanceProviders({
  instanceId,
  addOpen,
  onAddChange,
}: {
  instanceId: string;
  addOpen: boolean;
  onAddChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const label = (k: string) => t(`codexInstances.${k}`);
  const [state, setState] = useState<InstanceProviderState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Provider | null>(null);
  const [deleting, setDeleting] = useState<Provider | null>(null);
  useEffect(() => {
    let active = true;
    setState(null);
    api
      .providers(instanceId)
      .then((s) => {
        if (active) setState(s);
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [instanceId]);
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(String(e));
      throw e;
    } finally {
      setBusy(false);
    }
  };
  const safe = (work: () => Promise<void>) => {
    void run(work).catch(() => {});
  };
  if (!state)
    return (
      <div className="p-4 text-sm text-muted-foreground">
        {error ? <p role="alert">{error}</p> : t("common.loading")}
      </div>
    );
  const item = state.config.instance;
  const save = async (provider: Provider) =>
    run(async () => {
      setState(
        await api.putProvider(instanceId, state.config.revision, provider),
      );
      toast.success(label("saved"));
    });
  return (
    <div className="mt-4 space-y-3 pb-6">
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/30 dark:border-red-900"
        >
          {error}
        </p>
      )}
      {state.providers.map((provider) => (
        <ProviderCard
          key={provider.id}
          provider={provider}
          appId="codex"
          instanceMode
          isCurrent={state.currentProviderId === provider.id}
          isProxyRunning={false}
          isStateChangeProtected={busy}
          isRemovalProtected={busy || state.currentProviderId === provider.id}
          onSwitch={(p) =>
            safe(async () => {
              setState(
                await api.switchProvider(
                  instanceId,
                  state.config.revision,
                  p.id,
                ),
              );
              toast.success(label("saved"));
            })
          }
          onEdit={(p) => setEditing(p)}
          onDelete={setDeleting}
          onDuplicate={(p) =>
            safe(async () =>
              save({
                ...p,
                id: crypto.randomUUID(),
                name: `${p.name} (${t("common.copy")})`,
              }),
            )
          }
          onOpenWebsite={(url) => void settingsApi.openExternal(url)}
        />
      ))}
      <EditProviderDialog
        key={editing?.id ?? "none"}
        open={!!editing}
        provider={editing}
        appId="codex"
        instanceName={item.name}
        onOpenChange={(v) => {
          if (!v) setEditing(null);
        }}
        onSubmit={async ({ provider }) => save(provider)}
      />
      <AddProviderDialog
        open={addOpen}
        onOpenChange={onAddChange}
        appId="codex"
        instanceName={item.name}
        onSubmit={async (p) => {
          await save({ ...p, id: crypto.randomUUID() });
          onAddChange(false);
        }}
      />
      <ConfirmDialog
        isOpen={!!deleting}
        title={t("common.delete")}
        message={label("deleteProviderHelp")}
        pending={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={() =>
          safe(async () => {
            if (!deleting) return;
            setState(
              await api.deleteProvider(
                instanceId,
                state.config.revision,
                deleting.id,
              ),
            );
            setDeleting(null);
          })
        }
      />
    </div>
  );
}
