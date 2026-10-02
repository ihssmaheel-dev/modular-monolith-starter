const path = require("path");
const {
  toPascalCase,
  toKebabCase,
  ensureDir,
  writeFileIfMissing,
  appendExportIfMissing,
} = require("./utils");

function generateUiComponent({ rootPath, componentName }) {
  if (!componentName) {
    throw new Error("Component name is required.");
  }

  const kebabName = toKebabCase(componentName);
  const pascalName = toPascalCase(componentName);

  const composedDir = path.join(rootPath, "packages", "ui", "src", "components", "composed");
  const componentDir = path.join(composedDir, kebabName);
  ensureDir(componentDir);

  console.log(`\nGenerating Composed UI Component: ${pascalName} (${kebabName})`);

  // 1. <kebabName>.types.ts
  const typesContent = `import type * as React from "react";

export interface ${pascalName}Props extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  children?: React.ReactNode;
}
`;
  writeFileIfMissing(path.join(componentDir, `${kebabName}.types.ts`), typesContent);

  // 2. <kebabName>.tsx
  const componentContent = `import * as React from "react";
import { cn } from "../../../lib/utils";
import type { ${pascalName}Props } from "./${kebabName}.types";

export const ${pascalName} = React.forwardRef<HTMLDivElement, ${pascalName}Props>(
  ({ className, title, description, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("rounded-lg border bg-card p-6 text-card-foreground shadow-sm", className)}
        {...props}
      >
        <div className="flex flex-col space-y-1.5">
          <h3 className="text-lg font-semibold leading-none tracking-tight">{title}</h3>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {children && <div className="mt-4">{children}</div>}
      </div>
    );
  },
);
${pascalName}.displayName = "${pascalName}";
`;
  writeFileIfMissing(path.join(componentDir, `${kebabName}.tsx`), componentContent);

  // 3. <kebabName>.stories.tsx
  const storiesContent = `import type { Meta, StoryObj } from "@storybook/react";
import { ${pascalName} } from "./${kebabName}";

const meta = {
  title: "Composed/${pascalName}",
  component: ${pascalName},
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof ${pascalName}>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: "${pascalName} Title",
    description: "A description of the ${pascalName} component.",
  },
};

export const WithContent: Story = {
  args: {
    title: "${pascalName} With Content",
    description: "A composed component showing nested content.",
    children: <div className="text-sm">Inner content goes here.</div>,
  },
};
`;
  writeFileIfMissing(path.join(componentDir, `${kebabName}.stories.tsx`), storiesContent);

  // 4. index.ts
  const indexContent = `export { ${pascalName} } from "./${kebabName}";
export type { ${pascalName}Props } from "./${kebabName}.types";
`;
  writeFileIfMissing(path.join(componentDir, "index.ts"), indexContent);

  // 5. Compatibility bridges
  const bridgeTsx = `export * from "./${kebabName}/index";\n`;
  const bridgeStories = `export * from "./${kebabName}/${kebabName}.stories";\nexport { default } from "./${kebabName}/${kebabName}.stories";\n`;
  writeFileIfMissing(path.join(composedDir, `${kebabName}.tsx`), bridgeTsx);
  writeFileIfMissing(path.join(composedDir, `${kebabName}.stories.tsx`), bridgeStories);

  // 6. Register in composed/index.ts
  const composedBarrelPath = path.join(composedDir, "index.ts");
  appendExportIfMissing(composedBarrelPath, `export * from "./${kebabName}";`);

  console.log(
    `\nSuccessfully scaffolded ${pascalName} in packages/ui/src/components/composed/${kebabName}/!`,
  );
}

module.exports = {
  generateUiComponent,
};
