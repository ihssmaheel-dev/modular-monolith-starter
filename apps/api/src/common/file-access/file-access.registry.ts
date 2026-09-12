import { Injectable } from "@nestjs/common";
import type { AuthenticatedUser } from "@repo/contracts";

/**
 * Minimal file shape a parent-access decision needs. FileEntity satisfies
 * this structurally, so domains never import each other's models here.
 */
export interface FileAccessResource {
  id: string;
  parentId?: string | null;
  parentType: string;
  tenantId?: string;
  uploadedBy: string;
}

/**
 * Decides whether an actor may download a parent-controlled file.
 * Implemented by the owning domain (which alone knows its own
 * readability rules) and registered at module init. Never throws:
 * unexpected failures deny access.
 */
export type FileParentChecker = (
  file: FileAccessResource,
  actor: AuthenticatedUser,
) => Promise<boolean>;

/**
 * Explicit file-visibility registry (H10). Each parent type resolves to
 * exactly one policy:
 * - "general" (and user avatars): tenant-shared via the files:read policy,
 *   a deliberate product decision recorded here, not an accident.
 * - registered parent types (e.g. notes): the owning domain's checker runs
 *   at download time against the live parent resource.
 * - unregistered parent types: denied. New linkable domains must register
 *   a checker or their attachments stay undownloadable.
 */
@Injectable()
export class FileAccessRegistry {
  private readonly checkers = new Map<string, FileParentChecker>();

  registerParentAccess(parentType: string, checker: FileParentChecker): void {
    if (this.checkers.has(parentType)) {
      throw new Error(`Duplicate file access checker for parent type: ${parentType}`);
    }
    this.checkers.set(parentType, checker);
  }

  getChecker(parentType: string): FileParentChecker | undefined {
    return this.checkers.get(parentType);
  }
}
