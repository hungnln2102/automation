export const normalizeSearch = (input: string) => {
  if (!input) return "";
  const str = input.startsWith("?") ? input.slice(1) : input;
  const params = new URLSearchParams(str);
  return Array.from(params.entries())
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join("&");
};

export const matchesHref = (
  currentPath: string,
  currentSearch: string,
  targetHref: string
) => {
  const [path, query] = targetHref.split("?");
  const search = query ? `?${query}` : "";
  if (currentPath !== path) return false;
  return normalizeSearch(currentSearch) === normalizeSearch(search);
};
