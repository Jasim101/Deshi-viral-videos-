/**
 * Media URL normalizer and streamer helpers for Google Drive, Dropbox, Terabox, and CDN sources
 */

export function extractGoogleDriveId(url: string): string | null {
  if (!url) return null;
  const clean = url.trim();

  // Match /api/stream-drive?id={id}
  const streamMatch = clean.match(/\/api\/stream-drive\?id=([a-zA-Z0-9_-]{15,})/i);
  if (streamMatch && streamMatch[1]) return streamMatch[1];

  // Match /api/drive-embed?id={id}
  const embedMatch = clean.match(/\/api\/drive-embed\?id=([a-zA-Z0-9_-]{15,})/i);
  if (embedMatch && embedMatch[1]) return embedMatch[1];

  // Match drive.google.com/file/d/{id}, drive.google.com/open?id={id}, drive.google.com/uc?id={id}, docs.google.com/file/d/{id}
  const match = clean.match(
    /(?:drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:[^&]+&)*id=)|docs\.google\.com\/(?:file\/d\/|open\?id=))([a-zA-Z0-9_-]{15,})/i
  );
  return match ? match[1] : null;
}

export function isGoogleDriveUrl(url: string): boolean {
  return extractGoogleDriveId(url) !== null;
}

export function getGoogleDriveEmbedUrl(urlOrId: string): string | null {
  const id = extractGoogleDriveId(urlOrId);
  if (!id) return null;
  return `https://drive.google.com/file/d/${id}/preview`;
}

export function getGoogleDriveThumbnailUrl(urlOrId: string): string | null {
  const id = extractGoogleDriveId(urlOrId);
  if (!id) return null;
  return `https://drive.google.com/thumbnail?id=${id}&sz=w800`;
}

export function isDropboxUrl(url: string): boolean {
  if (!url) return false;
  return /dropbox\.com\//i.test(url);
}

export function getDropboxDirectUrl(url: string): string {
  if (!url) return "";
  let clean = url.trim();
  if (/dropbox\.com/i.test(clean)) {
    clean = clean.replace(/https?:\/\/(?:www\.)?dropbox\.com/i, "https://dl.dropboxusercontent.com");
    clean = clean.replace(/[?&]dl=0/g, "").replace(/[?&]raw=0/g, "");
    if (!clean.includes("raw=1") && !clean.includes("dl=1")) {
      const sep = clean.includes("?") ? "&" : "?";
      clean = `${clean}${sep}raw=1`;
    }
  }
  return clean;
}

export function isTeraboxUrl(url: string): boolean {
  if (!url) return false;
  return /terabox\.(?:com|app)|1024tera\.com|teraboxapp\.com|4funbox\.com|mirrobox\.com|nephobox\.com|freeterabox\.com|tibibox\.com/i.test(url);
}

export function extractTeraboxSurl(url: string): string | null {
  if (!url) return null;
  const clean = url.trim();
  const surlMatch = clean.match(/[?&]surl=([a-zA-Z0-9_-]+)/i);
  if (surlMatch) return surlMatch[1];
  const pathMatch = clean.match(/\/s\/1?([a-zA-Z0-9_-]+)/i);
  if (pathMatch) return pathMatch[1];
  return null;
}

export function getTeraboxEmbedUrl(url: string): string | null {
  const surl = extractTeraboxSurl(url);
  if (!surl) return null;
  return `https://www.1024tera.com/sharing/embed?surl=${surl}`;
}

export function normalizeMediaUrl(url: string): string {
  if (!url) return "";
  const clean = url.trim();

  // 1. Google Drive -> Convert to direct backend streaming proxy
  const driveId = extractGoogleDriveId(clean);
  if (driveId) {
    return `/api/stream-drive?id=${driveId}`;
  }

  // 2. Dropbox -> Convert directly to dl.dropboxusercontent.com CDN URL
  if (isDropboxUrl(clean)) {
    return getDropboxDirectUrl(clean);
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
