const assert = require("node:assert/strict");
const { test } = require("node:test");

const { runStagingUp } = require("./staging-up");

test("preserves a Docker Compose failure status", () => {
  const code = runStagingUp({ root: process.cwd(), spawn: () => ({ status: 17 }) });
  assert.equal(code, 17);
});

test("fails when the process cannot start", () => {
  const code = runStagingUp({
    root: process.cwd(),
    spawn: () => ({ error: new Error("docker missing"), status: null }),
  });
  assert.equal(code, 1);
});

test("fails when the child is terminated by a signal", () => {
  const code = runStagingUp({
    root: process.cwd(),
    spawn: () => ({ signal: "SIGTERM", status: null }),
  });
  assert.equal(code, 1);
});

test("fails when the child returns no status", () => {
  const code = runStagingUp({ root: process.cwd(), spawn: () => ({ status: null }) });
  assert.equal(code, 1);
});
