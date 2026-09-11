/**
 * Parses jsonwebtoken-style durations ("30s", "15m", "1h", "7d", "1w")
 * into seconds. Used to derive Redis TTLs and cookie ages from the same
 * JWT expiry configuration instead of hardcoding them in several places.
 */
export function parseDurationToSeconds(value: string): number {
  const match = /^(\d+)(ms|s|m|h|d|w)$/.exec(value.trim());
  if (!match) throw new Error(`Unsupported duration: ${value}`);
  const amount = Number(match[1]);
  const unit = match[2] as "ms" | "s" | "m" | "h" | "d" | "w";
  const seconds =
    unit === "ms"
      ? amount / 1000
      : unit === "s"
        ? amount
        : unit === "m"
          ? amount * 60
          : unit === "h"
            ? amount * 3600
            : unit === "d"
              ? amount * 86400
              : amount * 604800;
  return Math.max(1, Math.floor(seconds));
}
