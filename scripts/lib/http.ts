// Shared HTTP helpers for the import scripts — all of them hit either
// transfermarkt-api or Wikidata, both of which are flaky enough (see
// docs/transfermarkt-api.md) that a single retry is worth having in one
// place rather than copy-pasted per script.
export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return (await res.json()) as T;
}

export async function fetchWithRetry<T>(url: string, retryDelayMs = 1500): Promise<T> {
  try {
    return await fetchJson<T>(url);
  } catch {
    await new Promise((r) => setTimeout(r, retryDelayMs));
    return await fetchJson<T>(url);
  }
}

export async function runWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const item = items[cursor++];
      await fn(item);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
}
