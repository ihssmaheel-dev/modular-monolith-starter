export const queryKeys = {
  notes: {
    all: (tenantId: string | null) => ["notes", tenantId] as const,
    list: (tenantId: string | null, page: number, limit: number) =>
      ["notes", tenantId, "list", { page, limit }] as const,
    detail: (tenantId: string | null, id: string) => ["notes", tenantId, "detail", id] as const,
  },
  users: {
    all: (tenantId: string | null) => ["users", tenantId] as const,
    list: (tenantId: string | null, page: number, limit: number) =>
      ["users", tenantId, "list", { page, limit }] as const,
    detail: (tenantId: string | null, id: string) => ["users", tenantId, "detail", id] as const,
  },
  privacy: {
    all: () => ["privacy"] as const,
    requests: (page: number, limit: number) => ["privacy", "requests", { page, limit }] as const,
  },
  files: {
    all: (tenantId: string | null) => ["files", tenantId] as const,
    list: (tenantId: string | null, parentType: string, parentId?: string) =>
      ["files", tenantId, "list", { parentType, parentId }] as const,
  },
} as const;
