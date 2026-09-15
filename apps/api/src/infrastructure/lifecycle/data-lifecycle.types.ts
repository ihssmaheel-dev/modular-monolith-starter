import type { AuthenticatedUser } from "@repo/contracts";
import type { Result } from "neverthrow";

export interface SubjectLifecycleContext {
  actor: AuthenticatedUser;
  tenantIds: string[];
}

export interface LifecycleExportContribution {
  data: Record<string, unknown>;
  truncated: boolean;
}

export type LifecycleFailure = { type: "LIFECYCLE_CONTRIBUTOR_FAILED"; contributor: string };

export interface DataLifecycleContributor {
  readonly key: string;
  exportSubject?(
    context: SubjectLifecycleContext,
  ): Promise<Result<LifecycleExportContribution, LifecycleFailure>>;
  purgeSubject?(
    userId: string,
    tenantIds: string[],
  ): Promise<Result<{ deleted: number }, LifecycleFailure>>;
  purgeTenant?(tenantId: string): Promise<Result<{ deleted: number }, LifecycleFailure>>;
}
