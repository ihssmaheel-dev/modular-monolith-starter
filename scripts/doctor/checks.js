const { checkEnvironment } = require("./environment-checks");
const { checkServices } = require("./service-checks");
const { checkSystemCapacity, checkToolchain } = require("./toolchain-checks");
const { checkWorkspace } = require("./workspace-checks");

async function runChecks(options) {
  const results = [];
  checkToolchain(results, options);
  checkSystemCapacity(results);
  checkWorkspace(results, options);
  const environment = checkEnvironment(results);
  await checkServices(results, environment, options);
  return results;
}

module.exports = { runChecks };
