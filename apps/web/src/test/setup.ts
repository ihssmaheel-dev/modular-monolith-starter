import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach, vi } from "vitest";

configure({ asyncUtilTimeout: 4000 });

vi.stubEnv("VITE_API_URL", "http://localhost:5156/api/v1");
vi.stubEnv("VITE_APP_NAME", "Workspace");

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
