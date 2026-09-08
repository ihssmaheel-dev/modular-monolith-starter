import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getApiClient } from "@/lib/api";
import { renderWithApp } from "@/test/utils";
import { PreferencesCard } from "./preferences-card";

vi.mock("@/lib/api", () => ({ getApiClient: vi.fn() }));

const preferences = [
  { category: "account", inApp: true, email: true, push: false, digestCadence: "realtime" },
  { category: "collaboration", inApp: true, email: false, push: false, digestCadence: "daily" },
];

const client = {
  notifications: {
    getPreferences: vi.fn(),
    updatePreferences: vi.fn(),
  },
};

describe("PreferencesCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getApiClient).mockReturnValue(client as never);
    client.notifications.getPreferences.mockResolvedValue({
      status: 200,
      body: { preferences },
    });
    client.notifications.updatePreferences.mockResolvedValue({
      status: 200,
      body: { preferences },
    });
  });

  it("keeps the draft when a background refetch lands", async () => {
    const user = userEvent.setup();
    const { queryClient } = renderWithApp(<PreferencesCard />);
    const emailSwitch = (await screen.findAllByRole("switch", { name: "Email" }))[0]!;
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    await user.click(emailSwitch);
    expect(emailSwitch).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();

    await queryClient.refetchQueries();

    expect(emailSwitch).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
  });

  it("saves the draft and clears it on success", async () => {
    const user = userEvent.setup();
    renderWithApp(<PreferencesCard />);
    const emailSwitch = (await screen.findAllByRole("switch", { name: "Email" }))[0]!;

    await user.click(emailSwitch);
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(client.notifications.updatePreferences).toHaveBeenCalledWith({
      preferences: [{ ...preferences[0], email: false }, preferences[1]],
    });
    expect(await screen.findByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("saves a cadence change without touching the channels", async () => {
    const user = userEvent.setup();
    renderWithApp(<PreferencesCard />);

    await user.click((await screen.findAllByRole("combobox"))[0]!);
    await user.click(await screen.findByRole("option", { name: "Hourly digest" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(client.notifications.updatePreferences).toHaveBeenCalledWith({
      preferences: [{ ...preferences[0], digestCadence: "hourly" }, preferences[1]],
    });
  });

  it("shows retry instead of an empty form on error", async () => {
    client.notifications.getPreferences.mockRejectedValue(
      new Error("api.notifications.fetchFailed"),
    );
    renderWithApp(<PreferencesCard />);

    expect(await screen.findByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });
});
