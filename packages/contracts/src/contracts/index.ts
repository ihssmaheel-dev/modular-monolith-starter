import { oc } from "@orpc/contract";
import { authContract } from "./auth.contract";
import { usersContract } from "./users.contract";
import { notesContract } from "./notes.contract";
import { filesContract } from "./files.contract";
import { organizationsContract } from "./organizations.contract";
import { membershipsContract } from "./memberships.contract";
import { privacyContract } from "./privacy.contract";
import { notificationsContract } from "./notification.contract";

export * from "./users.contract";
export * from "./notes.contract";
export * from "./auth.contract";
export * from "./files.contract";
export * from "./organizations.contract";
export * from "./memberships.contract";
export * from "./privacy.contract";
export * from "./notification.contract";

export const coreApiContracts = {
  auth: authContract,
  users: usersContract,
  files: filesContract,
  organizations: organizationsContract,
  memberships: membershipsContract,
  privacy: privacyContract,
  notifications: notificationsContract,
};

/** Reference slices are composed explicitly so product forks can remove them as one unit. */
export const exampleApiContracts = { notes: notesContract };

export const apiContract = oc.router({
  ...coreApiContracts,
  ...exampleApiContracts,
});

export type ApiContract = typeof apiContract;
