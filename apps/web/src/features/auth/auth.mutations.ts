import { mutationOptions } from "@tanstack/react-query";
import { getApiClient } from "@/lib/api";
import type {
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from "@repo/contracts";

export function loginMutationOptions() {
  return mutationOptions({
    mutationKey: ["auth", "login"] as const,
    mutationFn: async (data: LoginInput) => {
      const client = getApiClient();
      const res = await client.auth.login({ body: data });
      if (res.status !== 200) throw new Error("auth.loginFailed");
      return res.body;
    },
  });
}

export function registerMutationOptions() {
  return mutationOptions({
    mutationKey: ["auth", "register"] as const,
    mutationFn: async (data: RegisterInput) => {
      const client = getApiClient();
      const res = await client.auth.register({ body: data });
      if (res.status !== 201 && res.status !== 200) throw new Error("auth.registrationFailed");
      return res.body;
    },
  });
}

export function forgotPasswordMutationOptions() {
  return mutationOptions({
    mutationKey: ["auth", "forgot-password"] as const,
    mutationFn: async (data: ForgotPasswordInput) => {
      const client = getApiClient();
      const res = await client.auth.forgotPassword({ body: data });
      if (res.status !== 200) throw new Error("auth.requestFailed");
      return res.body;
    },
  });
}

export function resetPasswordMutationOptions() {
  return mutationOptions({
    mutationKey: ["auth", "reset-password"] as const,
    mutationFn: async (data: ResetPasswordInput) => {
      const client = getApiClient();
      const res = await client.auth.resetPassword({ body: data });
      if (res.status !== 200) throw new Error("auth.resetFailed");
      return res.body;
    },
  });
}
