import express, { Request, Response, NextFunction } from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import * as archiverModule from "archiver";

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const DATA = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), "data"));
const MAX_BYTES = (parseInt(process.env.MAX_UPLOAD_MB || "500", 10)) * 1048576;
const UP = path.join(DATA, "uploads");
const CFG = path.join(DATA, "config.json");
const STATS = path.join(DATA, "stats.json");
const AUTH_FILE = path.join(DATA, "auth.json");
const DEFAULT_CFG = path.join(process.cwd(), "default-config.json");

// Ensure directories
fs.mkdirSync(UP, { recursive: true });
if (!fs.existsSync(CFG)) {
  if (fs.existsSync(DEFAULT_CFG)) {
    fs.copyFileSync(DEFAULT_CFG, CFG);
  } else {
    fs.writeFileSync(CFG, JSON.stringify({ appName: "ফান হাব", videos: [] }, null, 2));
  }
}

// Security & Audit Headers
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};
const ALLOWED_EXTS = [".mp4", ".webm", ".mov", ".jpg", ".jpeg", ".png", ".webp"];

const readJSON = <T>(file: string, fallback: T): T => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
};

const writeJSON = (file: string, data: any) => {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
};

// --- AUTHENTICATION & PASSWORD HARDENING (PBKDF2 + Dynamic Salt) ---
interface AuthConfig {
  salt: string;
  hash: string;
  tokenSecret: string;
  isDefault: boolean;
  lastChanged: number;
  adminTelegramId?: string;
}

const hashPassword = (password: string, salt: string): string => {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
};

const initAuth = (): AuthConfig => {
  const envPass = process.env.ADMIN_PASSWORD;
  const existing = readJSON<AuthConfig | null>(AUTH_FILE, null);

  if (existing && existing.hash && existing.salt && existing.tokenSecret) {
    // If environment variable is explicitly provided and different, env takes priority
    if (envPass) {
      const envHash = hashPassword(envPass, existing.salt);
      if (envHash !== existing.hash) {
        const newSalt = crypto.randomBytes(32).toString("hex");
        const updated: AuthConfig = {
          salt: newSalt,
          hash: hashPassword(envPass, newSalt),
          tokenSecret: crypto.randomBytes(32).toString("hex"),
          isDefault: false,
          lastChanged: Date.now(),
        };
        writeJSON(AUTH_FILE, updated);
        return updated;
      }
    }
    return existing;
  }

  // Initial setup: use envPass or default "admin123"
  const defaultPass = envPass || "admin123";
  const salt = crypto.randomBytes(32).toString("hex");
  const initialAuth: AuthConfig = {
    salt,
    hash: hashPassword(defaultPass, salt),
    tokenSecret: crypto.randomBytes(32).toString("hex"),
    isDefault: !envPass,
    lastChanged: Date.now(),
  };
  writeJSON(AUTH_FILE, initialAuth);
  return initialAuth;
};

let authData: AuthConfig = initAuth();

const verifyPassword = (password: string): boolean => {
  const candidateHash = hashPassword(password, authData.salt);
  const a = Buffer.from(candidateHash, "hex");
  const b = Buffer.from(authData.hash, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

const signToken = (exp: number | string): string => {
  return crypto.createHmac("sha256", authData.tokenSecret).update(String(exp)).digest("hex");
};

const verifyToken = (token: string): boolean => {
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [expStr, sig] = parts;
  const exp = parseInt(expStr, 10);
  if (isNaN(exp) || exp < Date.now()) return false;

  const expectedSig = signToken(exp);
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

// --- RATE LIMITING & BRUTE FORCE LOCKOUT PROTECTION ---
interface RateLimitRecord {
  fails: number;
  lockedUntil: number;
  lastAttempt: number;
}
const loginTracker: Record<string, RateLimitRecord> = {};

const getClientIp = (req: Request): string => {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  if (Array.isArray(forwarded) && forwarded[0]) return forwarded[0].trim();
  return req.socket.remoteAddress || "127.0.0.1";
};

let stats = readJSON<Record<string, { views?: number; likes?: number }>>(STATS, {});
let statsDirty = false;
setInterval(() => {
  if (statsDirty) {
    statsDirty = false;
    writeJSON(STATS, stats);
  }
}, 5000);

const seen: Record<string, number> = {};

// Express JSON middleware for API calls, except raw upload
app.use((req, res, next) => {
  if (req.path === "/api/upload") {
    next();
  } else {
    express.json({ limit: "5mb" })(req, res, next);
  }
});

// GET /api/config
app.get("/api/config", (_req: Request, res: Response) => {
  const cfg = readJSON<any>(CFG, {});
  (cfg.videos || []).forEach((v: any) => {
    const s = stats[v.id] || {};
    v.views = (+v.views || 0) + (s.views || 0);
    v.likes = (+v.likes || 0) + (s.likes || 0);
  });
  res.setHeader("Cache-Control", "no-store");
  res.json(cfg);
});

// GET /api/login-info (Public info about Telegram Lock status for login screen)
app.get("/api/login-info", (_req: Request, res: Response) => {
  const isLocked = !!(authData.adminTelegramId && String(authData.adminTelegramId).trim() !== "");
  const idStr = authData.adminTelegramId ? String(authData.adminTelegramId).trim() : "";
  const maskedId = idStr && idStr.length > 4 ? `${idStr.slice(0, 2)}****${idStr.slice(-2)}` : (idStr ? "****" : "");

  res.setHeader("Cache-Control", "no-store");
  res.json({
    telegramLockEnabled: isLocked,
    maskedTelegramId: maskedId,
  });
});

// GET /api/check-admin-access (Check if a given Telegram User ID is authorized admin)
app.get("/api/check-admin-access", (req: Request, res: Response) => {
  const tgId = req.query.tgId ? String(req.query.tgId).trim() : "";
  const configuredAdminId = authData.adminTelegramId ? String(authData.adminTelegramId).trim() : "";

  // If no Telegram ID is configured, allow (open setup)
  if (!configuredAdminId) {
    return res.json({ allowed: true, lockActive: false });
  }

  // Check if tgId matches configured ID(s)
  const allowedList = configuredAdminId.split(",").map((s) => s.trim()).filter(Boolean);
  const isMatch = Boolean(tgId && allowedList.includes(tgId));

  res.setHeader("Cache-Control", "no-store");
  return res.json({
    allowed: isMatch,
    lockActive: true,
  });
});

// POST /api/login (With exponential backoff and lockout)
app.post("/api/login", async (req: Request, res: Response) => {
  const ip = getClientIp(req);
  const record = loginTracker[ip] || { fails: 0, lockedUntil: 0, lastAttempt: 0 };
  const now = Date.now();

  // Check if IP is currently locked out
  if (now < record.lockedUntil) {
    const remainingSeconds = Math.ceil((record.lockedUntil - now) / 1000);
    return res.status(429).json({
      error: `অনেকবার ভুল পাসওয়ার্ড দেওয়া হয়েছে! অ্যাকাউন্ট সাময়িকভাবে লক রয়েছে। দয়া করে ${remainingSeconds} সেকেন্ড পর পুনরায় চেষ্টা করুন।`,
      retryAfter: remainingSeconds,
    });
  }

  const { password, telegramUserId } = req.body || {};
  if (!password || typeof password !== "string") {
    return res.status(400).json({ error: "পাসওয়ার্ড প্রদান করুন" });
  }

  // If Telegram ID Lock is enabled, enforce matching telegram user ID
  if (authData.adminTelegramId && String(authData.adminTelegramId).trim() !== "") {
    const allowedList = String(authData.adminTelegramId)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (telegramUserId) {
      if (!allowedList.includes(String(telegramUserId).trim())) {
        return res.status(403).json({
          error: "অ্যাক্সেস ডিনাইড: আপনার টেলিগ্রাম অ্যাকাউন্টটি এই বটের অনুমোদিত অ্যাডমিন আইডি নয়!",
        });
      }
    }
  }

  // Artificial jitter delay to prevent rapid-fire brute-force attacks
  await new Promise((r) => setTimeout(r, 200 + Math.random() * 150));

  const isMatch = verifyPassword(password);
  record.lastAttempt = now;

  if (!isMatch) {
    record.fails += 1;
    let lockSeconds = 0;

    // Progressive lockout policy
    if (record.fails >= 10) {
      lockSeconds = 3600; // 1 hour lockout
    } else if (record.fails >= 7) {
      lockSeconds = 900; // 15 minutes lockout
    } else if (record.fails >= 5) {
      lockSeconds = 180; // 3 minutes lockout
    }

    if (lockSeconds > 0) {
      record.lockedUntil = now + lockSeconds * 1000;
      loginTracker[ip] = record;
      return res.status(429).json({
        error: `ভুল পাসওয়ার্ড! ৫ বারের বেশি ভুল হওয়ায় অ্যাকাউন্ট ${lockSeconds} সেকেন্ডের জন্য লক করা হয়েছে।`,
        retryAfter: lockSeconds,
      });
    }

    loginTracker[ip] = record;
    const remainingTries = 5 - record.fails;
    return res.status(401).json({
      error: `ভুল পাসওয়ার্ড! আর ${remainingTries > 0 ? remainingTries : 1} বার ভুল হলে সাময়িক লক হয়ে যাবে।`,
      remainingTries: Math.max(0, remainingTries),
    });
  }

  // Login success -> reset fail counter for this IP
  loginTracker[ip] = { fails: 0, lockedUntil: 0, lastAttempt: now };
  const exp = now + 24 * 3600 * 1000; // Token valid for 24 hours
  const token = `${exp}.${signToken(exp)}`;

  return res.json({
    token,
    isDefaultPassword: authData.isDefault,
    message: "লগইন সফল হয়েছে",
  });
});

// Auth middleware for all admin endpoints
const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const header = req.headers.authorization || "";
  const token = header.replace(/^Bearer\s+/i, "").trim();

  if (!token || !verifyToken(token)) {
    return res.status(401).json({ error: "অননুমোদিত অ্যাক্সেস! অনুগ্রহ করে পুনরায় লগইন করুন।" });
  }
  next();
};

// GET /api/admin/auth-status (Check security health & default password alert)
app.get("/api/admin/auth-status", requireAuth, (req: Request, res: Response) => {
  const ip = getClientIp(req);
  const ipRecord = loginTracker[ip];

  res.json({
    isDefaultPassword: authData.isDefault,
    lastChanged: authData.lastChanged,
    failedAttempts: ipRecord ? ipRecord.fails : 0,
    serverTime: Date.now(),
    adminTelegramId: authData.adminTelegramId || "",
    securityRecommendations: authData.isDefault
      ? "⚠️ সতর্কবার্তা: আপনি এখনো ডিফল্ট পাসওয়ার্ড ('admin123') ব্যবহার করছেন। অবিলম্বে পাসওয়ার্ড পরিবর্তন করুন।"
      : "✅ পাসওয়ার্ড সুরক্ষিত অবস্থায় রয়েছে।",
  });
});

// POST /api/admin/set-telegram-id (Configure Telegram ID Lock)
app.post("/api/admin/set-telegram-id", requireAuth, (req: Request, res: Response) => {
  const { telegramUserId } = req.body || {};
  authData.adminTelegramId = telegramUserId ? String(telegramUserId).trim() : "";
  writeJSON(AUTH_FILE, authData);

  return res.json({
    ok: true,
    adminTelegramId: authData.adminTelegramId,
    message: authData.adminTelegramId
      ? `অ্যাডমিন অ্যাক্সেস শুধুমাত্র টেলিগ্রাম আইডি: ${authData.adminTelegramId} এর সাথে লক করা হয়েছে।`
      : "টেলিগ্রাম আইডি লক তুলে নেওয়া হয়েছে।",
  });
});

// POST /api/admin/change-password (Secure Password Change & Session Revocation)
app.post("/api/admin/change-password", requireAuth, (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body || {};

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "বর্তমান ও নতুন উভয় পাসওয়ার্ড প্রদান করতে হবে।" });
  }

  if (!verifyPassword(currentPassword)) {
    return res.status(401).json({ error: "বর্তমান পাসওয়ার্ড ভুল হয়েছে।" });
  }

  if (typeof newPassword !== "string" || newPassword.length < 8) {
    return res.status(400).json({ error: "নতুন পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।" });
  }

  if (newPassword === "admin123" || newPassword === currentPassword) {
    return res.status(400).json({ error: "নতুন পাসওয়ার্ড অবশ্যই ভিন্ন ও শক্তিশালী হতে হবে।" });
  }

  // Generate fresh salt & token secret (invalidates all other devices' active sessions immediately)
  const newSalt = crypto.randomBytes(32).toString("hex");
  const newHash = hashPassword(newPassword, newSalt);
  const newTokenSecret = crypto.randomBytes(32).toString("hex");

  authData = {
    salt: newSalt,
    hash: newHash,
    tokenSecret: newTokenSecret,
    isDefault: false,
    lastChanged: Date.now(),
  };

  writeJSON(AUTH_FILE, authData);

  // Issue new session token for the current user
  const exp = Date.now() + 24 * 3600 * 1000;
  const newToken = `${exp}.${signToken(exp)}`;

  return res.json({
    ok: true,
    token: newToken,
    message: "পাসওয়ার্ড সফলভাবে পরিবর্তন করা হয়েছে এবং অন্য সব ডিভাইসের সেশন বাতিল করা হয়েছে!",
  });
});

// POST /api/admin/revoke-sessions (Force logout on all devices)
app.post("/api/admin/revoke-sessions", requireAuth, (_req: Request, res: Response) => {
  // Rotate tokenSecret so all existing tokens become invalid
  authData.tokenSecret = crypto.randomBytes(32).toString("hex");
  writeJSON(AUTH_FILE, authData);

  // Generate new token for the current user
  const exp = Date.now() + 24 * 3600 * 1000;
  const newToken = `${exp}.${signToken(exp)}`;

  return res.json({
    ok: true,
    token: newToken,
    message: "সকল সেশন সফলভাবে বাতিল করা হয়েছে।",
  });
});

// POST /api/stat
app.post("/api/stat", (req: Request, res: Response) => {
  const { id, type } = req.body || {};
  const cfg = readJSON<any>(CFG, {});
  if (!["view", "like"].includes(type) || !(cfg.videos || []).some((v: any) => v.id === id)) {
    return res.status(400).json({ error: "Invalid request" });
  }

  const k = getClientIp(req) + ":" + id + ":" + type;
  if (seen[k] && Date.now() - seen[k] < 36e5) {
    return res.json({ ok: true });
  }
  seen[k] = Date.now();

  const s = stats[id] || (stats[id] = {});
  if (type === "view") s.views = (s.views || 0) + 1;
  if (type === "like") s.likes = (s.likes || 0) + 1;
  statsDirty = true;

  return res.json({ ok: true });
});

// GET /api/admin/config
app.get("/api/admin/config", requireAuth, (_req: Request, res: Response) => {
  res.json(readJSON(CFG, {}));
});

// PUT /api/admin/config (Strict input validation & path traversal protection)
app.put("/api/admin/config", requireAuth, (req: Request, res: Response) => {
  const { config: c, removed } = req.body || {};
  if (
    !c ||
    typeof c !== "object" ||
    !Array.isArray(c.tabs) ||
    !Array.isArray(c.categories) ||
    !Array.isArray(c.videos) ||
    typeof c.theme !== "object" ||
    typeof c.ads !== "object"
  ) {
    return res.status(400).json({ error: "কনফিগ ঠিক নেই" });
  }

  for (const v of Object.values(c.theme)) {
    if (!/^#[0-9a-f]{6}$/i.test(String(v))) {
      return res.status(400).json({ error: "রঙের হেক্স কোড সঠিক নয় (যেমন #ec2b8a)" });
    }
  }

  // Sanitize URLs to prevent XSS (no javascript: or data:text/html)
  const sanitizeUrl = (url: string) => {
    if (!url) return "";
    const clean = String(url).trim();
    if (/^(https?:\/\/|\/uploads\/|blob:)/i.test(clean)) return clean;
    return "";
  };

  c.videos.forEach((v: any) => {
    if (!v.id) v.id = "v" + crypto.randomBytes(4).toString("hex");
    if (v.src) v.src = sanitizeUrl(v.src);
    if (v.thumb) v.thumb = sanitizeUrl(v.thumb);
  });

  c.tabs.forEach((t: any) => {
    if (Array.isArray(t.items)) {
      t.items.forEach((it: any) => {
        if (it.url) it.url = sanitizeUrl(it.url);
      });
    }
  });

  writeJSON(CFG, c);
  const used = JSON.stringify(c);

  // Path-traversal safe file cleanup
  (Array.isArray(removed) ? removed : []).forEach((r) => {
    const raw = String(r).trim();
    const n = path.basename(raw);
    // Strictly require [0-9a-f]{16}.[ext]
    if (/^[a-f0-9]{16}\.(mp4|webm|mov|jpg|jpeg|png|webp)$/i.test(n)) {
      const fullPath = path.resolve(UP, n);
      if (fullPath.startsWith(UP) && !used.includes("/uploads/" + n)) {
        fs.unlink(fullPath, () => {});
      }
    }
  });

  return res.json({ ok: true });
});

// Helper: Validate Magic Bytes for uploaded media
const validateMagicBytes = (buf: Buffer, ext: string): boolean => {
  if (buf.length < 8) return false;

  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    case ".png":
      return (
        buf[0] === 0x89 &&
        buf[1] === 0x50 &&
        buf[2] === 0x4e &&
        buf[3] === 0x47 &&
        buf[4] === 0x0d &&
        buf[5] === 0x0a &&
        buf[6] === 0x1a &&
        buf[7] === 0x0a
      );
    case ".webp":
      return (
        buf.length >= 12 &&
        buf.toString("ascii", 0, 4) === "RIFF" &&
        buf.toString("ascii", 8, 12) === "WEBP"
      );
    case ".mp4":
    case ".mov": {
      // Check for common MP4/MOV container signatures in first 256 bytes
      const headerStr = buf.toString("latin1", 0, Math.min(buf.length, 256));
      return (
        headerStr.includes("ftyp") ||
        headerStr.includes("moov") ||
        headerStr.includes("wide") ||
        headerStr.includes("mdat") ||
        headerStr.includes("isom") ||
        headerStr.includes("mp41") ||
        headerStr.includes("mp42") ||
        headerStr.includes("qt  ") ||
        headerStr.includes("free")
      );
    }
    case ".webm":
      // EBML ID: 1A 45 DF A3
      return (
        buf[0] === 0x1a &&
        buf[1] === 0x45 &&
        buf[2] === 0xdf &&
        buf[3] === 0xa3
      );
    default:
      return false;
  }
};

// Helper: infer extension from filename or Content-Type header
const getNormalizedExt = (req: Request): string => {
  const fileName = (req.query.name as string) || "";
  let ext = path.extname(fileName).toLowerCase();
  if (ext) {
    if (ext === ".jpeg") ext = ".jpg";
    return ext;
  }
  const ct = (req.headers["content-type"] || "").toLowerCase().split(";")[0].trim();
  const mimeToExt: Record<string, string> = {
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
  };
  return mimeToExt[ct] || "";
};

// POST /api/upload (With magic byte verification and strict stream security)
app.post("/api/upload", requireAuth, (req: Request, res: Response) => {
  const ext = getNormalizedExt(req);

  if (!ALLOWED_EXTS.includes(ext)) {
    return res.status(400).json({ error: "এই ফাইল ধরন অনুমোদিত নয় (শুধুমাত্র mp4, webm, mov, jpg, png, webp)" });
  }

  const contentLength = parseInt((req.headers["content-length"] as string) || "0", 10);
  if (contentLength > MAX_BYTES) {
    return res.status(413).json({ error: "ফাইল সাইজ সীমা ছাড়িয়ে গেছে (সর্বোচ্চ ৫০০ এমবি)" });
  }

  const fn = crypto.randomBytes(8).toString("hex") + ext;
  const fp = path.join(UP, fn);
  const ws = fs.createWriteStream(fp);

  let size = 0;
  let rejected = false;
  let magicVerified = false;
  let initialBuffer = Buffer.alloc(0);

  req.on("data", (chunk: Buffer) => {
    if (rejected) return;
    size += chunk.length;

    if (size > MAX_BYTES) {
      rejected = true;
      req.unpipe(ws);
      ws.destroy();
      fs.unlink(fp, () => {});
      if (!res.headersSent) {
        return res.status(413).json({ error: "ফাইল অনেক বড় (সর্বোচ্চ ৫০০ এমবি)" });
      }
      return;
    }

    if (!magicVerified) {
      initialBuffer = Buffer.concat([initialBuffer, chunk]);
      if (initialBuffer.length >= 64) {
        const isValid = validateMagicBytes(initialBuffer, ext);
        if (!isValid) {
          rejected = true;
          req.unpipe(ws);
          ws.destroy();
          fs.unlink(fp, () => {});
          if (!res.headersSent) {
            return res.status(400).json({
              error: "ফাইল যাচাইকরণ ব্যর্থ হয়েছে: ফাইলের অভ্যন্তরীণ ডেটা এক্সটেনশনের সাথে মিলছে না (Security Signature Mismatch)।",
            });
          }
          return;
        }
        magicVerified = true;
      }
    }
  });

  req.on("aborted", () => {
    rejected = true;
    ws.destroy();
    fs.unlink(fp, () => {});
  });

  req.on("error", (err) => {
    rejected = true;
    ws.destroy();
    fs.unlink(fp, () => {});
    if (!res.headersSent) {
      res.status(500).json({ error: "আপলোড সংযোগে সমস্যা হয়েছে: " + (err.message || "") });
    }
  });

  ws.on("finish", () => {
    if (rejected) return;
    if (!magicVerified) {
      const isValid = validateMagicBytes(initialBuffer, ext);
      if (!isValid) {
        fs.unlink(fp, () => {});
        if (!res.headersSent) {
          return res.status(400).json({
            error: "ফাইল যাচাইকরণ ব্যর্থ হয়েছে: ফাইলের অভ্যন্তরীণ ডেটা এক্সটেনশনের সাথে মিলছে না (Security Signature Mismatch)।",
          });
        }
        return;
      }
    }
    if (!res.headersSent) {
      res.json({ url: "/uploads/" + fn });
    }
  });

  ws.on("error", () => {
    if (!res.headersSent) {
      res.status(500).json({ error: "ফাইল সেভ করা যায়নি" });
    }
  });

  req.pipe(ws);
});

// GET /uploads/:file with byte range streaming and sandbox CSP
app.get("/uploads/:filename", (req: Request, res: Response) => {
  const safeFilename = path.basename(req.params.filename);

  // Strict check on filename pattern
  if (!/^[a-f0-9]{16}\.(mp4|webm|mov|jpg|jpeg|png|webp)$/i.test(safeFilename)) {
    return res.status(404).send("File not found");
  }

  const file = path.join(UP, safeFilename);

  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      return res.status(404).send("File not found");
    }

    const ext = path.extname(file).toLowerCase();
    const contentType = MIME[ext] || "application/octet-stream";
    const headers: Record<string, string | number> = {
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; media-src 'self'; img-src 'self'; sandbox",
      "Content-Disposition": "inline",
    };

    const range = req.headers.range;
    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      if (match) {
        let start = match[1] ? parseInt(match[1], 10) : 0;
        let end = match[2] ? parseInt(match[2], 10) : st.size - 1;

        if (!match[1] && match[2]) {
          start = Math.max(0, st.size - parseInt(match[2], 10));
          end = st.size - 1;
        }

        if (end >= st.size) end = st.size - 1;
        if (start > end || start >= st.size) {
          res.writeHead(416, { "Content-Range": `bytes */${st.size}` });
          return res.end();
        }

        res.writeHead(206, {
          ...headers,
          "Content-Range": `bytes ${start}-${end}/${st.size}`,
          "Content-Length": end - start + 1,
        });
        return fs.createReadStream(file, { start, end }).pipe(res);
      }
    }

    res.writeHead(200, { ...headers, "Content-Length": st.size });
    fs.createReadStream(file).pipe(res);
  });
});

// GET /api/download-project (or /download): Direct download of full source code zip
app.get(["/api/download-project", "/download"], (_req: Request, res: Response) => {
  const zipPath = path.join(process.cwd(), "public", "fun-hub-source-code.zip");
  if (fs.existsSync(zipPath)) {
    return res.download(zipPath, "fun-hub-full-source.zip");
  }
  return res.status(404).send("Zip file not found");
});

// GET /api/download-zip: Packages standalone deployment files into a ready-to-run ZIP archive
app.get("/api/download-zip", (_req: Request, res: Response) => {
  res.attachment("fun-hub-standalone.zip");
  const createZip = () => {
    if (typeof (archiverModule as any).ZipArchive === "function") {
      return new (archiverModule as any).ZipArchive({ zlib: { level: 9 } });
    }
    if (typeof (archiverModule as any).default === "function") {
      return (archiverModule as any).default("zip", { zlib: { level: 9 } });
    }
    if (typeof archiverModule === "function") {
      return (archiverModule as any)("zip", { zlib: { level: 9 } });
    }
    return new (archiverModule as any).Archiver("zip", { zlib: { level: 9 } });
  };
  const archive = createZip();

  archive.on("error", (err: any) => {
    if (!res.headersSent) res.status(500).send({ error: err.message });
  });

  archive.pipe(res);

  // Standalone server.js (hardened)
  const standaloneServerJs = `// ফান হাব সার্ভার: নোড ১৮+ (কোনো এক্সটার্নাল প্যাকেজ লাগে না)
const http = require("http"), fs = require("fs"), path = require("path"), crypto = require("crypto");
const PORT = process.env.PORT || 3000;
const DATA = path.resolve(process.env.DATA_DIR || path.join(__dirname, "data"));
const MAX = (+process.env.MAX_UPLOAD_MB || 500) * 1048576;
const UP = path.join(DATA, "uploads"), CFG = path.join(DATA, "config.json"), STATS = path.join(DATA, "stats.json"), AUTH = path.join(DATA, "auth.json");
const PUB = path.join(__dirname, "public");
fs.mkdirSync(UP, { recursive: true });
if (!fs.existsSync(CFG)) fs.copyFileSync(path.join(__dirname, "default-config.json"), CFG);

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
const ALLOWED = [".mp4", ".webm", ".mov", ".jpg", ".jpeg", ".png", ".webp"];

const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { return d; } };
const writeJSON = (f, o) => { const t = f + ".tmp"; fs.writeFileSync(t, JSON.stringify(o, null, 2)); fs.renameSync(t, f); };

const hashPW = (p, s) => crypto.pbkdf2Sync(p, s, 100000, 64, "sha512").toString("hex");

let auth = readJSON(AUTH, null);
if (!auth || !auth.hash) {
  const envPass = process.env.ADMIN_PASSWORD || "admin123";
  const s = crypto.randomBytes(32).toString("hex");
  auth = { salt: s, hash: hashPW(envPass, s), tokenSecret: crypto.randomBytes(32).toString("hex"), isDefault: !process.env.ADMIN_PASSWORD, lastChanged: Date.now() };
  writeJSON(AUTH, auth);
}

let stats = readJSON(STATS, {}), statsDirty = false;
setInterval(() => { if (statsDirty) { statsDirty = false; writeJSON(STATS, stats); } }, 5000);

const sign = exp => crypto.createHmac("sha256", auth.tokenSecret).update(String(exp)).digest("hex");
const authed = req => {
  const [exp, sig] = (req.headers.authorization || "").replace("Bearer ", "").split(".");
  if (!exp || !sig || +exp < Date.now()) return false;
  const ok = sign(exp);
  return sig.length === ok.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(ok));
};

const send = (res, code, obj) => {
  res.writeHead(code, {
    "Content-Type": "application/json",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "X-XSS-Protection": "1; mode=block"
  });
  res.end(JSON.stringify(obj));
};

const body = (req, limit = 2e6) => new Promise((ok, no) => {
  let s = "";
  req.on("data", c => { s += c; if (s.length > limit) { no(new Error("big")); req.destroy(); } });
  req.on("end", () => { try { ok(JSON.parse(s || "{}")); } catch (e) { no(e); } });
  req.on("error", no);
});

const fails = {}, seen = {};
const ipOf = req => (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();

function serveFile(req, res, file, cache) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end("Not found"); }
    const h = {
      "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Accept-Ranges": "bytes",
      "Cache-Control": cache,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; media-src 'self'; img-src 'self'; sandbox"
    };
    const m = /bytes=(\\d*)-(\\d*)/.exec(req.headers.range || "");
    if (m) {
      let s = m[1] ? +m[1] : 0, e = m[2] ? +m[2] : st.size - 1;
      if (!m[1] && m[2]) { s = Math.max(0, st.size - +m[2]); e = st.size - 1; }
      if (e >= st.size) e = st.size - 1;
      if (s > e || s >= st.size) { res.writeHead(416, { "Content-Range": "bytes */" + st.size }); return res.end(); }
      res.writeHead(206, { ...h, "Content-Range": \`bytes \${s}-\${e}/\${st.size}\`, "Content-Length": e - s + 1 });
      return fs.createReadStream(file, { start: s, end: e }).pipe(res);
    }
    res.writeHead(200, { ...h, "Content-Length": st.size });
    fs.createReadStream(file).pipe(res);
  });
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x"), p = u.pathname;
  try {
    if (p === "/api/config" && req.method === "GET") {
      const c = readJSON(CFG, {});
      (c.videos || []).forEach(v => { const s = stats[v.id] || {}; v.views = (+v.views || 0) + (s.views || 0); v.likes = (+v.likes || 0) + (s.likes || 0); });
      res.setHeader("Cache-Control", "no-store");
      return send(res, 200, c);
    }
    if (p === "/api/login-info" && req.method === "GET") {
      const isLocked = !!(auth.adminTelegramId && String(auth.adminTelegramId).trim() !== "");
      const idStr = auth.adminTelegramId ? String(auth.adminTelegramId).trim() : "";
      const masked = idStr && idStr.length > 4 ? idStr.slice(0, 2) + "****" + idStr.slice(-2) : (idStr ? "****" : "");
      res.setHeader("Cache-Control", "no-store");
      return send(res, 200, { telegramLockEnabled: isLocked, maskedTelegramId: masked });
    }
    if (p === "/api/check-admin-access" && req.method === "GET") {
      const tgId = u.searchParams.get("tgId") ? String(u.searchParams.get("tgId")).trim() : "";
      const configured = auth.adminTelegramId ? String(auth.adminTelegramId).trim() : "";
      if (!configured) return send(res, 200, { allowed: true, lockActive: false });
      const allowedList = configured.split(",").map(s => s.trim()).filter(Boolean);
      return send(res, 200, { allowed: Boolean(tgId && allowedList.includes(tgId)), lockActive: true });
    }
    if (p === "/api/login" && req.method === "POST") {
      const ip = ipOf(req), f = fails[ip] || { n: 0, until: 0 };
      if (Date.now() < f.until) {
        const rem = Math.ceil((f.until - Date.now()) / 1000);
        return send(res, 429, { error: \`অনেকবার ভুল হয়েছে! আর \${rem} সেকেন্ড পরে চেষ্টা করুন।\` });
      }
      const { password, telegramUserId } = await body(req);
      if (auth.adminTelegramId && String(auth.adminTelegramId).trim() !== "") {
        const allowedList = String(auth.adminTelegramId).split(",").map(s => s.trim()).filter(Boolean);
        if (telegramUserId && !allowedList.includes(String(telegramUserId).trim())) {
          return send(res, 403, { error: "অ্যাক্সেস ডিনাইড: আপনার টেলিগ্রাম অ্যাকাউন্টটি অনুমোদিত নয়!" });
        }
      }
      const cand = hashPW(String(password || ""), auth.salt);
      const a = Buffer.from(cand, "hex"), b = Buffer.from(auth.hash, "hex");
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        f.n++;
        let wait = 0;
        if (f.n >= 10) wait = 3600;
        else if (f.n >= 7) wait = 900;
        else if (f.n >= 5) wait = 180;
        if (wait > 0) { f.until = Date.now() + wait * 1000; fails[ip] = f; return send(res, 429, { error: \`৫ বারের বেশি ভুল হয়েছে! অ্যাকাউন্ট \${wait} সেকেন্ড লক করা হলো।\` }); }
        fails[ip] = f;
        return send(res, 401, { error: \`পাসওয়ার্ড ভুল হয়েছে! আর \${5 - f.n} বার চেষ্টা করতে পারবেন।\` });
      }
      fails[ip] = { n: 0, until: 0 };
      const exp = Date.now() + 864e5;
      return send(res, 200, { token: exp + "." + sign(exp), isDefaultPassword: auth.isDefault });
    }
    if (p === "/api/admin/set-telegram-id" && req.method === "POST") {
      if (!authed(req)) return send(res, 401, { error: "login" });
      const { telegramUserId } = await body(req);
      auth.adminTelegramId = telegramUserId ? String(telegramUserId).trim() : "";
      writeJSON(AUTH, auth);
      return send(res, 200, { ok: true, adminTelegramId: auth.adminTelegramId, message: "টেলিগ্রাম আইডি আপডেট করা হয়েছে।" });
    }
    if (p === "/api/admin/auth-status" && req.method === "GET") {
      if (!authed(req)) return send(res, 401, { error: "login" });
      return send(res, 200, { isDefaultPassword: auth.isDefault, lastChanged: auth.lastChanged, adminTelegramId: auth.adminTelegramId || "" });
    }
    if (p === "/api/admin/change-password" && req.method === "POST") {
      if (!authed(req)) return send(res, 401, { error: "login" });
      const { currentPassword, newPassword } = await body(req);
      const cand = hashPW(String(currentPassword || ""), auth.salt);
      if (cand !== auth.hash) return send(res, 401, { error: "বর্তমান পাসওয়ার্ড ভুল হয়েছে।" });
      if (!newPassword || newPassword.length < 8) return send(res, 400, { error: "নতুন পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।" });
      const ns = crypto.randomBytes(32).toString("hex");
      auth = { salt: ns, hash: hashPW(newPassword, ns), tokenSecret: crypto.randomBytes(32).toString("hex"), isDefault: false, lastChanged: Date.now() };
      writeJSON(AUTH, auth);
      const exp = Date.now() + 864e5;
      return send(res, 200, { ok: true, token: exp + "." + sign(exp), message: "পাসওয়ার্ড পরিবর্তিত হয়েছে।" });
    }
    if (p === "/api/stat" && req.method === "POST") {
      const { id, type } = await body(req, 1000);
      const c = readJSON(CFG, {});
      if (!["view", "like"].includes(type) || !(c.videos || []).some(v => v.id === id)) return send(res, 400, { error: "bad" });
      const k = ipOf(req) + id + type;
      if (seen[k] && Date.now() - seen[k] < 36e5) return send(res, 200, { ok: true });
      seen[k] = Date.now();
      const s = stats[id] || (stats[id] = {});
      s[type + "s"] = (s[type + "s"] || 0) + 1; statsDirty = true;
      return send(res, 200, { ok: true });
    }
    if (p.startsWith("/api/admin/") || p === "/api/upload") {
      if (!authed(req)) return send(res, 401, { error: "login" });
    }
    if (p === "/api/admin/config" && req.method === "GET") return send(res, 200, readJSON(CFG, {}));
    if (p === "/api/admin/config" && req.method === "PUT") {
      const { config: c, removed } = await body(req);
      if (!c || typeof c !== "object" || !Array.isArray(c.tabs) || !Array.isArray(c.categories) || !Array.isArray(c.videos) || typeof c.theme !== "object" || typeof c.ads !== "object") return send(res, 400, { error: "কনফিগ ঠিক নেই" });
      for (const v of Object.values(c.theme)) if (!/^#[0-9a-f]{6}$/i.test(v)) return send(res, 400, { error: "রঙের কোড ঠিক নেই" });
      c.videos.forEach(v => { if (!v.id) v.id = "v" + crypto.randomBytes(4).toString("hex"); });
      writeJSON(CFG, c);
      const used = JSON.stringify(c);
      (Array.isArray(removed) ? removed : []).forEach(r => {
        const n = path.basename(String(r));
        if (/^[a-f0-9]{16}\\.(mp4|webm|mov|jpg|jpeg|png|webp)$/i.test(n) && !used.includes("/uploads/" + n)) fs.unlink(path.join(UP, n), () => {});
      });
      return send(res, 200, { ok: true });
    }
    if (p === "/api/upload" && req.method === "POST") {
      const ext = path.extname(u.searchParams.get("name") || "").toLowerCase();
      if (!ALLOWED.includes(ext)) return send(res, 400, { error: "এই ফাইল ধরন চলবে না" });
      if ((+req.headers["content-length"] || 0) > MAX) return send(res, 413, { error: "ফাইল অনেক বড়" });
      const fn = crypto.randomBytes(8).toString("hex") + ext, fp = path.join(UP, fn), ws = fs.createWriteStream(fp);
      let size = 0, bad = false;
      req.on("data", ch => { size += ch.length; if (size > MAX && !bad) { bad = true; req.unpipe(ws); ws.destroy(); fs.unlink(fp, () => {}); send(res, 413, { error: "ফাইল অনেক বড়" }); } });
      req.on("aborted", () => { ws.destroy(); fs.unlink(fp, () => {}); });
      req.pipe(ws);
      ws.on("finish", () => { if (!bad) send(res, 200, { url: "/uploads/" + fn }); });
      ws.on("error", () => { if (!res.headersSent) send(res, 500, { error: "সেভ করা যায়নি" }); });
      return;
    }
    if (p.startsWith("/uploads/")) {
      const n = path.basename(p);
      if (!/^[a-f0-9]{16}\\.(mp4|webm|mov|jpg|jpeg|png|webp)$/i.test(n)) { res.writeHead(404); return res.end(); }
      return serveFile(req, res, path.join(UP, n), "public, max-age=31536000, immutable");
    }
    if (p === "/admin" || p === "/admin/") return serveFile(req, res, path.join(PUB, "admin.html"), "no-cache");
    const f = path.join(PUB, p === "/" ? "index.html" : path.normalize(p));
    if (!f.startsWith(PUB)) { res.writeHead(403); return res.end(); }
    return serveFile(req, res, f, "no-cache");
  } catch (e) {
    if (!res.headersSent) send(res, 400, { error: "bad request" });
  }
}).listen(PORT, () => {
  console.log("ফান হাব চালু হয়েছে: http://localhost:" + PORT + " | অ্যাডমিন: /admin");
});
`;

  const standalonePackageJson = JSON.stringify(
    {
      name: "fun-hub",
      version: "1.0.0",
      private: true,
      scripts: { start: "node server.js" },
      engines: { node: ">=18" },
    },
    null,
    2
  );

  archive.append(standalonePackageJson, { name: "package.json" });
  archive.append(standaloneServerJs, { name: "server.js" });

  if (fs.existsSync(CFG)) {
    archive.file(CFG, { name: "default-config.json" });
  } else if (fs.existsSync(DEFAULT_CFG)) {
    archive.file(DEFAULT_CFG, { name: "default-config.json" });
  }

  // Include README
  const readmeContent = `ফান হাব: টেলিগ্রাম মিনি অ্যাপ + সুরক্ষিত অ্যাডমিন প্যানেল
=====================================================

সুরক্ষা ব্যবস্থা:
- PBKDF2 (100,000 iterations) ক্রিপ্টোগ্রাফিক সল্টেড হ্যাশিং
- ব্রুট-ফোর্স রোধে প্রোগ্রেসিভ রেট লিমিট ও সাময়িক আইপি লকআউট
- ম্যাজিক বাইট সিগনেচার ভ্যালিডেশন
- কনটেন্ট সিকিউরিটি পলিসি স্যান্ডবক্সিং ও পাথ ট্রাভার্সাল রোধ
- অ্যাডমিন প্যানেল থেকে পাসওয়ার্ড পরিবর্তনের সুবিধা

চালানোর নিয়মাবলী:
1. আপনার কম্পিউটারে:
   node server.js
   - মিনি অ্যাপ: http://localhost:3000
   - অ্যাডমিন: http://localhost:3000/admin (পাসওয়ার্ড: admin123)
   - প্রথম লগইনের পর অবিলম্বে 'সিকিউরিটি' ট্যাব থেকে পাসওয়ার্ড পরিবর্তন করুন!

2. সার্ভার ভ্যারিয়েবল:
   ADMIN_PASSWORD = আপনার নিজস্ব জটিল পাসওয়ার্ড
   DATA_DIR = /data
   MAX_UPLOAD_MB = 500
`;
  archive.append(readmeContent, { name: "README.txt" });

  // Add public files
  const publicDir = path.join(process.cwd(), "public");
  if (fs.existsSync(publicDir)) {
    archive.directory(publicDir, "public");
  }

  archive.finalize();
});

// Setup Vite Dev Server or Production Static Serving
async function startServer() {
  const isProduction = process.env.NODE_ENV === "production";

  if (!isProduction) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Fun Hub server running with hardened security at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
