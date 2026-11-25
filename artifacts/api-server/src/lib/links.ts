function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

// The `link` column stores one URL, or a JSON array when a block has several.
export function parseStoredLinks(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
      }
    } catch {
      // A normal URL that happens to start with "[".
    }
  }
  return [trimmed];
}

export function serializeLinks(urls: string[]): string | null {
  const clean: string[] = [];
  for (const url of urls) {
    const next = normalizeUrl(url);
    if (next && !clean.includes(next)) clean.push(next);
  }
  if (clean.length === 0) return null;
  if (clean.length === 1) return clean[0];
  return JSON.stringify(clean);
}
