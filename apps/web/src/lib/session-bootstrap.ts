import { getApiClient } from "./api";
import { useAuthStore } from "@/stores/auth.store";

let verificationPromise: Promise<boolean> | null = null;

/** A late bootstrap must not overwrite a login or sign-out completed while it was pending. */
export async function verifySession(): Promise<boolean> {
  if (useAuthStore.getState().status === "authenticated") return true;
  if (verificationPromise) return verificationPromise;

  verificationPromise = (async () => {
    try {
      const response = await getApiClient().auth.me();
      const current = useAuthStore.getState();
      if (current.status !== "loading") return current.status === "authenticated";
      if (response.status === 200 && response.body?.user) {
        current.setUser(response.body.user);
        return true;
      }
      return false;
    } catch {
      return useAuthStore.getState().status === "authenticated";
    } finally {
      verificationPromise = null;
    }
  })();

  return verificationPromise;
}
