/**
 * Serves the embeddable widget script.
 *
 * The script is loaded from a fixed, unversioned URL on every host site, so a
 * cache lifetime would keep browsers on an old widget after an upgrade. Browsers
 * may store it but must revalidate on each page load; an unchanged file costs
 * only a 304.
 */

const BASE_HEADERS: Record<string, string> = {
  'Content-Type': 'application/javascript',
  'Cache-Control': 'public, no-cache',
  'Access-Control-Allow-Origin': '*', // Allow widget to be loaded from any domain
  'Cross-Origin-Resource-Policy': 'cross-origin',
};

function stripWeak(tag: string): string {
  return tag.trim().replace(/^W\//, '');
}

/** True when an If-None-Match header lists the current tag (weak tags compare equal) */
function matchesEtag(ifNoneMatch: string, etag: string): boolean {
  if (ifNoneMatch.trim() === '*') return true;
  const current = stripWeak(etag);
  return ifNoneMatch.split(',').some((tag) => stripWeak(tag) === current);
}

/** Response for the widget script, or null when the file does not exist */
export async function serveWidgetScript(
  filePath: string,
  request: Request
): Promise<Response | null> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) return null;

  const etag = `"${file.size.toString(16)}-${Math.floor(file.lastModified).toString(16)}"`;
  const lastModified = new Date(file.lastModified).toUTCString();
  const headers = { ...BASE_HEADERS, ETag: etag, 'Last-Modified': lastModified };

  const ifNoneMatch = request.headers.get('if-none-match');
  const ifModifiedSince = request.headers.get('if-modified-since');
  const notModified = ifNoneMatch
    ? matchesEtag(ifNoneMatch, etag)
    : ifModifiedSince !== null &&
      Math.floor(file.lastModified / 1000) <= Math.floor(Date.parse(ifModifiedSince) / 1000);

  if (notModified) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(file, { headers });
}
