const fs = require("node:fs");
const path = require("node:path");

function generateI18nStubs({ rootPath, featurePlural, FeaturePlural, Feature }) {
  const localesDir = path.join(rootPath, "packages", "i18n", "src", "locales");
  if (!fs.existsSync(localesDir)) return;

  const locales = ["en", "es", "fr"];
  const newKeys = {
    title: FeaturePlural,
    description: `Manage ${featurePlural}`,
    create: `Create ${Feature}`,
    edit: `Edit ${Feature}`,
    delete: `Delete ${Feature}`,
    empty: `No ${featurePlural} found`,
  };

  for (const locale of locales) {
    const filePath = path.join(localesDir, `${locale}.json`);
    if (!fs.existsSync(filePath)) continue;

    try {
      const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
      if (!data[featurePlural]) {
        data[featurePlural] = newKeys;
        fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
        console.log(`  [i18n] Injected '${featurePlural}' translation stubs into ${locale}.json`);
      }
    } catch (err) {
      console.warn(`  [i18n] Failed to update ${locale}.json: ${err.message}`);
    }
  }
}

module.exports = { generateI18nStubs };
