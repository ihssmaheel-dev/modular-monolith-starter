import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

vi.stubEnv("VITE_API_URL", "http://localhost:3000/api/v1");
vi.stubEnv("VITE_APP_NAME", "Workspace");

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
