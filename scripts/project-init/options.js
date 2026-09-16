const NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} &'().-]{1,63}$/u;
const SLUG_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const BUNDLE_ID_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*){2,}$/;
const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]{1,63}$/;
const VALUE_FLAGS = new Map([
  ["--name", "name"],
  ["--slug", "slug"],
  ["--bundle-id", "bundleId"],
  ["--url-scheme", "scheme"],
  ["--repository-url", "repositoryUrl"],
]);
const BOOLEAN_FLAGS = new Map([
  ["--dry-run", "dryRun"],
  ["--check", "check"],
  ["--reset-local-env", "resetLocalEnv"],
  ["--allow-dirty", "allowDirty"],
  ["--yes", "yes"],
  ["--help", "help"],
  ["-h", "help"],
]);

function parseArguments(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (BOOLEAN_FLAGS.has(argument)) {
      options[BOOLEAN_FLAGS.get(argument)] = true;
      continue;
    }
    const [flag, inlineValue] = argument.split(/=(.*)/s, 2);
    const key = VALUE_FLAGS.get(flag);
    if (!key) throw new Error(`Unknown option: ${argument}`);
    const value = inlineValue ?? args[++index];
    if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
    options[key] = value;
  }
  if (options.help) return options;
  options.name = options.name?.trim();
  options.slug = options.slug ?? toSlug(options.name ?? "");
  options.scheme = options.scheme ?? options.slug;
  options.repositoryUrl = normalizeRepositoryUrl(options.repositoryUrl);
  validateOptions(options);
  return options;
}

function validateOptions(options) {
  if (!options.name || !NAME_PATTERN.test(options.name)) {
    throw new Error(
      "--name must be 2-64 letters, numbers, spaces, or the characters &: apostrophe, period, parentheses, and hyphen.",
    );
  }
  if (!options.slug || options.slug.length > 40 || !SLUG_PATTERN.test(options.slug)) {
    throw new Error("--slug must be at most 40 characters of lowercase kebab-case.");
  }
  if (
    !options.bundleId ||
    options.bundleId.length > 155 ||
    !BUNDLE_ID_PATTERN.test(options.bundleId)
  ) {
    throw new Error(
      "--bundle-id is required and must be a lowercase reverse-DNS identifier such as com.acme.portal.",
    );
  }
  if (!SCHEME_PATTERN.test(options.scheme)) {
    throw new Error("--url-scheme must be a 2-64 character URI scheme beginning with a letter.");
  }
  if (options.check && (options.dryRun || options.resetLocalEnv || options.yes)) {
    throw new Error("--check cannot be combined with --dry-run, --reset-local-env, or --yes.");
  }
}

function normalizeRepositoryUrl(value) {
  if (!value) return undefined;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("--repository-url must be a valid HTTPS repository URL.");
  }
  if (url.protocol !== "https:") {
    throw new Error("--repository-url must use HTTPS.");
  }
  return value.replace(/\/?(?:\.git)?\/?$/, "");
}

function toSlug(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

module.exports = { parseArguments, toSlug, validateOptions };
