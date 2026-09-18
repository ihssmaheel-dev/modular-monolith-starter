import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  reportClientError,
  initGlobalErrorListeners,
  MAX_REPORTED_ERRORS,
  clearReportedErrors,
  getReportedErrorsCount,
} from "./client-beacon";

const reportClientErrorMock = vi.fn().mockResolvedValue({ status: 204 });

vi.mock("./api", () => ({
  getApiClient: () => ({
    telemetry: {
      reportClientError: reportClientErrorMock,
    },
  }),
}));

describe("client-beacon", () => {
  beforeEach(() => {
    clearReportedErrors();
    reportClientErrorMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("dispatches error via apiClient with keepalive option", () => {
    reportClientError({
      message: "Test render crash",
      url: "/notes",
      errorRef: "c-test1",
    });

    expect(reportClientErrorMock).toHaveBeenCalledTimes(1);
    expect(reportClientErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Test render crash",
        url: "/notes",
        errorRef: "c-test1",
      }),
      { keepalive: true },
    );
  });

  it("attaches global error and rejection listeners", () => {
    const addEventListenerSpy = vi.spyOn(window, "addEventListener");
    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");

    const cleanup = initGlobalErrorListeners();
    expect(addEventListenerSpy).toHaveBeenCalledWith("error", expect.any(Function));
    expect(addEventListenerSpy).toHaveBeenCalledWith("unhandledrejection", expect.any(Function));

    cleanup();
    expect(removeEventListenerSpy).toHaveBeenCalledWith("error", expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith("unhandledrejection", expect.any(Function));
  });

  it("deduplicates identical errors and does not resend", () => {
    reportClientError({ message: "Duplicate error", url: "/notes" });
    reportClientError({ message: "Duplicate error", url: "/notes" });

    expect(reportClientErrorMock).toHaveBeenCalledTimes(1);
    expect(getReportedErrorsCount()).toBe(1);
  });

  it("caps reportedErrors set at MAX_REPORTED_ERRORS to prevent memory leak", () => {
    for (let i = 0; i < MAX_REPORTED_ERRORS + 20; i++) {
      reportClientError({
        message: `Error ${i}`,
        url: "/test",
        errorRef: `ref-${i}`,
      });
    }

    expect(getReportedErrorsCount()).toBe(MAX_REPORTED_ERRORS);
  });
});
