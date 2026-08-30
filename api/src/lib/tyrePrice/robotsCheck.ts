interface RobotsRule {
  prefix: string;
  allow: boolean;
}

interface CachedRobots {
  rules: RobotsRule[];
  fetchedAt: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const cache = new Map<string, CachedRobots>();

/**
 * Minimal robots.txt parser: reads the "User-agent: *" group (this doesn't
 * scrape under any product-specific User-Agent, so the wildcard group is
 * the relevant one) and its Allow/Disallow rules, then checks a path
 * against the longest matching prefix, per standard robots.txt precedence.
 * A robots.txt that can't be fetched at all is treated as "no restrictions
 * declared" (fail-open) -- the real-world convention for a missing/
 * unreachable robots.txt, not a silent bypass of a real one.
 */
async function fetchRules(robotsUrl: string): Promise<RobotsRule[]> {
  try {
    const res = await fetch(robotsUrl);
    if (!res.ok) return [];
    const text = await res.text();
    return parseWildcardGroup(text);
  } catch {
    return [];
  }
}

function parseWildcardGroup(text: string): RobotsRule[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const rules: RobotsRule[] = [];
  let inWildcardGroup = false;
  let sawAnyUserAgent = false;

  for (const rawLine of lines) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;
    const [rawKey, ...rest] = line.split(":");
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();

    if (key === "user-agent") {
      sawAnyUserAgent = true;
      inWildcardGroup = value === "*";
      continue;
    }
    if (!sawAnyUserAgent) continue; // rules before any User-agent line are invalid
    if (!inWildcardGroup) continue;

    if (key === "disallow" && value) rules.push({ prefix: value, allow: false });
    if (key === "allow" && value) rules.push({ prefix: value, allow: true });
  }
  return rules;
}

export async function isPathAllowed(robotsUrl: string, path: string): Promise<boolean> {
  const cached = cache.get(robotsUrl);
  const rules =
    cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS
      ? cached.rules
      : await fetchRules(robotsUrl).then((r) => {
          cache.set(robotsUrl, { rules: r, fetchedAt: Date.now() });
          return r;
        });

  const matching = rules
    .filter((r) => path.startsWith(r.prefix))
    .sort((a, b) => b.prefix.length - a.prefix.length)[0];

  return matching ? matching.allow : true;
}
