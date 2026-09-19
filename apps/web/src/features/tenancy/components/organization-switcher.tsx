import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, Check, ChevronsUpDown, Plus } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@repo/ui/components/ui/dialog";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { useTenantStore } from "@/stores/tenant.store";
import { organizationsListQuery, tenancyStatusQuery } from "../tenancy.queries";
import { createOrganizationMutationOptions } from "../tenancy.mutations";
import { queryKeys } from "@/lib/query-keys";

export function OrganizationSwitcher() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const tenantId = useTenantStore((state) => state.tenantId);
  const setTenantId = useTenantStore((state) => state.setTenantId);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [slug, setSlug] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const statusQuery = useQuery(tenancyStatusQuery());
  const isMultiTenant = statusQuery.data?.mode === "multi";

  const orgsQuery = useQuery({
    ...organizationsListQuery(),
    enabled: isMultiTenant,
  });

  const organizations = useMemo(() => orgsQuery.data?.items ?? [], [orgsQuery.data?.items]);

  // Auto-select first organization if none is selected in multi-tenant mode
  useEffect(() => {
    if (!isMultiTenant || organizations.length === 0) return;
    const currentMatches = organizations.some((org) => org.id === tenantId);
    if (!tenantId || !currentMatches) {
      setTenantId(organizations[0].id);
    }
  }, [isMultiTenant, organizations, tenantId, setTenantId]);

  const activeOrg = organizations.find((org) => org.id === tenantId);

  const createMutation = useMutation({
    ...createOrganizationMutationOptions(),
    onSuccess: (newOrg) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tenancy.organizations() });
      setTenantId(newOrg.id);
      setCreateDialogOpen(false);
      setOrgName("");
      setSlug("");
      setErrorMsg(null);
    },
    onError: () => {
      setErrorMsg(t("tenancy.createFailed"));
    },
  });

  if (!isMultiTenant) return null;

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim()) return;
    setErrorMsg(null);
    createMutation.mutate({
      name: orgName.trim(),
      slug: slug.trim() ? slug.trim() : undefined,
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-2 px-2.5 text-xs font-medium max-w-48 justify-between"
              aria-label={t("tenancy.switcherLabel")}
            />
          }
        >
          <div className="flex items-center gap-1.5 truncate">
            <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{activeOrg?.name ?? t("tenancy.organization")}</span>
          </div>
          <ChevronsUpDown className="size-3 shrink-0 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
            {t("tenancy.activeOrganization")}
          </DropdownMenuLabel>
          {organizations.map((org) => (
            <DropdownMenuItem
              key={org.id}
              onClick={() => setTenantId(org.id)}
              className="flex items-center justify-between cursor-pointer text-xs"
            >
              <span className="truncate">{org.name}</span>
              {org.id === tenantId && <Check className="size-3.5 shrink-0 text-primary" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setCreateDialogOpen(true)}
            className="flex items-center gap-2 cursor-pointer text-xs font-medium text-primary"
          >
            <Plus className="size-3.5" />
            <span>{t("tenancy.createOrganization")}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("tenancy.createOrganization")}</DialogTitle>
            <DialogDescription>{t("tenancy.createOrganizationDescription")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateSubmit} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="org-name" className="text-xs font-medium">
                {t("tenancy.orgName")}
              </Label>
              <Input
                id="org-name"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder={t("tenancy.orgNamePlaceholder")}
                required
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="org-slug" className="text-xs font-medium">
                {t("tenancy.orgSlug")} ({t("common.optional", "optional")})
              </Label>
              <Input
                id="org-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                placeholder={t("tenancy.orgSlugPlaceholder")}
                className="h-8 text-xs font-mono"
              />
            </div>
            {errorMsg && <p className="text-xs text-destructive">{errorMsg}</p>}
            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCreateDialogOpen(false)}
              >
                {t("common.cancel", "Cancel")}
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={!orgName.trim() || createMutation.isPending}
              >
                {createMutation.isPending ? t("common.saving", "Creating...") : t("tenancy.create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
