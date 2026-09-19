import { and, or, gt, lt, eq, desc, asc, type SQL } from "drizzle-orm";

export interface DecodedCursor {
  val: unknown;
  id?: string;
}

export function decodeCursor(cursor?: string): DecodedCursor | null {
  if (!cursor || typeof cursor !== "string") return null;

  let val: unknown = cursor;
  let id: string | undefined;

  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (parsed && typeof parsed === "object" && "v" in parsed) {
      val = (parsed as { v: unknown }).v;
      const parsedId = (parsed as { id?: unknown }).id;
      id = typeof parsedId === "string" ? parsedId : undefined;
    }
  } catch {
    val = cursor;
  }

  if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}T/.test(val)) {
    const parsedDate = new Date(val);
    if (!Number.isNaN(parsedDate.getTime())) {
      val = parsedDate;
    }
  }

  return { val, id };
}

export function encodeCursor(
  cursorField: string,
  lastItem: Record<string, unknown>,
): string | null {
  if (cursorField === "id") {
    return lastItem["id"] != null ? String(lastItem["id"]) : null;
  }
  const rawVal = lastItem[cursorField];
  const val = rawVal instanceof Date ? rawVal.toISOString() : rawVal;
  const rawId = lastItem["id"] != null ? String(lastItem["id"]) : undefined;
  return Buffer.from(JSON.stringify({ v: val, id: rawId })).toString("base64url");
}

export function buildCursorClause(
  col: Parameters<typeof gt>[0],
  idCol: Parameters<typeof gt>[0] | undefined,
  cursor: DecodedCursor,
  cursorField: string,
  direction: "asc" | "desc",
): SQL | undefined {
  if (cursorField !== "id" && cursor.id && idCol) {
    return direction === "desc"
      ? or(lt(col, cursor.val), and(eq(col, cursor.val), lt(idCol, cursor.id)))
      : or(gt(col, cursor.val), and(eq(col, cursor.val), gt(idCol, cursor.id)));
  }
  return direction === "desc" ? lt(col, cursor.val) : gt(col, cursor.val);
}

export function buildCursorOrder(
  orderCol: Parameters<typeof gt>[0],
  idCol: Parameters<typeof gt>[0] | undefined,
  cursorField: string,
  direction: "asc" | "desc",
): SQL[] {
  const needsTieBreaker = cursorField !== "id" && Boolean(idCol);
  if (direction === "desc") {
    return needsTieBreaker && idCol ? [desc(orderCol), desc(idCol)] : [desc(orderCol)];
  }
  return needsTieBreaker && idCol ? [asc(orderCol), asc(idCol)] : [asc(orderCol)];
}
