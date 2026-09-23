import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "i18next";
import { CodexInstances } from "@/components/providers/CodexInstances";
import { codexInstancesApi as api } from "@/lib/api/codexInstances";
import en from "@/i18n/locales/en.json";

vi.mock("@/lib/api/codexInstances", () => ({
  codexInstancesApi: {
    list: vi.fn(),
    read: vi.fn(),
    save: vi.fn(),
    register: vi.fn(),
    forget: vi.fn(),
    launch: vi.fn(),
    previewProvider: vi.fn(),
    editModel: vi.fn(),
  },
}));
vi.mock("@/lib/api/providers", () => ({
  providersApi: { getAll: vi.fn().mockResolvedValue({}) },
}));

const instances = [
  {
    id: "personal",
    name: "Personal",
    configDir: "/test/personal",
    userDataDir: "/test/personal-ui",
    appPath: "/Applications/Codex.app",
  },
  {
    id: "work",
    name: "Work",
    configDir: "/test/work",
    userDataDir: "/test/work-ui",
    appPath: "/Applications/Codex Work.app",
  },
];
const read = (id: string) => ({
  instance: instances.find((i) => i.id === id)!,
  config: `model = "${id}"\n`,
  revision: `revision-${id}`,
  model: id,
  provider: "llmgw",
  effort: "xhigh",
});

beforeEach(async () => {
  i18n.addResourceBundle("en", "translation", en, true, true);
  await i18n.changeLanguage("en");
  vi.mocked(api.list).mockResolvedValue(instances);
  vi.mocked(api.read).mockImplementation(async (id) => read(id));
});

async function open() {
  const user = userEvent.setup();
  render(<CodexInstances />);
  await user.click(screen.getByRole("button", { name: "Codex instances" }));
  await screen.findByText("Personal", { selector: "strong" });
  return user;
}

describe("independent Codex instance management", () => {
  it("selecting an instance only reads that home; saving targets its own revision", async () => {
    const user = await open();
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Select instance" }),
      "work",
    );
    await screen.findByText("Work", { selector: "strong" });
    expect(api.save).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Instance config.toml draft"), {
      target: { value: 'model = "changed"\n' },
    });
    vi.mocked(api.save).mockResolvedValue({
      ...read("work"),
      config: 'model = "changed"\n',
      model: "changed",
      revision: "new",
    });
    await user.click(
      screen.getByRole("button", { name: "Save to this instance" }),
    );
    expect(api.save).toHaveBeenCalledWith(
      "work",
      "revision-work",
      'model = "changed"\n',
    );
  });

  it("retains dirty text when switching is cancelled, and reloads only after discard", async () => {
    const user = await open();
    fireEvent.change(screen.getByLabelText("Instance config.toml draft"), {
      target: { value: 'model = "unsaved"' },
    });
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Select instance" }),
      "work",
    );
    expect(screen.getByRole("alert")).toHaveTextContent("unsaved changes");
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByLabelText("Instance config.toml draft")).toHaveValue(
      'model = "unsaved"',
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Select instance" }),
      "work",
    );
    await user.click(screen.getByRole("button", { name: "Discard draft" }));
    await screen.findByText("Work", { selector: "strong" });
    expect(screen.getByLabelText("Instance config.toml draft")).toHaveValue(
      read("work").config,
    );
  });

  it("shows a save conflict and retains the draft for recovery", async () => {
    const user = await open();
    fireEvent.change(screen.getByLabelText("Instance config.toml draft"), {
      target: { value: 'model = "edit"' },
    });
    vi.mocked(api.save).mockRejectedValueOnce(
      new Error("Config changed externally; reload before saving"),
    );
    await user.click(
      screen.getByRole("button", { name: "Save to this instance" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("changed externally"),
    );
    expect(screen.getByLabelText("Instance config.toml draft")).toHaveValue(
      'model = "edit"',
    );
  });

  it("launches only the selected instance and never applies a provider implicitly", async () => {
    const user = await open();
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Select instance" }),
      "work",
    );
    await screen.findByText("Work", { selector: "strong" });
    await user.click(screen.getByRole("button", { name: "Launch instance" }));
    expect(api.launch).toHaveBeenCalledWith("work");
    expect(api.save).not.toHaveBeenCalled();
    expect(api.previewProvider).not.toHaveBeenCalled();
  });

  it("does not hide registry failures behind an empty success state", async () => {
    vi.mocked(api.list).mockRejectedValueOnce(new Error("Invalid registry"));
    const user = userEvent.setup();
    render(<CodexInstances />);
    await user.click(screen.getByRole("button", { name: "Codex instances" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Invalid registry"),
    );
    expect(api.save).not.toHaveBeenCalled();
  });
});
