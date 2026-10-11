/** Filter sounds by their display name while preserving the library order. */
export function filterSoundbites<T extends { name?: string; title?: string }>(
  items: readonly T[],
  query: string,
): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...items];

  return items.filter((item) => {
    const label = item.name ?? item.title ?? '';
    return label.toLowerCase().includes(needle);
  });
}
