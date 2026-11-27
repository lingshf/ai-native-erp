export function pageItems<Item>(
  data: { pages: readonly { items: readonly Item[] }[] } | undefined,
): Item[] {
  return data?.pages.flatMap((page) => page.items) ?? [];
}
