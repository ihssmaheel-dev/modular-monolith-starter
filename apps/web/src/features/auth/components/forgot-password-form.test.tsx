import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getApiClient } from "@/lib/api";
import { renderWithApp } from "@/test/utils";
import { ForgotPasswordForm } from "./forgot-password-form";

vi.mock("@/lib/api", () => ({ getApiClient: vi.fn() }));

const client = { auth: { forgotPassword: vi.fn() } };

describe("ForgotPasswordForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getApiClient).mockReturnValue(client as never);
  });

  it("renders the forgot password form initially with back to login link", async () => {
    renderWithApp(<ForgotPasswordForm />);

    expect(await screen.findByRole("heading", { name: "Forgot password?" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send reset link" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to sign in/i })).toBeInTheDocument();
  });

  it("does not submit with invalid email due to Zod guard", async () => {
    const user = userEvent.setup();
    renderWithApp(<ForgotPasswordForm />);

    const emailInput = await screen.findByLabelText("Email");
    await user.type(emailInput, "not-an-email");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(client.auth.forgotPassword).not.toHaveBeenCalled();
    expect(await screen.findByText(/invalid email/i)).toBeInTheDocument();
  });

  it("submits valid email and transitions to success state with email display", async () => {
    const user = userEvent.setup();
    client.auth.forgotPassword.mockResolvedValue({ status: 200, body: {} });
    renderWithApp(<ForgotPasswordForm />);

    const emailInput = await screen.findByLabelText("Email");
    await user.type(emailInput, "user@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(client.auth.forgotPassword).toHaveBeenCalledWith({
      body: { email: "user@example.com" },
    });
    expect(await screen.findByRole("heading", { name: "Check your email" })).toBeInTheDocument();
    expect(screen.getByText("user@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("allows retrying from success state to edit the email", async () => {
    const user = userEvent.setup();
    client.auth.forgotPassword.mockResolvedValue({ status: 200, body: {} });
    renderWithApp(<ForgotPasswordForm />);

    const emailInput = await screen.findByLabelText("Email");
    await user.type(emailInput, "user@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByRole("heading", { name: "Check your email" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByRole("heading", { name: "Forgot password?" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveValue("user@example.com");
  });

  it("shows error message when request fails", async () => {
    const user = userEvent.setup();
    client.auth.forgotPassword.mockResolvedValue({ status: 400, body: null });
    renderWithApp(<ForgotPasswordForm />);

    const emailInput = await screen.findByLabelText("Email");
    await user.type(emailInput, "user@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByText("Request failed. Please try again.")).toBeInTheDocument();
  });
});
