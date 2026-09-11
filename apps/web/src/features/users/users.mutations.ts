import { mutationOptions } from "@tanstack/react-query";
import { getApiClient } from "@/lib/api";

export function requestEmailChangeMutationOptions() {
  return mutationOptions({
    mutationKey: ["users", "email-change", "request"] as const,
    mutationFn: async (email: string) => {
      const client = getApiClient();
      const res = await client.users.requestEmailChange({ body: { email } });
      if (res.status !== 201) {
        if (res.error?.code === "EMAIL_TAKEN") throw new Error("api.user.emailTaken");
        throw new Error("errors.unknown");
      }
      return res.body;
    },
  });
}

export function verifyEmailChangeMutationOptions() {
  return mutationOptions({
    mutationKey: ["users", "email-change", "verify"] as const,
    mutationFn: async (token: string) => {
      const client = getApiClient();
      const res = await client.users.verifyEmailChange({ body: { token } });
      if (res.status !== 200) {
        if (res.error?.code === "INVALID_EMAIL_CHANGE_TOKEN") {
          throw new Error("api.user.invalidEmailChangeToken");
        }
        throw new Error("errors.unknown");
      }
      return res.body;
    },
  });
}
