import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "i18next";
import { CodexInstances } from "@/components/providers/CodexInstances";
import { CodexInstanceProviders } from "@/components/providers/CodexInstanceProviders";
import {
  codexInstancesApi as api,
  type InstanceProviderState,
} from "@/lib/api/codexInstances";
import en from "@/i18n/locales/en.json";
import type { Provider } from "@/types";

vi.mock("@/lib/api/codexInstances", () => ({
  codexInstancesApi: {
    list: vi.fn(),
    register: vi.fn(),
    forget: vi.fn(),
    launch: vi.fn(),
    providers: vi.fn(),
    putProvider: vi.fn(),
    switchProvider: vi.fn(),
    deleteProvider: vi.fn(),
  },
}));
vi.mock("@/components/providers/ProviderCard", () => ({
  ProviderCard: ({
    provider,
    isCurrent,
    onSwitch,
    onEdit,
    onDelete,
    onDuplicate,
  }: {
    provider: Provider;
    isCurrent: boolean;
    onSwitch: (p: Provider) => void;
    onEdit: (p: Provider) => void;
    onDelete: (p: Provider) => void;
    onDuplicate: (p: Provider) => void;
  }) => (
    <article>
      <h3>{provider.name}</h3>
      <button disabled={isCurrent} onClick={() => onSwitch(provider)}>
        Enable {provider.name}
      </button>
      <button onClick={() => onEdit(provider)}>Edit {provider.name}</button>
      <button onClick={() => onDuplicate(provider)}>
        Duplicate {provider.name}
      </button>
      <button onClick={() => onDelete(provider)}>Delete {provider.name}</button>
    </article>
  ),
}));
vi.mock("@/components/providers/EditProviderDialog", () => ({
  EditProviderDialog: ({
    open,
    provider,
    onSubmit,
    instanceName,
  }: {
    open: boolean;
    provider: Provider | null;
    onSubmit: (v: { provider: Provider }) => Promise<void>;
    instanceName: string;
  }) =>
    open && provider ? (
      <button
        onClick={() => onSubmit({ provider: { ...provider, name: "Edited" } })}
      >
        Save {instanceName}
      </button>
    ) : null,
}));
vi.mock("@/components/providers/AddProviderDialog", () => ({
  AddProviderDialog: () => null,
}));
const instances = [
  {
    id: "a",
    name: "Personal",
    configDir: "/test/personal",
    userDataDir: "/test/personal-ui",
    appPath: "/Applications/Codex.app",
  },
  {
    id: "b",
    name: "Work",
    configDir: "/test/work",
    userDataDir: "/test/work-ui",
    appPath: "/Applications/Codex.app",
  },
];
const provider = (id: string): Provider => ({
  id,
  name: id,
  settingsConfig: { auth: {}, config: 'model="gpt-6-astra"\n' },
  meta: { commonConfigEnabled: false },
});
const state = (id: string): InstanceProviderState => ({
  config: {
    instance: instances.find((i) => i.id === id)!,
    revision: `rev-${id}`,
    config: 'model="gpt-6-astra"\n',
    model: "gpt-6-astra",
    provider: "llmgw",
    effort: "xhigh",
  },
  providers: [provider("GPT-6"), provider("GPT-5.6")],
  currentProviderId: "GPT-6",
});
beforeEach(async () => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
  i18n.addResourceBundle("en", "translation", en, true, true);
  await i18n.changeLanguage("en");
  vi.mocked(api.list).mockResolvedValue(instances);
  vi.mocked(api.providers).mockImplementation(async (id) => state(id));
  vi.mocked(api.switchProvider).mockImplementation(async (id) => state(id));
  vi.mocked(api.putProvider).mockImplementation(async (id) => state(id));
  vi.mocked(api.deleteProvider).mockImplementation(async (id) => state(id));
});
async function workspace(id = "b") {
  const user = userEvent.setup();
  render(
    <CodexInstanceProviders
      instanceId={id}
      addOpen={false}
      onAddChange={() => {}}
    />,
  );
  await screen.findByRole("button", { name: "Enable GPT-5.6" });
  return user;
}
describe("instance-scoped provider workflow", () => {
  it("selects a target without touching provider configuration", async () => {
    const select = vi.fn();
    const user = userEvent.setup();
    render(<CodexInstances selectedId={null} onSelect={select} />);
    await waitFor(() => expect(api.list).toHaveBeenCalled());
    await user.click(screen.getByRole("combobox", { name: "Select instance" }));
    await user.click(await screen.findByRole("option", { name: "Work" }));
    expect(select).toHaveBeenCalledWith("b");
    expect(api.putProvider).not.toHaveBeenCalled();
    expect(api.switchProvider).not.toHaveBeenCalled();
  });
  it("enables a card only in the selected home with its revision", async () => {
    const user = await workspace();
    await user.click(screen.getByRole("button", { name: "Enable GPT-5.6" }));
    expect(api.switchProvider).toHaveBeenCalledWith("b", "rev-b", "GPT-5.6");
  });
  it("edits through the existing provider dialog scoped to the target", async () => {
    const user = await workspace();
    await user.click(screen.getByRole("button", { name: "Edit GPT-6" }));
    await user.click(screen.getByRole("button", { name: "Save Work" }));
    expect(api.putProvider).toHaveBeenCalledWith(
      "b",
      "rev-b",
      expect.objectContaining({ id: "GPT-6", name: "Edited" }),
    );
  });
  it("duplicates into the same instance without activating the copy", async () => {
    const user = await workspace();
    await user.click(screen.getByRole("button", { name: "Duplicate GPT-6" }));
    expect(api.putProvider).toHaveBeenCalledWith(
      "b",
      "rev-b",
      expect.objectContaining({ name: expect.stringContaining("GPT-6") }),
    );
    expect(vi.mocked(api.putProvider).mock.calls[0][2].id).not.toBe("GPT-6");
    expect(api.switchProvider).not.toHaveBeenCalled();
  });
  it("surfaces a stale revision conflict without claiming success", async () => {
    vi.mocked(api.switchProvider).mockRejectedValueOnce(
      new Error("Config changed externally"),
    );
    const user = await workspace();
    await user.click(screen.getByRole("button", { name: "Enable GPT-5.6" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Config changed externally",
      ),
    );
  });
  it("launches only the selected instance from the shared menu", async () => {
    const user = userEvent.setup();
    render(<CodexInstances selectedId="a" onSelect={() => {}} />);
    await waitFor(() => expect(api.list).toHaveBeenCalled());
    await user.click(screen.getByRole("combobox", { name: "Select instance" }));
    await user.click(
      await screen.findByRole("option", { name: "Launch instance" }),
    );
    expect(api.launch).toHaveBeenCalledWith("a");
  });

  it("keeps a failed instance read visible and never falls back to the global writer", async () => {
    vi.mocked(api.providers).mockRejectedValueOnce(
      new Error("Invalid target config"),
    );
    render(
      <CodexInstanceProviders
        instanceId="b"
        addOpen={false}
        onAddChange={() => {}}
      />,
    );
    await screen.findByRole("alert");
    expect(api.putProvider).not.toHaveBeenCalled();
  });
});
