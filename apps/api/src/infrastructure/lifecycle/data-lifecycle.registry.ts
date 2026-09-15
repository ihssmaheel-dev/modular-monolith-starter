import { Injectable } from "@nestjs/common";
import { err, ok, type Result } from "neverthrow";

import type {
  DataLifecycleContributor,
  LifecycleFailure,
  SubjectLifecycleContext,
} from "./data-lifecycle.types";

@Injectable()
export class DataLifecycleRegistry {
  private readonly contributors = new Map<string, DataLifecycleContributor>();

  register(contributor: DataLifecycleContributor): void {
    if (this.contributors.has(contributor.key)) {
      throw new Error(`DUPLICATE_LIFECYCLE_CONTRIBUTOR:${contributor.key}`);
    }
    this.contributors.set(contributor.key, contributor);
  }

  async exportSubject(
    context: SubjectLifecycleContext,
  ): Promise<Result<{ data: Record<string, unknown>; truncated: boolean }, LifecycleFailure>> {
    const data: Record<string, unknown> = {};
    let truncated = false;
    for (const contributor of this.contributors.values()) {
      if (!contributor.exportSubject) continue;
      const result = await contributor.exportSubject(context);
      if (result.isErr()) return err(result.error);
      data[contributor.key] = result.value.data;
      truncated ||= result.value.truncated;
    }
    return ok({ data, truncated });
  }

  async purgeSubject(
    userId: string,
    tenantIds: string[],
  ): Promise<Result<{ deleted: number }, LifecycleFailure>> {
    return this.runPurge((contributor) => contributor.purgeSubject?.(userId, tenantIds));
  }

  async purgeTenant(tenantId: string): Promise<Result<{ deleted: number }, LifecycleFailure>> {
    return this.runPurge((contributor) => contributor.purgeTenant?.(tenantId));
  }

  registeredKeys(): string[] {
    return [...this.contributors.keys()].sort();
  }

  private async runPurge(
    operation: (
      contributor: DataLifecycleContributor,
    ) => Promise<Result<{ deleted: number }, LifecycleFailure>> | undefined,
  ): Promise<Result<{ deleted: number }, LifecycleFailure>> {
    let deleted = 0;
    for (const contributor of this.contributors.values()) {
      const pending = operation(contributor);
      if (!pending) continue;
      const result = await pending;
      if (result.isErr()) return err(result.error);
      deleted += result.value.deleted;
    }
    return ok({ deleted });
  }
}
