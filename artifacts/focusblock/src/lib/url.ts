// Normalize a user-typed URL (add https:// if no scheme is present).
export function normalizeUrl(raw: string): string {
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

// Pull a clean hostname (no www.) for display in the link chip.
export function linkHost(url: string): string {
  try {
    return new URL(normalizeUrl(url)).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
