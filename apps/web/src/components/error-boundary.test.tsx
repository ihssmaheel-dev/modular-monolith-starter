import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { RouteErrorFallback } from "./error-boundary";
import type { ApiErrorEnvelope } from "@repo/contracts";

describe("RouteErrorFallback", () => {
  it("renders error reference from an API error envelope", () => {
    const apiError: ApiErrorEnvelope = {
      code: "INTERNAL_ERROR",
      i18nKey: "api.error.internal",
      message: "Internal server error",
      status: 500,
      requestId: "req-12345678",
      traceId: "a3f9c1e4b89045678901234567890123",
      errorRef: "a3f9c1e4",
      fieldErrors: {},
    };

    const reset = vi.fn();
    renderWithProviders(<RouteErrorFallback error={{ cause: apiError }} reset={reset} />);

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("ref #a3f9c1e4")).toBeInTheDocument();
    expect(screen.getByText("Reference: #a3f9c1e4")).toBeInTheDocument();
  });

  it("renders a generated fallback client reference for generic errors", () => {
    const reset = vi.fn();
    renderWithProviders(
      <RouteErrorFallback error={new Error("Component crashed")} reset={reset} />,
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText(/ref #c-/)).toBeInTheDocument();
  });

  it("calls reset when retry button is clicked", async () => {
    const user = userEvent.setup();
    const reset = vi.fn();
    renderWithProviders(<RouteErrorFallback error={new Error("fail")} reset={reset} />);

    const retryBtn = screen.getByRole("button", { name: /retry/i });
    await user.click(retryBtn);

    expect(reset).toHaveBeenCalledOnce();
  });

  it("copies error details to clipboard when clicked", async () => {
    const user = userEvent.setup();
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextMock },
      configurable: true,
      writable: true,
    });

    const apiError: ApiErrorEnvelope = {
      code: "INTERNAL_ERROR",
      i18nKey: "api.error.internal",
      message: "Something failed",
      status: 500,
      requestId: "req-12345678",
      traceId: "a3f9c1e4b89045678901234567890123",
      errorRef: "a3f9c1e4",
      fieldErrors: {},
    };

    renderWithProviders(<RouteErrorFallback error={{ cause: apiError }} reset={vi.fn()} />);

    const copyBtn = screen.getByRole("button", { name: /copy error details/i });
    await user.click(copyBtn);

    expect(writeTextMock).toHaveBeenCalledWith(expect.stringContaining("Reference: #a3f9c1e4"));
    expect(writeTextMock).toHaveBeenCalledWith(
      expect.stringContaining("Trace ID: a3f9c1e4b89045678901234567890123"),
    );
  });
});
