const STATUS_ORDER = ["fail", "warn", "pass", "skip"];
const STATUS_LABEL = { fail: "FAIL", warn: "WARN", pass: "PASS", skip: "SKIP" };
const STATUS_SYMBOL = { fail: "✖", warn: "!", pass: "✔", skip: "–" };
const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  fail: "\x1b[31m",
  warn: "\x1b[33m",
  pass: "\x1b[32m",
  skip: "\x1b[90m",
  heading: "\x1b[36m",
};

function printReport(results, options, durationMs) {
  const counts = Object.fromEntries(
    STATUS_ORDER.map((status) => [status, results.filter((item) => item.status === status).length]),
  );
  const failed = counts.fail > 0;
  const warned = counts.warn > 0;
  if (options.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: !failed && (!options.strict || !warned),
          strict: options.strict,
          durationMs,
          counts,
          results,
        },
        null,
        2,
      )}\n`,
    );
    return { failed, warned };
  }

  const colorEnabled = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
  const color = (name, value) =>
    colorEnabled && ANSI[name] ? `${ANSI[name]}${value}${ANSI.reset}` : value;
  process.stdout.write(`\n${color("bold", color("heading", "Starter Doctor"))}\n`);
  process.stdout.write(`${color("dim", "Read-only local development readiness diagnostics")}\n`);

  const sections = [...new Set(results.map((item) => item.section))];
  for (const section of sections) {
    process.stdout.write(`\n${color("bold", section)}\n`);
    for (const item of results.filter((entry) => entry.section === section)) {
      const badge = color(
        item.status,
        `${STATUS_SYMBOL[item.status]} ${STATUS_LABEL[item.status]}`,
      );
      process.stdout.write(
        `  ${badge.padEnd(colorEnabled ? 18 : 6)} ${item.name}: ${item.message}\n`,
      );
      if (item.fix) process.stdout.write(`         ${color("dim", `Fix: ${item.fix}`)}\n`);
    }
  }

  const summary = `${counts.pass} passed, ${counts.warn} warnings, ${counts.fail} failed, ${counts.skip} skipped`;
  process.stdout.write(
    `\n${color("bold", "Summary")}  ${summary}  ${color("dim", `(${durationMs} ms)`)}\n`,
  );
  if (failed) process.stdout.write(`${color("fail", "Development setup needs attention.")}\n\n`);
  else if (options.strict && warned) {
    process.stdout.write(`${color("warn", "Strict mode treats warnings as failures.")}\n\n`);
  } else if (warned) {
    process.stdout.write(
      `${color("warn", "Core setup is valid; review optional-service warnings.")}\n\n`,
    );
  } else process.stdout.write(`${color("pass", "Development setup is ready.")}\n\n`);
  return { failed, warned };
}

function printHelp(stream) {
  stream.write(`Usage: pnpm run doctor [options]\n\n`);
  stream.write(
    `Checks the pinned toolchain, workspace, environment safety, Docker, and local dependencies.\n\n`,
  );
  stream.write(`Options:\n`);
  stream.write(
    `  --json           Emit JSON (use \`pnpm --silent run doctor --json\` for clean output)\n`,
  );
  stream.write(`  --strict         Return a failure exit code when warnings exist\n`);
  stream.write(`  --skip-services  Skip Docker and network connectivity checks\n`);
  stream.write(`  --help, -h       Show this help\n`);
}

module.exports = { printHelp, printReport };
