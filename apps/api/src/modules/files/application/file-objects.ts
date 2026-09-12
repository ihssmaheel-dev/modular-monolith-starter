import type { Result } from "neverthrow";
import type { StorageService } from "../../../infrastructure/storage/storage.service";
import type { StorageError } from "../../../infrastructure/storage/storage.types";
import { quarantineKeyFor } from "../domain/file-keys";

/**
 * Removes every object a file record may own. Bytes live at the quarantine
 * key until the scan worker promotes them to the final key, so destroying a
 * record must remove both: S3 deletes are idempotent, and StorageService
 * logs each outcome. The final-key result stays authoritative for callers.
 */
export async function deleteFileObjects(
  storage: StorageService,
  finalKey: string,
): Promise<Result<void, StorageError>> {
  await storage.delete(quarantineKeyFor(finalKey));
  return storage.delete(finalKey);
}
