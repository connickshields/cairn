// Pull road designations a route guide cites, e.g. "7N09", "7N76Y", "Route 6H", "US-50".
export function extractRoadNames(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.match(/\b\d{1,2}N\d{1,2}[A-Z]?\b/g) ?? []) out.add(m.toUpperCase());
  for (const m of text.match(/\bRoute\s+[A-Z0-9]+\b/gi) ?? []) out.add(m.replace(/Route\s+/i, "").toUpperCase());
  for (const m of text.match(/\b(?:I|US|SR|CR)-?\d+\b/gi) ?? []) out.add(m.toUpperCase().replace(/-/g, ""));
  return [...out];
}
