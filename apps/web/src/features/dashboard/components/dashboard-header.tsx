import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@repo/ui/components/ui/native-select";
import { FRONTEND_ROUTES } from "@repo/contracts";
import { useAuthStore } from "@/stores/auth.store";
import { useTenantStore } from "@/stores/tenant.store";
import { organizationsListQuery, tenancyStatusQuery } from "@/features/tenancy/tenancy.queries";

export function DashboardHeader() {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const tenantId = useTenantStore((state) => state.tenantId);
  const setTenantId = useTenantStore((state) => state.setTenantId);

  const statusQuery = useQuery(tenancyStatusQuery());
  const isMultiTenant = statusQuery.data?.mode === "multi";

  const orgsQuery = useQuery({
    ...organizationsListQuery(),
    enabled: isMultiTenant,
  });

  const organizations = orgsQuery.data?.items ?? [];

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
          {t("dashboard.welcome", { name: user?.name ?? t("common.user") })}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("dashboard.subtitle")}</p>
      </div>
      <div className="flex items-center gap-2">
        {isMultiTenant && organizations.length > 0 && (
          <NativeSelect
            value={tenantId ?? ""}
            onChange={(e) => setTenantId(e.target.value ? e.target.value : null)}
            aria-label={t("tenancy.allOrganizations")}
            className="w-44"
          >
            <NativeSelectOption value="">{t("tenancy.allOrganizations")}</NativeSelectOption>
            {organizations.map((org) => (
              <NativeSelectOption key={org.id} value={org.id}>
                {org.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        )}
        <Button
          size="sm"
          className="gap-1.5 text-xs shadow-xs"
          render={<Link to={FRONTEND_ROUTES.newNote} />}
        >
          <Plus className="size-3.5" />
          <span>{t("notes.newNote")}</span>
        </Button>
      </div>
    </div>
  );
}
