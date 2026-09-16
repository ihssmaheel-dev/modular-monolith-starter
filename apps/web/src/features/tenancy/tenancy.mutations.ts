import { mutationOptions } from "@tanstack/react-query";
import type { CreateOrganizationInput } from "@repo/contracts";
import { getApiClient } from "@/lib/api";

export function acceptInvitationMutationOptions() {
  return mutationOptions({
    mutationKey: ["tenancy", "accept-invitation"] as const,
    mutationFn: async (token: string) => {
      const client = getApiClient();
      const res = await client.tenancy.acceptInvitation({ body: { token } });
      if (res.status !== 200) throw new Error("tenancy.acceptFailed");
    },
  });
}

export function createOrganizationMutationOptions() {
  return mutationOptions({
    mutationKey: ["tenancy", "create-organization"] as const,
    mutationFn: async (input: CreateOrganizationInput) => {
      const client = getApiClient();
      const res = await client.tenancy.createOrganization({ body: input });
      if (res.status !== 201) throw new Error("tenancy.createFailed");
      return res.body;
    },
  });
}
