import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getApiClient } from "@/lib/api";
import { renderWithApp } from "@/test/utils";
import { VerifyEmailForm } from "./verify-email-form";

vi.mock("@/lib/api", () => ({ getApiClient: vi.fn() }));

const session = {
  accessToken: "a",
  refreshToken: "r",
  user: { id: "u-1", email: "u@e.test", name: "U", role: "user", avatarFileId: null },
};
const client = { auth: { verifyEmail: vi.fn() } };

describe("VerifyEmailForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getApiClient).mockReturnValue(client as never);
    sessionStorage.clear();
  });

  it("shows an error state without a token and never calls the API", async () => {
    renderWithApp(<VerifyEmailForm token="" />);

    expect(await screen.findByText("Invalid or expired token")).toBeInTheDocument();
    expect(client.auth.verifyEmail).not.toHaveBeenCalled();
  });

  it("does not verify on render (prefetch-safe), only on confirm", async () => {
    const user = userEvent.setup();
    client.auth.verifyEmail.mockResolvedValue({ status: 200, body: session });
    renderWithApp(<VerifyEmailForm token={"t".repeat(32)} />);

    expect(client.auth.verifyEmail).not.toHaveBeenCalled();
    await user.click(await screen.findByRole("button", { name: "Verify email" }));

    expect(client.auth.verifyEmail).toHaveBeenCalledWith({ body: { token: "t".repeat(32) } });
    expect(await screen.findByText("Email verified. Welcome!")).toBeInTheDocument();
  });

  it("shows the server error when the token is rejected", async () => {
    const user = userEvent.setup();
    client.auth.verifyEmail.mockResolvedValue({ status: 401, body: null });
    renderWithApp(<VerifyEmailForm token="stale" />);

    await user.click(await screen.findByRole("button", { name: "Verify email" }));

    expect(await screen.findByText("Invalid or expired token")).toBeInTheDocument();
    expect(screen.queryByText("Email verified. Welcome!")).not.toBeInTheDocument();
  });
});
