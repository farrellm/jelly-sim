export function resolveAssetUrl(
  relativePath: string,
  baseUrl: string = import.meta.env.BASE_URL ?? '/',
): string {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const normalizedPath = relativePath.replace(/^\/+/, '');
  return `${normalizedBase}${normalizedPath}`;
}
