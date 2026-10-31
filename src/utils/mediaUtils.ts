/**
 * Media URL normalizer and streamer helpers for Google Drive, Dropbox, and CDN sources
 */

export function extractGoogleDriveId(url: string): string | null {
  if (!url) return null;
  const clean = url.trim();
  // Match drive.google.com/file/d/{id}, drive.google.com/open?id={id}, drive.google.com/uc?id={id}, docs.google.com/file/d/{id}
  const match = clean.match(
    /(?:drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:[^&]+&)*id=)|docs\.google\.com\/(?:file\/d\/|open\?id=))([a-zA-Z0-9_-]{20,})/i
  );
  return match ? match[1] : null;
}

export function isGoogleDriveUrl(url: string): boolean {
  return extractGoogleDriveId(url) !== null;
}

export function isDropboxUrl(url: string): boolean {
  if (!url) return false;
  return /dropbox\.com\//i.test(url);
}

export function normalizeMediaUrl(url: string): string {
  if (!url) return "";
  const clean = url.trim();

  // 1. Google Drive -> Convert to direct backend streaming proxy
  const driveId = extractGoogleDriveId(clean);
  if (driveId) {
    return `/api/stream-drive?id=${driveId}`;
  }

  // 2. Dropbox -> Convert dl=0 to raw=1 for direct HTML5 video streaming
  if (isDropboxUrl(clean)) {
    if (clean.includes("dl=0")) {
      return clean.replace("dl=0", "raw=1");
    }
    if (!clean.includes("raw=1") && !clean.includes("dl=1")) {
      const sep = clean.includes("?") ? "&" : "?";
      return `${clean}${sep}raw=1`;
    }
    return clean;
  }

  // 3. OneDrive -> ensure download=1
  if (/1drv\.ms|onedrive\.live\.com/i.test(clean)) {
    if (clean.includes("resid=") && !clean.includes("download=1")) {
      const sep = clean.includes("?") ? "&" : "?";
      return `${clean}${sep}download=1`;
    }
  }

  return clean;
}
