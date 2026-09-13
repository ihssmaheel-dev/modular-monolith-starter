import { describe, expect, it } from "vitest";
import { GetTenancyStatusQuery, DEFAULT_TENANT_HEADER } from "./get-tenancy-status.query";

describe("GetTenancyStatusQuery", () => {
  it("returns tenancy mode and default header", () => {
    const query = new GetTenancyStatusQuery();
    const result = query.execute();
    expect(result.header).toBe(DEFAULT_TENANT_HEADER);
    expect(["single", "multi"]).toContain(result.mode);
  });
});
