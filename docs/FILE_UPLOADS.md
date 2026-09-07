# File Uploads — Upload-Then-Attach Pattern

This is the single pattern for file uploads in every module. It follows the
industry standard (Rails ActiveStorage direct upload, Supabase Storage):
**uploads are generic and actor-scoped; linking is owned by the parent module.**

## The rule

The files module never imports another domain module. It does not know what a
note, avatar, or invoice is. New modules never touch the files module's
internals — they copy the 3-step recipe below.

## Flow

```
1. UPLOAD (generic, files module)
   client.uploadFile() → POST /files/upload-url → PUT bytes to presigned URL
   → POST /files/confirm → file row (parentType "general", unlinked)

2. ATTACH (parent module owns authorization)
   e.g. POST /notes/:id/attachments { fileId, slot? }
   → AttachFileToNoteCommand: GetNoteById (ownership ✓)
   → LinkFileCommand: file exists + uploadedBy === actor + not failed
   → row linked (parentType "note", parentId, slot)

3. REAP (janitor)
   FileCleanupWorker nightly: pending > 24h, never-linked uploaded > 7d,
   soft-deleted rows → S3 delete + row delete.
```

Every file must end up linked. Unlinked files older than 7 days are orphans
and are purged. Design general-purpose flows (avatars) the same way: upload,
then link with `parentType`/`parentId` via an owning-module command.

## Slots — photo vs aadhar vs passport

No schema change on the parent is ever needed for typed attachments. Linking
carries an optional `slot` (e.g. `photo`, `aadhar`, `passport`), stored on the
file row and filterable via `listByParent({ parentType, parentId, slot })`.
This mirrors ActiveStorage's `attachments.name`.

Slot rules live in the PARENT module, never in files. Example — an `employees`
module needing a photo (image, single) plus documents:

```ts
// modules/employees/application/commands/attach-employee-document.command.ts
const SLOTS = {
  photo: { mime: ["image/jpeg", "image/png"], max: 1 },
  aadhar: { mime: ["application/pdf", "image/jpeg"], max: 2 },
  passport: { mime: ["application/pdf"], max: 2 },
} as const;

async execute(employeeId, slot, fileId, actor) {
  const rule = SLOTS[slot];           // unknown slot → INVALID
  const employee = await this.getEmployeeById.execute(employeeId, actor); // ownership ✓
  const existing = await this.listFiles.execute("employee", employeeId, slot);
  if (existing.total >= rule.max) {
    if (slot === "photo") await this.deleteFile.execute(existing.items[0].id, actor); // replace
    else return err({ type: "SLOT_FULL" });
  }
  if (!rule.mime.includes(file.contentType)) return err({ type: "INVALID_FILE_TYPE" });
  return this.linkFile.execute(fileId, { parentType: "employee", parentId: employeeId, slot }, actor);
}
```

Why not `parentType: "employee-photo"`? It explodes the enum and kills
filtering ("all files of this employee" becomes N queries). Why not a JSON
column? Slots need indexed equality filtering — plain `text` + the
`files_parent_slot_idx` index does that.

## Single-slot replace rule

Unslotted attachments are unlimited. A **slotted** attachment point holds at
most one file: attaching with the same `slot` replaces the previous file
(delete old via `DeleteFileCommand`, then link new). The reference
`AttachFileToNoteCommand` implements this; copy it. If a slot legitimately
needs N files, enforce `max` in the parent command (see `SLOTS` example
above) instead of replacing.

## Profile photo / reference-column pattern

Two supported shapes — **default to A** unless the parent needs a
synchronous foreign key:

**A. Link-table only (default, no parent migration).** Read the avatar with
`listByParent({ parentType: "user", parentId: userId, slot: "avatar" })`.
Upload, then attach exactly like notes:

```ts
// modules/users/application/commands/attach-user-avatar.command.ts
async execute(userId, fileId, actor) {
  await this.getUserById.execute(userId);          // ownership ✓
  return this.linkFile.execute(fileId, { parentType: "user", parentId: userId, slot: "avatar" }, actor);
}
```

Single-photo replace comes free from the slot rule above. `parentType:
"user"` already exists in the enum, contract, and indexes.

**B. FK column storing the reference (only when the parent needs it).**
Add `users.avatar_file_id → files.id`, then in one
`withResultTransaction`: `linkFile(...)` + `usersRepo.updateById(userId,
{ avatarFileId })`. The `files` row stays the source of truth for bytes;
the column is a read shortcut. Deleting the file must clear the column in
the same transaction. This is now proven, not hypothetical: see
`AttachUserAvatarCommand` / `RemoveUserAvatarCommand`
(`modules/users/application/commands/`) for the reference implementation,
including image-only gating, single-photo replace, and erasure-safe
anonymize clearing.

## Quota scope

`FILE_USER_QUOTA_BYTES` (default 100 MB) is enforced **per user globally**
(`sumActiveBytes(uploadedBy)` across tenants, soft-deleted excluded). This
is intentional for the starter: one abuse bucket per human. Multi-tenant
billing that needs per-organization quotas should scope the sum by tenant
in `RequestUploadCommand.checkQuota` and document the new semantics.

## Recipe for a new module (e.g. invoices)

1. Client: reuse `uploadFile(client, source, putBytes)` from `@repo/api-client`
   — no parent arguments, no changes needed.
2. Backend: add `AttachFileToInvoiceCommand` in `modules/invoices/application/commands/`:
   verify the invoice with your own queries, then call `LinkFileCommand` (exported
   by `FilesModule`; import it — never the repository). Pass `slot` when the
   parent has typed attachment points (photo, aadhar…); omit it otherwise.
   Register in your module.
3. Contract: add `POST /{id}/attachments` with `ParentIdParam.and(AttachFileSchema)`
   → `FileMetadataSchema`; controller + oRPC + parity entries (copy notes).
   Add `GET /{id}/attachments` (pagination + optional `slot`) backed by a
   parent-owned list query that authorizes the parent first — never expose
   another parent's files through the generic `GET /files` endpoint, which is
   self-scoped by design (`ListFilesByParentQuery.execute`).
4. UI: reuse `FileDrop` with `onUploaded={(file) => attach(file.id)}`, and read
   attachments through your parent endpoint (see `noteAttachmentsQuery`).
5. Permissions: reuse your module's `:update` action for attach. No new permission
   needed unless attach deserves its own scope.

## Key layout

`tenants/{tenantId}/general/{userId}/{uuid}-{name}` — always user-scoped, so
ownership is provable from the path alone (defense in depth behind app auth,
same idea as Supabase `foldername[1] = uid` RLS).

## States

`pending → uploading → scanning → uploaded | failed`. The UI polls
`listByParent` until `uploaded`/`failed`. Retries re-request a presigned URL;
never reuse a URL past its 1-hour expiry.
