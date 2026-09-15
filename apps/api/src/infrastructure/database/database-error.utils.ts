export function isPostgresUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && (error as { code?: unknown }).code === "23505"
  );
}

export function databaseErrorMetadata(error: unknown): {
  errorName: string;
  errorCode?: string;
} {
  if (!(error instanceof Error)) return { errorName: "UnknownDatabaseError" };
  const code = (error as Error & { code?: unknown }).code;
  return {
    errorName: error.name,
    ...(typeof code === "string" ? { errorCode: code } : {}),
  };
}
