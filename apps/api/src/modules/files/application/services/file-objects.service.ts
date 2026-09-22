import { ok, type Result } from "neverthrow";
import type { StorageService } from "../../../../infrastructure/storage/storage.service";
import type { StorageError } from "../../../../infrastructure/storage/storage.types";
import { quarantineKeyFor } from "../../domain/value-objects/file-keys.vo";
import type { FileEntity } from "../../domain/entities/file.entity";

/**
 * Removes every object a file record may own. Bytes live at the quarantine
 * key until the scan worker promotes them to the final key, so destroying a
 * record must remove both: S3 deletes are idempotent, and StorageService
 * logs each outcome. The final-key result stays authoritative for callers.
 */
export async function deleteFileObjects(
  storage: StorageService,
  file: Pick<FileEntity, "key" | "activeKey" | "scanCandidateKeys">,
): Promise<Result<void, StorageError>> {
  const keys = new Set([
    quarantineKeyFor(file.key),
    file.key,
    ...(file.activeKey ? [file.activeKey] : []),
    ...(file.scanCandidateKeys ?? []),
  ]);
  let finalResult: Result<void, StorageError> | undefined;
  for (const key of keys) {
    const deleted = await storage.delete(key);
    if (deleted.isErr()) finalResult = deleted;
  }
  return finalResult ?? ok(undefined);
}

export function activeObjectKey(file: Pick<FileEntity, "key" | "activeKey">): string {
  return file.activeKey ?? file.key;
}
