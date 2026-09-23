import { invoke } from "@tauri-apps/api/core";

export interface CodexInstance {
  id: string;
  name: string;
  configDir: string;
  userDataDir: string;
  appPath: string | null;
}

export interface InstanceConfig {
  instance: CodexInstance;
  config: string;
  revision: string;
  model: string | null;
  provider: string | null;
  effort: string | null;
}

export const codexInstancesApi = {
  list: () => invoke<CodexInstance[]>("list_codex_instances"),
  register: (instance: Omit<CodexInstance, "id">) =>
    invoke<CodexInstance>("register_codex_instance", { ...instance }),
  read: (id: string) => invoke<InstanceConfig>("read_codex_instance", { id }),
  save: (id: string, expectedRevision: string, config: string) =>
    invoke<InstanceConfig>("save_codex_instance", {
      id,
      expectedRevision,
      config,
    }),
  forget: (id: string) => invoke<void>("forget_codex_instance", { id }),
  launch: (id: string) => invoke<void>("launch_codex_instance", { id }),
  previewProvider: (config: string, providerId: string) =>
    invoke<string>("preview_codex_instance_provider", { config, providerId }),
  editModel: (config: string, model: string, effort: string) =>
    invoke<string>("edit_codex_instance_model", { config, model, effort }),
};
