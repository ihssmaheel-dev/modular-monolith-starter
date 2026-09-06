import { oc } from "@orpc/contract";
import { authContract } from "./auth.contract";
import { usersContract } from "./users.contract";
import { notesContract } from "./notes.contract";
import { filesContract } from "./files.contract";
import { organizationsContract } from "./organizations.contract";
import { membershipsContract } from "./memberships.contract";
import { privacyContract } from "./privacy.contract";

export * from "./users.contract";
export * from "./notes.contract";
export * from "./auth.contract";
export * from "./files.contract";
export * from "./organizations.contract";
export * from "./memberships.contract";
export * from "./tenancy.contract";
export * from "./privacy.contract";

export const apiContract = oc.router({
  auth: authContract,
  users: usersContract,
  notes: notesContract,
  files: filesContract,
  organizations: organizationsContract,
  memberships: membershipsContract,
  privacy: privacyContract,
});

export type ApiContract = typeof apiContract;
