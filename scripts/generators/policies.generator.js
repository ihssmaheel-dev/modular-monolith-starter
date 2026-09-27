const path = require("node:path");
const { writeFileIfMissing } = require("./utils");

function generatePolicies({ modulePath, feature, Feature, featurePlural }) {
  const policyContent = `import type { Policy } from "@repo/authorization";

/**
 * Deny-by-default FGA policy stubs for ${featurePlural}.
 * Action vocabulary is registered with zero grants (deny by default).
 * Developers must explicitly define access conditions and effects before granting access.
 */
export const ${feature}Policies: Policy[] = [];
`;

  writeFileIfMissing(
    path.join(modulePath, "application", "policies", `${feature}.policies.ts`),
    policyContent,
  );
}

module.exports = { generatePolicies };
