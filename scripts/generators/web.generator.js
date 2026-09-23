const path = require("path");
const { writeFileIfMissing } = require("./utils");

function generateWeb({ feature, Feature, featurePlural, FeaturePlural, rootPath: contextRoot }) {
  const rootPath = contextRoot ?? path.resolve(__dirname, "../..");
  const featurePath = path.join(rootPath, "apps", "web", "src", "features", featurePlural);
  const queries = `import { queryOptions } from "@tanstack/react-query";
import type { ${Feature}ListResponseDto } from "@repo/contracts";
import { getApiClient } from "@/lib/api";
import { useTenantStore } from "@/stores/tenant.store";

export function ${featurePlural}ListQuery(page = 1, limit = 20) {
  const tenantId = useTenantStore.getState().tenantId;
  return queryOptions<${Feature}ListResponseDto>({
    queryKey: ["${featurePlural}", tenantId, "list", { page, limit }] as const,
    queryFn: async () => {
      const response = await getApiClient().${featurePlural}.list({ query: { page, limit } });
      if (response.status !== 200) throw new Error("errors.networkError");
      return response.body;
    },
  });
}

export function ${feature}ByIdQuery(id: string) {
  const tenantId = useTenantStore.getState().tenantId;
  return queryOptions({
    queryKey: ["${featurePlural}", tenantId, "detail", id] as const,
    queryFn: async () => {
      const response = await getApiClient().${featurePlural}.getById({ params: { id } });
      if (response.status !== 200) throw new Error("errors.notFound");
      return response.body;
    },
    enabled: Boolean(id),
  });
}
`;

  const mutations = `import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { Create${Feature}Dto, Update${Feature}Dto } from "@repo/contracts";
import { toast } from "@repo/ui/components/ui/toast";
import { getApiClient } from "@/lib/api";

export function useCreate${Feature}Mutation(opts?: { onSuccess?: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: Create${Feature}Dto) => {
      const response = await getApiClient().${featurePlural}.create({ body });
      if (response.status !== 201) throw new Error("errors.serverError");
      return response.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["${featurePlural}"] });
      toast.add({ title: t("common.created"), type: "success" } as never);
      opts?.onSuccess?.();
    },
    onError: () => toast.add({ title: t("errors.serverError"), type: "error" } as never),
  });
}

export function useUpdate${Feature}Mutation() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: Update${Feature}Dto & { id: string }) => {
      const response = await getApiClient().${featurePlural}.update({ params: { id }, body });
      if (response.status !== 200) throw new Error("errors.serverError");
      return response.body;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["${featurePlural}"] }),
    onError: () => toast.add({ title: t("errors.serverError"), type: "error" } as never),
  });
}

export function useDelete${Feature}Mutation() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await getApiClient().${featurePlural}.delete({ params: { id } });
      if (response.status !== 204) throw new Error("errors.serverError");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["${featurePlural}"] }),
    onError: () => toast.add({ title: t("errors.serverError"), type: "error" } as never),
  });
}
`;

  const list = `import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { DataTable, DataTablePagination, type DataTableColumn } from "@repo/ui/components/composed/data-table";
import { EmptyState } from "@repo/ui/components/composed/empty-state";
import { PageHeader } from "@repo/ui/components/composed/page-header";
import { Card, CardContent } from "@repo/ui/components/ui/card";
import { Button } from "@repo/ui/components/ui/button";
import { formatDate } from "@/lib/format";
import { ${featurePlural}ListQuery } from "@/features/${featurePlural}/${feature}.queries";

type ${Feature}Row = { id: string; name: string; description?: string; createdAt: string };

export function ${FeaturePlural}List({ page, limit, onPageChange }: {
  page: number;
  limit: number;
  onPageChange: (page: number) => void;
}) {
  const { t } = useTranslation();
  const query = useQuery(${featurePlural}ListQuery(page, limit));
  const columns: DataTableColumn<${Feature}Row>[] = [
    {
      key: "name",
      header: t("common.name"),
      cell: (row) => (
        <Link
          to="/${featurePlural}/$${feature}Id"
          params={{ ${feature}Id: row.id }}
          className="font-medium hover:underline"
        >
          {row.name}
        </Link>
      ),
    },
    { key: "description", header: t("common.description"), cell: (row) => row.description ?? "—" },
    { key: "createdAt", header: t("common.created"), cell: (row) => formatDate(row.createdAt) },
  ];

  return <div className="w-full space-y-6">
    <PageHeader title={t("common.items")} description={t("common.manageItems")} actions={<Button render={<Link to="/${featurePlural}/new" />}><Plus className="size-4" />{t("common.create")}</Button>} />
    <Card><CardContent className="space-y-4 pt-6">
      {query.isLoading ? <div className="h-40 animate-pulse rounded-lg bg-muted" /> : query.isError ? (
        <EmptyState title={t("errors.networkError")} description={t("common.retry")} />
      ) : query.data?.items.length === 0 ? <EmptyState title={t("common.noResults")} /> : <>
        <DataTable data={query.data?.items ?? []} columns={columns} getRowKey={(row) => row.id} emptyText={t("common.noResults")} />
        {query.data && query.data.totalPages > 1 ? <DataTablePagination page={page} totalPages={query.data.totalPages} onPageChange={onPageChange} pageLabel={(current, total) => t("common.pageOf", { page: current, totalPages: total })} previousLabel={t("common.previous")} nextLabel={t("common.next")} /> : null}
      </>}
    </CardContent></Card>
  </div>;
}
`;

  const create = `import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Create${Feature}Schema, type Create${Feature}Dto } from "@repo/contracts";
import { Button } from "@repo/ui/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/ui/card";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { Textarea } from "@repo/ui/components/ui/textarea";
import { useCreate${Feature}Mutation } from "@/features/${featurePlural}/${feature}.mutations";

export function ${Feature}CreateForm() {
  const { t } = useTranslation();
  const form = useForm<Create${Feature}Dto>({ resolver: zodResolver(Create${Feature}Schema), defaultValues: { name: "", description: "" } });
  const mutation = useCreate${Feature}Mutation({ onSuccess: () => form.reset() });
  return <Card><CardHeader><CardTitle>{t("common.create")}</CardTitle></CardHeader><CardContent>
    <form onSubmit={form.handleSubmit((body) => mutation.mutate(body))} className="space-y-4">
      <div className="space-y-2"><Label htmlFor="${feature}-name">{t("common.name")}</Label><Input id="${feature}-name" {...form.register("name")} /></div>
      <div className="space-y-2"><Label htmlFor="${feature}-description">{t("common.description")}</Label><Textarea id="${feature}-description" {...form.register("description")} /></div>
      <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? t("common.saving") : t("common.create")}</Button>
    </form>
  </CardContent></Card>;
}
`;

  const detail = `import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/ui/card";
import { formatDate } from "@/lib/format";
import { ${feature}ByIdQuery } from "@/features/${featurePlural}/${feature}.queries";

export function ${Feature}Detail({ id }: { id: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const goBack = () => navigate({ to: "/${featurePlural}" });
  const query = useQuery(${feature}ByIdQuery(id));

  if (query.isLoading) {
    return <div className="h-40 animate-pulse rounded-lg bg-muted" />;
  }

  if (query.isError || !query.data) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={goBack}>
          <ArrowLeft className="size-4" />
          {t("common.back")}
        </Button>
        <p className="text-sm text-destructive">{t("errors.notFound")}</p>
      </div>
    );
  }

  const item = query.data;

  return (
    <div className="w-full space-y-6">
      <div>
        <Button variant="ghost" size="sm" onClick={goBack} className="h-7 gap-1.5 px-2 text-xs">
          <ArrowLeft className="size-3.5" />
          {t("common.back")}
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{item.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {item.description ? <p className="text-sm text-muted-foreground">{item.description}</p> : null}
          <p className="text-xs text-muted-foreground font-mono">
            {t("common.created")}: {formatDate(item.createdAt)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
`;

  const indexRoute = `import { createFileRoute } from "@tanstack/react-router";
import { PaginationQuerySchema } from "@repo/contracts";
import { RouteErrorFallback } from "@/components/error-boundary";
import { ${featurePlural}ListQuery } from "@/features/${featurePlural}/${feature}.queries";
import { ${FeaturePlural}List } from "@/features/${featurePlural}/components/${featurePlural}-list";

export const Route = createFileRoute("/_app/${featurePlural}/")({
  validateSearch: PaginationQuerySchema,
  loaderDeps: ({ search }) => ({ page: search.page, limit: search.limit }),
  loader: ({ deps, context }) => context.queryClient.ensureQueryData(${featurePlural}ListQuery(deps.page, deps.limit)),
  errorComponent: RouteErrorFallback,
  component: ${FeaturePlural}Page,
});

function ${FeaturePlural}Page() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return <${FeaturePlural}List page={search.page ?? 1} limit={search.limit ?? 20} onPageChange={(page) => navigate({ search: (current) => ({ ...current, page }) })} />;
}
`;

  const newRoute = `import { createFileRoute } from "@tanstack/react-router";
import { ${Feature}CreateForm } from "@/features/${featurePlural}/components/${feature}-create-form";

export const Route = createFileRoute("/_app/${featurePlural}/new")({ component: ${Feature}CreatePage });
function ${Feature}CreatePage() { return <${Feature}CreateForm />; }
`;

  const detailRoute = `import { createFileRoute } from "@tanstack/react-router";
import { ${Feature}Detail } from "@/features/${featurePlural}/components/${feature}-detail";

export const Route = createFileRoute("/_app/${featurePlural}/$${feature}Id")({
  component: ${Feature}DetailPage,
});

function ${Feature}DetailPage() {
  const { ${feature}Id } = Route.useParams();
  return <${Feature}Detail id={${feature}Id} />;
}
`;

  const webRoutesDir = path.join(rootPath, "apps", "web", "src", "routes", "_app", featurePlural);

  writeFileIfMissing(path.join(featurePath, `${feature}.queries.ts`), queries);
  writeFileIfMissing(path.join(featurePath, `${feature}.mutations.ts`), mutations);
  writeFileIfMissing(path.join(featurePath, "components", `${featurePlural}-list.tsx`), list);
  writeFileIfMissing(path.join(featurePath, "components", `${feature}-create-form.tsx`), create);
  writeFileIfMissing(path.join(featurePath, "components", `${feature}-detail.tsx`), detail);
  writeFileIfMissing(path.join(webRoutesDir, "index.tsx"), indexRoute);
  writeFileIfMissing(path.join(webRoutesDir, "new.tsx"), newRoute);
  writeFileIfMissing(path.join(webRoutesDir, `$${feature}Id.tsx`), detailRoute);
}

module.exports = { generateWeb };
