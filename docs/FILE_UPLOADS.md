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
4. UI: reuse `FileDrop` with `onUploaded={(file) => attach(file.id)}`.
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
