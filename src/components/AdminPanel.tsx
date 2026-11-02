import React, { useState, useEffect } from "react";
import { AppConfig, VideoItem, TabConfig, LinkItem } from "../types";
import {
  Palette,
  Menu,
  Tags,
  Video,
  DollarSign,
  ArrowUp,
  ArrowDown,
  Trash2,
  Plus,
  Upload,
  Save,
  Lock,
  LogOut,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  FileText,
  Image as ImageIcon,
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  Eye,
  EyeOff,
  Clock,
  Check,
  ArrowLeft,
  X,
  Download,
  Play,
  Sparkles,
} from "lucide-react";
import {
  normalizeMediaUrl,
  isGoogleDriveUrl,
  isDropboxUrl,
  isTeraboxUrl,
  getGoogleDriveThumbnailUrl,
} from "../utils/mediaUtils";

interface AdminPanelProps {
  currentConfig: AppConfig;
  onConfigUpdated: (newConfig: AppConfig) => void;
  onBackToApp?: () => void;
  isTelegram?: boolean;
}

type AdminSection = "general" | "menu" | "cats" | "videos" | "ads" | "security";

export const AdminPanel: React.FC<AdminPanelProps> = ({
  currentConfig,
  onConfigUpdated,
  onBackToApp,
  isTelegram = false,
}) => {
  // STRICT SECURITY: Admin token NEVER auto-loads from storage. Always requires explicit password.
  const [token, setToken] = useState<string>("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState<number>(0);
  const [loginInfo, setLoginInfo] = useState<{ telegramLockEnabled?: boolean; maskedTelegramId?: string } | null>(null);

  // Telegram user detected from WebApp context
  const currentTgUser = typeof window !== "undefined" ? (window as any).Telegram?.WebApp?.initDataUnsafe?.user : null;

  const [isTgDenied, setIsTgDenied] = useState<boolean>(false);
  const [canMasterUnlock, setCanMasterUnlock] = useState<boolean>(false);
  const [showEmergencyUnlock, setShowEmergencyUnlock] = useState<boolean>(false);
  const [emergencyPw, setEmergencyPw] = useState<string>("");
  const [emergencyLoading, setEmergencyLoading] = useState<boolean>(false);
  const [emergencyError, setEmergencyError] = useState<string>("");
  const [previewModalUrl, setPreviewModalUrl] = useState<string | null>(null);

  // Clear any legacy stored tokens from previous testing so direct access is completely impossible
  useEffect(() => {
    try {
      localStorage.removeItem("tk");
      sessionStorage.removeItem("tk");
    } catch {}

    // Fetch public login info
    fetch("/api/login-info")
      .then((r) => r.json())
      .then((d) => setLoginInfo(d))
      .catch(() => {});

    // Check if this telegram user is allowed
    if (isTelegram && currentTgUser?.id) {
      fetch(`/api/check-admin-access?tgId=${encodeURIComponent(currentTgUser.id)}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.lockActive && !d.allowed) {
            setIsTgDenied(true);
          } else {
            setIsTgDenied(false);
          }
        })
        .catch(() => {});
    }
  }, [isTelegram, currentTgUser]);

  const handleExitToApp = () => {
    // Clear token immediately on exit so going back always requires password
    setToken("");
    setPassword("");
    setAuthStatus(null);
    try {
      localStorage.removeItem("tk");
      sessionStorage.removeItem("tk");
    } catch {}
    if (onBackToApp) onBackToApp();
  };

  // Telegram native BackButton integration
  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg && tg.BackButton && onBackToApp) {
      tg.BackButton.show();
      const handleBack = () => {
        handleExitToApp();
      };
      tg.BackButton.onClick(handleBack);
      return () => {
        tg.BackButton.offClick(handleBack);
        tg.BackButton.hide();
      };
    }
  }, [onBackToApp]);

  const [cfg, setCfg] = useState<AppConfig>(() => JSON.parse(JSON.stringify(currentConfig)));
  const [activeSection, setActiveSection] = useState<AdminSection>("general");
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string>("");
  const [removedFiles, setRemovedFiles] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, string>>({});

  // Security status state
  const [isDefaultPassword, setIsDefaultPassword] = useState<boolean>(false);
  const [authStatus, setAuthStatus] = useState<any>(null);

  // Telegram ID Lock config state
  const [telegramIdInput, setTelegramIdInput] = useState("");
  const [isSavingTelegramId, setIsSavingTelegramId] = useState(false);
  const [telegramMsg, setTelegramMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Change password form state
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isChangingPw, setIsChangingPw] = useState(false);

  useEffect(() => {
    if (!isDirty) {
      setCfg(JSON.parse(JSON.stringify(currentConfig)));
    }
  }, [currentConfig, isDirty]);

  // Lockout countdown timer
  useEffect(() => {
    if (retryAfterSeconds <= 0) return;
    const timer = setInterval(() => {
      setRetryAfterSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [retryAfterSeconds]);

  // Fetch security status when token is present
  const fetchAuthStatus = async (authToken = token) => {
    if (!authToken) return;
    try {
      const res = await fetch("/api/admin/auth-status", {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.status === 401) {
        handleLogout();
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setAuthStatus(data);
        setIsDefaultPassword(!!data.isDefaultPassword);
        if (data.adminTelegramId) {
          setTelegramIdInput(String(data.adminTelegramId));
        }
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (token) {
      fetchAuthStatus();
    }
  }, [token]);

  const handleSetTelegramId = async (idToSet: string) => {
    setIsSavingTelegramId(true);
    setTelegramMsg(null);
    try {
      const res = await fetch("/api/admin/set-telegram-id", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ telegramUserId: idToSet.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "à¦†à¦‡à¦¡à¦¿ à¦¸à§‡à¦Ÿ à¦•à¦°à¦¾ à¦¯à¦¾à¦¯à¦¼à¦¨à¦¿");
      setAuthStatus((prev: any) => ({ ...prev, adminTelegramId: data.adminTelegramId }));
      setTelegramMsg({
        type: "success",
        text: data.message || "à¦Ÿà§‡à¦²à¦¿à¦—à§à¦°à¦¾à¦® à¦†à¦‡à¦¡à¦¿ à¦²à¦• à¦¸à¦«à¦²à¦­à¦¾à¦¬à§‡ à¦†à¦ªà¦¡à§‡à¦Ÿ à¦•à¦°à¦¾ à¦¹à¦¯à¦¼à§‡à¦›à§‡!",
      });
      fetch("/api/login-info")
        .then((r) => r.json())
        .then((d) => setLoginInfo(d))
        .catch(() => {});
    } catch (err: any) {
      setTelegramMsg({
        type: "error",
        text: err.message || "à¦Ÿà§‡à¦²à¦¿à¦—à§à¦°à¦¾à¦® à¦†à¦‡à¦¡à¦¿ à¦¸à§‡à¦­ à¦•à¦°à¦¤à§‡ à¦¬à§à¦¯à¦°à§à¦¥ à¦¹à¦¯à¦¼à§‡à¦›à§‡",
      });
    } finally {
      setIsSavingTelegramId(false);
    }
  };

  const handleLogin = async (e?: React.FormEvent, forceUnlock = false) => {
    if (e) e.preventDefault();
    if (!password) {
      setLoginError("à¦ªà¦¾à¦¸à¦“à¦¯à¦¼à¦¾à¦°à§à¦¡ à¦ªà§à¦°à¦¦à¦¾à¦¨ à¦•à¦°à§à¦¨");
      return;
    }
    if (retryAfterSeconds > 0) {
      setLoginError(`à¦²à¦•à¦†à¦‰à¦Ÿ à¦¸à¦•à§à¦°à¦¿à¦¯à¦¼ à¦°à¦¯à¦¼à§‡à¦›à§‡! à¦†à¦° ${retryAfterSeconds} à¦¸à§‡à¦•à§‡à¦¨à§à¦¡ à¦ªà¦° à¦šà§‡à¦·à§à¦Ÿà¦¾ à¦•à¦°à§à¦¨à¥¤`);
      return;
    }

    setIsLoggingIn(true);
    setLoginError("");

    try {
      const tgUser = (window as any).Telegram?.WebApp?.initDataUnsafe?.user;
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          telegramUserId: tgUser ? tgUser.id : undefined,
          forceMasterUnlock: forceUnlock,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.retryAfter) {
          setRetryAfterSeconds(data.retryAfter);
        }
        if (data.canUnlockWithMaster) {
          setCanMasterUnlock(true);
          setLoginError(data.error);
        } else {
          setLoginError(data.error || "à¦ªà¦¾à¦¸à¦“à¦¯à¦¼à¦¾à¦°à§à¦¡ à¦­à§à¦² à¦¹à¦¯à¦¼à§‡à¦›à§‡");
        }
        setIsLoggingIn(false);
        return;
      }

      setCanMasterUnlock(false);
      setToken(data.token);
      setIsDefaultPassword(!!data.isDefaultPassword);
      setIsTgDenied(false);

      // Fetch config
      const cfgRes = await fetch("/api/admin/config", {
        headers: { Authorization: `Bearer ${data.token}` },
      });
      if (cfgRes.ok) {
        const fresh = await cfgRes.json();
        setCfg(fresh);
        onConfigUpdated(fresh);
      }
      fetchAuthStatus(data.token);
    } catch {
      setLoginError("à¦¸à¦¾à¦°à§à¦­à¦¾à¦°à§‡à¦° à¦¸à¦¾à¦¥à§‡ à¦¯à§‹à¦—à¦¾à¦¯à§‹à¦— à¦•à¦°à¦¾ à¦¯à¦¾à¦¯à¦¼à¦¨à¦¿");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleEmergencyUnlock = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!emergencyPw) {
      setEmergencyError("à¦®à¦¾à¦¸à§à¦Ÿà¦¾à¦° à¦ªà¦¾à¦¸à¦“à¦¯à¦¼à¦¾à¦°à§à¦¡ à¦ªà§à¦°à¦¦à¦¾à¦¨ à¦•à¦°à§à¦¨");
      return;
    }

    setEmergencyLoading(true);
    setEmergencyError("");

    try {
      const res = await fetch("/api/emergency-unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: emergencyPw,
          telegramUserId: currentTgUser?.id ? String(currentTgUser.id) : undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setEmergencyError(data.error || "à¦®à¦¾à¦¸à§à¦Ÿà¦¾à¦° à¦ªà¦¾à¦¸à¦“à¦¯à¦¼à¦¾à¦°à§à¦¡ à¦­à§à¦² à¦¹à¦¯à¦¼à§‡à¦›à§‡");
        return;
      }

      setToken(data.token);
      setIsTgDenied(false);
      setShowEmergencyUnlock(false);

      // Fetch config
      const cfgRes = await fetch("/api/admin/config", {
        headers: { Authorization: `Bearer ${data.token}` },
      });
      if (cfgRes.ok) {
        const fresh = await cfgRes.json();
        setCfg(fresh);
        onConfigUpdated(fresh);
      }
      fetchAuthStatus(data.token);
    } catch {
      setEmergencyError("à¦¸à¦¾à¦°à§à¦­à¦¾à¦°à§‡à¦° à¦¸à¦¾à¦¥à§‡ à¦¯à§‹à¦—à¦¾à¦¯à§‹à¦— à¦•à¦°à¦¾ à¦¯à¦¾à¦¯à¦¼à¦¨à¦¿");
    } finally {
      setEmergencyLoading(false);
    }
  };

  const handleLogout = () => {
    setToken("");
    setPassword("");
    setAuthStatus(null);
    try {
      localStorage.removeItem("tk");
      sessionStorage.removeItem("tk");
    } catch {}
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg(null);

    if (!currentPw || !newPw || !confirmPw) {
      setPwMsg({ type: "error", text: "à¦¸à¦¬à¦—à§à¦²à§‹ à¦˜à¦° à¦ªà§‚à¦°à¦£ à¦•à¦°à§à¦¨" });
      return;
    }
    if (newPw.length < 8) {
      setPwMsg({ type: "error", text: "à¦¨à¦¤à§à¦¨ à¦ªà¦¾à¦¸à¦“à¦¯à¦¼à¦¾à¦°à§à¦¡ à¦•à¦®à¦ªà¦•à§à¦·à§‡ à§® à¦…à¦•à§à¦·à¦°à§‡à¦° à¦¹à¦¤à§‡ à¦¹à¦¬à§‡" });
      return;
    }
    if (newPw !== confirmPw) {
      setPwMsg({ type: "error", text: "à¦¨à¦¤à§à¦¨ à¦ªà¦¾à¦¸à¦“à¦¯à¦¼à¦¾à¦°à§à¦¡ à¦¦à§à¦¬à¦¾à¦° à¦à¦•à¦‡ à¦¹à¦¤à§‡ à¦¹à¦¬à§‡" });
      return;
    }
    if (newPw === "admin123") {
      setPwMsg({ type: "error", text: "à¦¡à¦¿à¦«à¦²à§à¦Ÿ 'admin123' à¦›à¦¾à¦¡à¦¼à¦¾ à¦…à¦¨à§à¦¯ à¦¶à¦•à§à¦¤à¦¿à¦¶à¦¾à¦²à§€ à¦ªà¦¾à¦¸à¦“à¦¯à¦¼à¦¾à¦°à§à¦¡ à¦¦à¦¿à¦¨" });
      return;
    }

    setIsChangingPw(true);
    try {
      const res = await fetch("/api/admin/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentPassword: currentPw,
          newPassword: newPw,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "à¦ªà¦¾à¦¸à¦“à¦¯à¦¼à¦¾à¦°à§à¦¡ à¦ªà¦°à¦¿à¦¬à¦°à§à¦¤à¦¨ à¦•à¦°à¦¾ à¦¯à¦¾à¦¯à¦¼à¦¨à¦¿");
      }

      setToken(data.token);
      setIsDefaultPassword(false);
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
      setPwMsg({
        type: "success",
        text: "âœ… à¦ªà¦¾à¦¸à¦“à¦¯à¦¼à¦¾à¦°à§à¦¡ à¦¸à¦«à¦²à¦­à¦¾à¦¬à§‡ à¦ªà¦°à¦¿à¦¬à¦°à§à¦¤à¦¨ à¦¹à¦¯à¦¼à§‡à¦›à§‡! à¦…à¦¨à§à¦¯ à¦¸à¦¬ à¦¸à§‡à¦¶à¦¨ à¦¬à¦¾à¦¤à¦¿à¦² à¦•à¦°à¦¾ à¦¹à¦¯à¦¼à§‡à¦›à§‡à¥¤",
      });
      fetchAuthStatus(data.token);
    } catch (err: any) {
      setPwMsg({ type: "error", text: err.message || "à¦ªà¦¾à¦¸à¦“à¦¯à¦¼à¦¾à¦°à§à¦¡ à¦ªà¦°à¦¿à¦¬à¦°à§à¦¤à¦¨ à¦¬à§à¦¯à¦°à§à¦¥ à¦¹à¦¯à¦¼à§‡à¦›à§‡" });
    } finally {
      setIsChangingPw(false);
    }
  };

  const handleRevokeAllSessions = async () => {
    if (!confirm("à¦†à¦ªà¦¨à¦¿ à¦•à¦¿ à¦…à¦¨à§à¦¯ à¦¸à¦•à¦² à¦¡à¦¿à¦­à¦¾à¦‡à¦¸ à¦“ à¦¬à§à¦°à¦¾à¦‰à¦œà¦¾à¦°à§‡à¦° à¦¸à§‡à¦¶à¦¨ à¦²à¦—à¦†à¦‰à¦Ÿ à¦•à¦°à§‡ à¦¦à¦¿à¦¤à§‡ à¦šà¦¾à¦¨?")) return;
    try {
      const res = await fetch("/api/admin/revoke-sessions", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setToken(data.token);
        alert("âœ… à¦…à¦¨à§à¦¯ à¦¸à¦•à¦² à¦¡à¦¿à¦­à¦¾à¦‡à¦¸à§‡à¦° à¦¸à¦•à§à¦°à¦¿à¦¯à¦¼ à¦¸à§‡à¦¶à¦¨ à¦¸à¦«à¦²à¦­à¦¾à¦¬à§‡ à¦¬à¦¾à¦¤à¦¿à¦² à¦•à¦°à¦¾ à¦¹à¦¯à¦¼à§‡à¦›à§‡à¥¤");
      } else {
        alert(data.error || "à¦¸à§‡à¦¶à¦¨ à¦¬à¦¾à¦¤à¦¿à¦² à¦•à¦°à¦¾ à¦¯à¦¾à¦¯à¦¼à¦¨à¦¿");
      }
    } catch {
      alert("à¦¨à§‡à¦Ÿà¦“à¦¯à¦¼à¦¾à¦°à§à¦• à¦¤à§à¦°à§à¦Ÿà¦¿");
    }
  };

  const markDirty = () => {
    setIsDirty(true);
    setSaveStatus("â— à¦¸à§‡à¦­ à¦•à¦°à¦¾ à¦¹à¦¯à¦¼à¦¨à¦¿");
  };

  const updateConfigValue = (path: string, value: any) => {
    markDirty();
    setCfg((prev) => {
      const clone = JSON.parse(JSON.stringify(prev));
      const parts = path.split(".");
      let target: any = clone;
      for (let i = 0; i < parts.length - 1; i++) {
        target = target[parts[i]];
      }
      target[parts[parts.length - 1]] = value;
      return clone;
    });
  };

  const moveItem = (arrayKey: "tabs" | "categories" | "videos", index: number, delta: number) => {
    markDirty();
    setCfg((prev) => {
      const clone = JSON.parse(JSON.stringify(prev));
      const arr = clone[arrayKey];
      const targetIdx = index + delta;
      if (targetIdx < 0 || targetIdx >= arr.length) return prev;
      if (arrayKey === "categories" && targetIdx < 1) return prev;

      const temp = arr[index];
      arr[index] = arr[targetIdx];
      arr[targetIdx] = temp;
      return clone;
    });
  };

  const deleteItem = (arrayKey: "tabs" | "categories" | "videos", index: number) => {
    if (!confirm("à¦®à§à¦›à§‡ à¦«à§‡à¦²à¦¤à§‡ à¦šà¦¾à¦¨?")) return;
    markDirty();
    setCfg((prev) => {
      const clone = JSON.parse(JSON.stringify(prev));
      const arr = clone[arrayKey];
      if (arrayKey === "videos") {
        const v = arr[index];
        if (v.src && v.src.startsWith("/uploads/")) setRemovedFiles((r) => [...r, v.src]);
        if (v.thumb && v.thumb.startsWith("/uploads/")) setRemovedFiles((r) => [...r, v.thumb]);
      } else if (arrayKey === "categories") {
        const catName = arr[index];
        const fallback = clone.categories[1] === catName ? (clone.categories[2] || "") : clone.categories[1];
        clone.videos.forEach((v: VideoItem) => {
          if (v.cat === catName) v.cat = fallback;
        });
      }
      arr.splice(index, 1);
      return clone;
    });
  };

  const handleRenameCategory = (index: number, newName: string) => {
    markDirty();
    setCfg((prev) => {
      const clone = JSON.parse(JSON.stringify(prev));
      const oldName = clone.categories[index];
      clone.categories[index] = newName;
      clone.videos.forEach((v: VideoItem) => {
        if (v.cat === oldName) v.cat = newName;
      });
      return clone;
    });
  };

  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    videoIndex: number,
    field: "src" | "thumb"
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so re-selecting same file triggers change
    e.target.value = "";

    const progKey = `${videoIndex}-${field}`;
    setUploadProgress((p) => ({ ...p, [progKey]: "à¦†à¦ªà¦²à§‹à¦¡ à¦¶à§à¦°à§ à¦¹à¦šà§à¦›à§‡..." }));

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/upload?name=${encodeURIComponent(file.name)}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    if (file.type) {
      xhr.setRequestHeader("Content-Type", file.type);
    }
    xhr.timeout = 1800000; // 30 minutes for large videos

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable) {
        const pct = Math.round((evt.loaded / evt.total) * 100);
        if (pct < 100) {
          setUploadProgress((p) => ({ ...p, [progKey]: `${pct}% à¦†à¦ªà¦²à§‹à¦¡ à¦¹à¦šà§à¦›à§‡...` }));
        } else {
          setUploadProgress((p) => ({ ...p, [progKey]: "à§§à§¦à§¦% à¦†à¦ªà¦²à§‹à¦¡ à¦¸à¦®à§à¦ªà¦¨à§à¦¨! à¦¸à¦¾à¦°à§à¦­à¦¾à¦°à§‡ à¦¸à¦‚à¦°à¦•à§à¦·à¦£ à¦“ à¦¯à¦¾à¦šà¦¾à¦‡ à¦¹à¦šà§à¦›à§‡..." }));
        }
      }
    };

    xhr.onload = () => {
      if (xhr.status === 200) {
        try {
          const res = JSON.parse(xhr.responseText);
          const newUrl = res.url;
          const oldUrl = cfg.videos[videoIndex]?.[field];
          if (oldUrl && oldUrl.startsWith("/uploads/")) {
            setRemovedFiles((r) => [...r, oldUrl]);
          }

          markDirty();
          setCfg((prev) => {
            const clone = JSON.parse(JSON.stringify(prev));
            if (!clone.videos[videoIndex]) return clone;
            clone.videos[videoIndex][field] = newUrl;

            if (field === "src") {
              const videoElement = document.createElement("video");
              videoElement.preload = "metadata";
              videoElement.muted = true;
              videoElement.playsInline = true;
              videoElement.onloadedmetadata = () => {
                const s = Math.round(videoElement.duration);
                if (isFinite(s)) {
                  const m = Math.floor(s / 60);
                  const sec = s % 60;
                  const durStr = `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
                  setCfg((curr) => {
                    const c = JSON.parse(JSON.stringify(curr));
                    if (c.videos[videoIndex]) c.videos[videoIndex].dur = durStr;
                    return c;
                  });
                }
                videoElement.currentTime = Math.min(1, (videoElement.duration || 2) / 2);
              };

              videoElement.onseeked = () => {
                try {
                  const canvas = document.createElement("canvas");
                  canvas.width = Math.min(640, videoElement.videoWidth || 640);
                  canvas.height = Math.min(360, videoElement.videoHeight || 360);
                  const ctx = canvas.getContext("2d");
                  if (ctx && canvas.width > 0 && canvas.height > 0) {
                    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
                    const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
                    setCfg((curr) => {
                      const c = JSON.parse(JSON.stringify(curr));
                      if (c.videos[videoIndex] && !c.videos[videoIndex].thumb) {
                        c.videos[videoIndex].thumb = dataUrl;
                      }
                      return c;
                    });
                  }
                } catch {}
                URL.revokeObjectURL(videoElement.src);
              };

              videoElement.src = URL.createObjectURL(file);
            }

            return clone;
          });

          setUploadProgress((p) => ({ ...p, [progKey]: "âœ… à¦†à¦ªà¦²à§‹à¦¡ à¦¸à¦«à¦²à¦­à¦¾à¦¬à§‡ à¦¸à¦®à§à¦ªà¦¨à§à¦¨ à¦¹à¦¯à¦¼à§‡à¦›à§‡!" }));
          setTimeout(() => {
            setUploadProgress((p) => {
              const copy = { ...p };
              delete copy[progKey];
              return copy;
            });
          }, 4000);
        } catch {
          setUploadProgress((p) => ({ ...p, [progKey]: "âŒ à¦°à§‡à¦¸à¦ªà¦¨à§à¦¸ à¦ªà§à¦°à¦¸à§‡à¦¸ à¦•à¦°à¦¾ à¦¯à¦¾à¦¯à¦¼à¦¨à¦¿" }));
        }
      } else {
        let msg = "à¦†à¦ªà¦²à§‹à¦¡ à¦¬à§à¦¯à¦°à§à¦¥ à¦¹à¦¯à¦¼à§‡à¦›à§‡";
        try {
          msg = JSON.parse(xhr.responseText).error || msg;
        } catch {}
        setUploadProgress((p) => ({ ...p, [progKey]: `âŒ ${msg}` }));
      }
    };

    xhr.ontimeout = () => {
      setUploadProgress((p) => ({ ...p, [progKey]: "âŒ à¦Ÿà¦¾à¦‡à¦®à¦†à¦‰à¦Ÿ: à¦‡à¦¨à§à¦Ÿà¦¾à¦°à¦¨à§‡à¦Ÿà§‡à¦° à¦—à¦¤à¦¿ à¦§à§€à¦° à¦¹à¦“à¦¯à¦¼à¦¾à¦¯à¦¼ à¦†à¦ªà¦²à§‹à¦¡ à¦¸à¦®à§à¦ªà¦¨à§à¦¨ à¦•à¦°à¦¾ à¦¯à¦¾à¦¯à¦¼à¦¨à¦¿à¥¤" }));
    };

    xhr.onerror = () => {
      setUploadProgress((p) => ({ ...p, [progKey]: "âŒ à¦¨à§‡à¦Ÿà¦“à¦¯à¦¼à¦¾à¦°à§à¦• à¦¸à¦®à¦¸à§à¦¯à¦¾: à¦¸à¦¾à¦°à§à¦­à¦¾à¦°à§‡à¦° à¦¸à¦¾à¦¥à§‡ à¦¸à¦‚à¦¯à§‹à¦— à¦¬à¦¿à¦šà§à¦›à¦¿à¦¨à§à¦¨à¥¤" }));
    };

    xhr.send(file);
  };

  const handleSave = async () => {
    const isUploading = Object.values(uploadProgress).some(
      (msg) => typeof msg === "string" && (msg.includes("à¦¹à¦šà§à¦›à§‡") || msg.includes("à¦šà¦²à¦›à§‡"))
    );
    if (isUploading) {
      alert("âš ï¸ à¦à¦•à¦Ÿà¦¿ à¦«à¦¾à¦‡à¦² à¦à¦–à¦¨à§‹ à¦†à¦ªà¦²à§‹à¦¡ à¦¹à¦šà§à¦›à§‡! à¦…à¦¨à§à¦—à§à¦°à¦¹ à¦•à¦°à§‡ à¦†à¦ªà¦²à§‹à¦¡ à¦¶à§‡à¦· à¦¹à¦“à¦¯à¦¼à¦¾ à¦ªà¦°à§à¦¯à¦¨à§à¦¤ à¦…à¦ªà§‡à¦•à§à¦·à¦¾ à¦•à¦°à§‡ à¦¤à¦¾à¦°à¦ªà¦° à¦¸à§‡à¦­ à¦•à¦°à§à¦¨à¥¤");
      return;
    }

    setSaveStatus("à¦¸à§‡à¦­ à¦¹à¦šà§à¦›à§‡...");
    try {
      const res = await fetch("/api/admin/config", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          config: cfg,
          removed: removedFiles,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "à¦¸à§‡à¦­ à¦•à¦°à¦¾ à¦¯à¦¾à¦¯à¦¼à¦¨à¦¿");
      }

      setRemovedFiles([]);
      setIsDirty(false);
      setSaveStatus("âœ… à¦¸à¦«à¦²à¦­à¦¾à¦¬à§‡ à¦¸à§‡à¦­ à¦¹à¦¯à¦¼à§‡à¦›à§‡!");
      onConfigUpdated(cfg);

      setTimeout(() => {
        setSaveStatus("");
      }, 4000);
    } catch (err: any) {
      setSaveStatus(`âŒ ${err.message || "à¦¸à§‡à¦­ à¦¬à§à¦¯à¦°à§à¦¥ à¦¹à¦¯à¦¼à§‡à¦›à§‡"}`);
    }
  };

  // Password strength calculation
  const getPasswordStrength = (pass: string) => {
    if (!pass) return { score: 0, label: "", color: "" };
    let score = 0;
    if (pass.length >= 8) score += 1;
    if (pass.length >= 12) score += 1;
    if (/[A-Z]/.test(pass) && /[a-z]/.test(pass)) score += 1;
    if (/[0-9]/.test(pass)) score += 1;
    if (/[^A-Za-z0-9]/.test(pass)) score += 1;

    if (score <= 2) return { score: 1, label: "à¦¦à§à¦°à§à¦¬à¦² (Weak)", color: "text-red-400 bg-red-500" };
    if (score <= 4) return { score: 2, label: "à¦®à¦¾à¦à¦¾à¦°à¦¿ (Medium)", color: "text-amber-400 bg-amber-500" };
    return { score: 3, label: "à¦¶à¦•à§à¦¤à¦¿à¦¶à¦¾à¦²à§€ (Strong)", color: "text-green-400 bg-green-500" };
  };

  const pwStrength = getPasswordStrength(newPw);

  // If in Telegram and user is not the authorized admin, show smart emergency unlock
  if (isTelegram && isTgDenied) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-[#160a26]/95 backdrop-blur-xl border border-red-500/30 rounded-3xl p-6 sm:p-7 text-center shadow-2xl relative">
          {onBackToApp && (
            <button
              onClick={handleExitToApp}
              className="absolute top-3.5 right-3.5 p-1.5 rounded-full text-white/40 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="à¦¬à¦¨à§à¦§ à¦•à¦°à§à¦¨"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          <div className="w-14 h-14 mx-auto mb-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-2xl shadow-inner">
            ðŸ›¡ï¸
          </div>
          <h3 className="text-sm font-bold text-red-400 mb-1">à¦Ÿà§‡à¦²à¦¿à¦—à§à¦°à¦¾à¦® à¦¸à§à¦°à¦•à§à¦·à¦¾ à¦²à¦• à¦¸à¦•à§à¦°à¦¿à¦¯à¦¼</h3>
          <p className="text-xs text-[#a58bb8] mb-3 leading-relaxed">
            à¦†à¦ªà¦¨à¦¾à¦° à¦¬à¦°à§à¦¤à¦®à¦¾à¦¨ à¦Ÿà§‡à¦²à¦¿à¦—à§à¦°à¦¾à¦® à¦†à¦‡à¦¡à¦¿à¦Ÿà¦¿ à¦à¦–à¦¨à§‹ à¦…à§à¦¯à¦¾à¦¡à¦®à¦¿à¦¨ à¦¹à¦¿à¦¸à§‡à¦¬à§‡ à¦…à¦¨à§à¦®à§‹à¦¦à¦¿à¦¤ à¦¤à¦¾à¦²à¦¿à¦•à¦¾à¦¯à¦¼ à¦¨à§‡à¦‡à¥¤
          </p>

          {currentTgUser?.id && (
            <div className="mb-4 p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-xs text-purple-200 font-mono">
              à¦†à¦ªà¦¨à¦¾à¦° à¦Ÿà§‡à¦²à¦¿à¦—à§à¦°à¦¾à¦® à¦†à¦‡à¦¡à¦¿: <span className="font-bold text-pink-400">{currentTgUser.id}</span>
            </div>
          )}

          {!showEmergencyUnlock ? (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowEmergencyUnlock(true)}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-pink-500 to-purple-600 hover:opacity-95 text-white text-xs font-bold transition-all shadow cursor-pointer flex items-center justify-center gap-2"
              >
                <KeyRound className="w-4 h-4" />
                <span>ðŸ”‘ à¦®à¦¾à¦¸à§à¦Ÿà¦¾à¦° à¦ªà¦¾à¦¸à¦“à¦¯à¦¼à¦¾à¦°à§à¦¡ à¦¦à¦¿à¦¯à¦¼à§‡ à¦†à¦¨à¦²à¦• à¦•à¦°à§à¦¨</span>
              </button>
              {onBackToApp && (
                <button
                  type="button"
                  onClick={handleExitToApp}
                  className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 text-xs font-semibold transition-colors cursor-pointer"
                >
                  à¦…à§à¦¯à¦¾à¦ªà§‡ à¦«à¦¿à¦°à§‡ à¦¯à¦¾à¦¨
                </button>
              )}
            </div>
          ) : (
            <form onSubmit={handleEmergencyUnlock} className="space-y-3 text-left">
              <label className="text-[11px] text-[#8f93ad] block">
                à¦à¦¡à¦®à¦¿à¦¨ à¦®à¦¾à¦¸à§à¦Ÿà¦¾à¦° à¦ªà¦¾à¦¸à¦“à¦¯à¦¼à¦¾à¦°à§à¦¡ à¦ªà§à¦°à¦¬à§‡à¦¶ à¦•à¦°à¦¾à¦¨:
              </label>
              <input
                type="password"
                placeholder="à¦®à¦¾à¦¸à§à¦Ÿà¦¾à¦° à¦ªà¦¾à¦¸à¦“à¦¯à¦¼à¦¾à¦°à§à¦¡"
                value={emergencyPw}
                onChange={(e) => setEmergencyPw(e.target.value)}
                autoFocus
                className="w-full px-4 py-2.5 rounded-xl bg-[#0d0417] border border-[#3b194f] text-white text-sm outline-none focus:border-pink-500"
              />
              {emergencyError && (
                <p className="text-xs text-red-400 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{emergencyError}</span>
                </p>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowEmergencyUnlock(false)}
                  className="flex-1 py-2 rounded-xl bg-white/5 text-xs text-white/70 hover:bg-white/10"
                >
                  à¦¬à¦¾à¦¤à¦¿à¦²
                </button>
                <button
                  type="submit"
                  disabled={emergencyLoading || !emergencyPw}
                  className="flex-1 py-2 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 hover:opacity-95 text-white font-bold text-xs shadow flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {emergencyLoading ? "à¦†à¦¨à¦²à¦• à¦¹à¦šà§à¦›à§‡..." : "âœ… à¦…à¦¨à§à¦®à§‹à¦¦à¦¨ à¦“ à¦²à¦—à¦‡à¦¨"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  // If not logged in, show sleek minimal password box (no clutter/verbose text)
  if (!token) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="w-full max-w-xs bg-[#160a26]/90 backdrop-blur-xl border border-[#3b194f] rounded-3xl p-6 sm:p-7 shadow-2xl text-center relative">
          {onBackToApp && (
            <button
              onClick={handleExitToApp}
              className="absolute top-3.5 right-3.5 p-1.5 rounded-full text-white/40 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="à¦¬à¦¨à§à¦§ à¦•à¦°à§à¦¨"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-tr from-pink-500/20 to-purple-600/20 border border-pink-500/30 flex items-center justify-center text-3xl shadow-inner">
            ðŸ”
          </div>

          <form onSubmit={(e) => handleLogin(e, false)} className="space-y-3">
            <div className="relative flex items-center">
              <input
                type="password"
                placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
                value={password}
                disabled={retryAfterSeconds > 0}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setCanMasterUnlock(false);
                }}
                autoFocus
                className="w-full px-4 py-3.5 pr-12 rounded-2xl bg-[#0d0417] border border-[#3b194f] text-white text-base tracking-widest placeholder:tracking-normal placeholder:text-white/30 outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition-all text-center disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={isLoggingIn || retryAfterSeconds > 0 || !password}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 text-white flex items-center justify-center shadow hover:opacity-90 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
                title="à¦ªà§à¦°à¦¬à§‡à¦¶"
              >
                {isLoggingIn ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <ArrowLeft className="w-4 h-4 rotate-180" />
                )}
              </button>
            </div>

            {retryAfterSeconds > 0 && (
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 flex items-center justify-center gap-2">
                <Clock className="w-3.5 h-3.5 shrink-0 animate-spin" />
                <span>{retryAfterSeconds}s</span>
              </div>
            )}

            {loginError && retryAfterSeconds <= 0 && (
              <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-400 flex items-center justify-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            {canMasterUnlock && (
              <button
                type="button"
                onClick={() => handleLogin(undefined, true)}
                className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 hover:opacity-95 text-white text-xs font-bold transition-all shadow cursor-pointer mt-2"
              >
                âœ… à¦à¦‡ à¦†à¦‡à¦¡à¦¿ à¦…à§à¦¯à¦¾à¦¡à¦®à¦¿à¦¨ à¦¤à¦¾à¦²à¦¿à¦•à¦¾à¦¯à¦¼ à¦¯à§à¦•à§à¦¤ à¦•à¦°à§à¦¨ à¦“ à¦ªà§à¦°à¦¬à§‡à¦¶ à¦•à¦°à§à¦¨
              </button>
            )}
          </form>
        </div>
      </div>
    );
  }

  const sections: { id: AdminSection; label: string; icon: any }[] = [
    { id: "general", label: "ðŸŽ¨ à¦¸à¦¾à¦§à¦¾à¦°à¦£ à¦“ à¦°à¦™", icon: Palette },
    { id: "menu", label: "ðŸ“‘ à¦®à§‡à¦¨à§", icon: Menu },
    { id: "cats", label: "ðŸ· à¦•à§à¦¯à¦¾à¦Ÿà¦¾à¦—à¦°à¦¿", icon: Tags },
    { id: "videos", label: "ðŸŽ¬ à¦­à¦¿à¦¡à¦¿à¦“", icon: Video },
    { id: "ads", label: "ðŸ’° à¦¬à¦¿à¦œà§à¦žà¦¾à¦ªà¦¨", icon: DollarSign },
    { id: "security", label: "ðŸ” à¦¸à¦¿à¦•à¦¿à¦‰à¦°à¦¿à¦Ÿà¦¿", icon: ShieldCheck },
  ];

  return (
    <div className="w-full max-w-4xl mx-auto p-4 sm:p-6 pb-28 text-[#eceef8]">
      {/* Default Password Warning Alert */}
      {isDefaultPassword && (
        <div className="mb-6 p-4 rounded-2xl bg-amber-500/15 border-2 border-amber-500/50 text-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 shrink-0">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">
                âš ï¸ à¦œà¦°à§à¦°à¦¿ à¦¸à¦¿à¦•à¦¿à¦‰à¦°à¦¿à¦Ÿà¦¿ à¦¸à¦¤à¦°à§à¦•à¦¬à¦¾à¦°à§à¦¤à¦¾: à¦¡à¦¿à¦«à¦²à§à¦Ÿ à¦ªà¦¾à¦¸à¦“à¦¯à¦¼à¦¾à¦°à§à¦¡ à¦¸à¦•à§à¦°à¦¿à¦¯à¦¼!
              </h4>
              <p className="text-xs text-amber-200/80 mt-0.5">
                à¦†à¦ªà¦¨à¦¾à¦° à¦¸à¦¿à¦¸à§à¦Ÿà§‡à¦®à§‡ à¦à¦–à¦¨à§‹ à¦¡à¦¿à¦«à¦²à§à¦Ÿ à¦ªà¦¾à¦¸à¦“à¦¯à¦¼à¦¾à¦°à§à¦¡ (<span className="font-mono font-bold text-white">admin123</span>) à¦°à¦¯à¦¼à§‡à¦›à§‡à¥¤ à¦¯à§‡ à¦•à§‡à¦‰ à¦à¦Ÿà¦¿ à¦…à¦¨à§à¦®à¦¾à¦¨ à¦•à¦°à¦¤à§‡ à¦ªà¦¾à¦°à§‡à¥¤
              </p>
            </div>
          </div>
          <button
            onClick={() => setActiveSection("security")}
            className="px-4 py-2 rounded-xl bg-amber-500 text-black font-bold text-xs hover:bg-amber-400 transition-colors shrink-0 cursor-pointer shadow"
          >
            à¦à¦–à¦¨à¦‡ à¦ªà¦¾à¦¸à¦“à¦¯à¦¼à¦¾à¦°à§à¦¡ à¦¬à¦¦à¦²à¦¾à¦¨ â†’
          </button>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-[#1a1b26] border border-[#33354a] mb-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-pink-500/20 border border-pink-500/40 flex items-center justify-center text-pink-400 font-bold">
            âš™
          </div>
          <div>
            <h2 className="text-base font-bold text-white leading-tight">
              {cfg.appName || "à¦«à¦¾à¦¨ à¦¹à¦¾à¦¬"} à¦…à§à¦¯à¦¾à¦¡à¦®à¦¿à¦¨ à¦•à¦¨à§à¦Ÿà§à¦°à§‹à¦²
            </h2>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-[#8f93ad]">
                à¦­à¦¿à¦¡à¦¿à¦“, à¦®à§‡à¦¨à§, à¦¬à¦¿à¦œà§à¦žà¦¾à¦ªà¦¨ à¦“ à¦¥à¦¿à¦® à¦®à§à¦¯à¦¾à¦¨à§‡à¦œà¦®à§‡à¦¨à§à¦Ÿ
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20">
                <ShieldCheck className="w-3 h-3" />
                <span>à¦¸à¦¿à¦•à¦¿à¦‰à¦°à¦¡</span>
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onBackToApp && (
            <button
              onClick={handleExitToApp}
              className="px-3 py-1.5 rounded-lg bg-pink-500/20 hover:bg-pink-500/30 border border-pink-500/40 text-xs font-bold text-pink-300 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>ðŸ“± à¦…à§à¦¯à¦¾à¦ªà§‡ à¦«à¦¿à¦°à§à¦¨</span>
            </button>
          )}
          <a
            href="/api/download-project"
            download="fun-hub-full-source.zip"
            className="flex px-3 py-1.5 rounded-lg bg-pink-500/15 hover:bg-pink-500/25 border border-pink-500/30 text-xs font-semibold text-pink-300 items-center gap-1.5 transition-colors cursor-pointer"
            title="à¦¸à¦®à§à¦ªà§‚à¦°à§à¦£ à¦ªà§à¦°à§‹à¦œà§‡à¦•à§à¦Ÿ à¦•à§‹à¦¡ à¦¡à¦¾à¦‰à¦¨à¦²à§‹à¦¡ à¦•à¦°à§à¦¨"
          >
            <Download className="w-3.5 h-3.5" />
            <span>à¦¡à¦¾à¦‰à¦¨à¦²à§‹à¦¡ ZIP</span>
          </a>
          <button
            onClick={handleLogout}
            className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-xs font-medium text-red-400 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>à¦²à¦—à¦†à¦‰à¦Ÿ</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-3 mb-6 scrollbar-none">
        {sections.map(({ id, label, icon: Icon }) => {
          const isActive = activeSection === id;
          const isSec = id === "security";
          return (
            <button
              key={id}
              onClick={() => setActiveSection(id)}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all border flex items-center gap-2 cursor-pointer ${
                isActive
                  ? "bg-gradient-to-r from-pink-500 to-purple-600 text-white border-transparent shadow-md"
                  : "bg-[#1a1b26] text-[#8f93ad] border-[#33354a] hover:text-white"
              } ${isSec && isDefaultPassword ? "ring-2 ring-amber-500/60" : ""}`}
            >
              <Icon className={`w-4 h-4 ${isSec && isDefaultPassword ? "text-amber-400" : ""}`} />
              <span>{label}</span>
              {isSec && isDefaultPassword && (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              )}
            </button>
          );
        })}
      </div>

      {/* Content for Section */}
      <div className="space-y-6">
        {/* 6. SECURITY & PASSWORD MANAGEMENT (NEW HARDENED TAB) */}
        {activeSection === "security" && (
          <div className="space-y-5">
            {/* Password Change Form */}
            <div className="p-5 rounded-2xl bg-[#1a1b26] border border-[#33354a] space-y-4">
              <div className="flex items-center gap-2 border-b border-[#33354a] pb-3">
                <KeyRound className="w-5 h-5 text-pink-400" />
                <h3 className="text-sm font-bold text-white">
                  à¦…à§à¦¯à¦¾à¦¡à¦®à¦¿à¦¨ à¦ªà¦¾à¦¸à¦“à¦¯à¦¼à¦¾à¦°à§à¦¡ à¦ªà¦°à¦¿à¦¬à¦°à§à¦¤à¦¨ à¦•à¦°à§à¦¨
                </h3>
              </div>
              <p className="text-xs text-[#8f93ad]">
                à¦ªà¦¾à¦¸à¦“à¦¯à¦¼à¦¾à¦°à§à¦¡ à¦ªà¦°à¦¿à¦¬à¦°à§à¦¤à¦¨ à¦•à¦°à¦¾à¦° à¦¸à¦¾à¦¥à§‡ à¦¸à¦¾à¦¥à§‡ à¦…à¦¨à§à¦¯ à¦¸à¦•à¦² à¦¡à¦¿à¦­à¦¾à¦‡à¦¸à§‡ à¦šà¦¾à¦²à§ à¦¥à¦¾à¦•à¦¾ à¦¸à§‡à¦¶à¦¨à¦—à§à¦²à§‹ à¦¸à§à¦¬à¦¯à¦¼à¦‚à¦•à§à¦°à¦¿à¦¯à¦¼à¦­à¦¾à¦¬à§‡ à¦¬à¦¾à¦¤à¦¿à¦² à¦¹à¦¯à¦¼à§‡ à¦¯à¦¾à¦¬à§‡à¥¤
              </p>

              <form onSubmit={handleChangePassword} className="space-y-3.5 max-w-lg">
                <div>
                  <label className="text-xs text-[#8f93ad] block mb-1">
                    à¦¬à¦°à§à¦¤à¦®à¦¾à¦¨ à¦ªà¦¾à¦¸à¦“à¦¯à¦¼à¦¾à¦°à§à¦¡
                  </label>
                  <div className="relative">
                    <input
                      type={showPw ? "text" : "password"}
                      value={currentPw}
                      onChange={(e) => setCurrentPw(e.target.value)}
                      placeholder="à¦¬à¦°à§à¦¤à¦®à¦¾à¦¨ à¦ªà¦¾à¦¸à¦“à¦¯à¦¼à¦¾à¦°à§à¦¡ à¦²à¦¿à¦–à§à¦¨..."
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#0f1016] border border-[#33354a] text-sm text-white focus:border-pink-500 outline-none pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8f93ad] hover:text-white cursor-pointer"
                    >
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-[#8f93ad] block mb-1">
                    à¦¨à¦¤à§à¦¨ à¦¶à¦•à§à¦¤à¦¿à¦¶à¦¾à¦²à§€ à¦ªà¦¾à¦¸à¦“à¦¯à¦¼à¦¾à¦°à§à¦¡ (à¦•à¦®à¦ªà¦•à§à¦·à§‡ à§® à¦…à¦•à§à¦·à¦°)
                  </label>
                  <input
                    type={showPw ? "text" : "password"}
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    placeholder="à¦¨à¦¤à§à¦¨ à¦ªà¦¾à¦¸à¦“à¦¯à¦¼à¦¾à¦°à§à¦¡ à¦¦à¦¿à¦¨..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0f1016] border border-[#33354a] text-sm text-white focus:border-pink-500 outline-none"
                  />

                  {/* Password strength meter */}
                  {newPw && (
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-[#8f93ad]">à¦ªà¦¾à¦¸à¦“à¦¯à¦¼à¦¾à¦°à§à¦¡ à¦¶à¦•à§à¦¤à¦¿:</span>
                        <span className={pwStrength.color.split(" ")[0]}>
                          {pwStrength.label}
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-[#0f1016] rounded-full overflow-hidden flex gap-1">
                        <div
                          className={`h-full transition-all ${
                            pwStrength.score >= 1 ? pwStrength.color.split(" ")[1] : "bg-transparent"
                          } w-1/3`}
                        />
                        <div
                          className={`h-full transition-all ${
                            pwStrength.score >= 2 ? pwStrength.color.split(" ")[1] : "bg-transparent"
                          } w-1/3`}
                        />
                        <div
                          className={`h-full transition-all ${
                            pwStrength.score >= 3 ? pwStrength.color.split(" ")[1] : "bg-transparent"
                          } w-1/3`}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs text-[#8f93ad] block mb-1">
                    à¦¨à¦¤à§à¦¨ à¦ªà¦¾à¦¸à¦“à¦¯à¦¼à¦¾à¦°à§à¦¡ à¦¨à¦¿à¦¶à§à¦šà¦¿à¦¤à¦•à¦°à¦£
                  </label>
                  <input
                    type={showPw ? "text" : "password"}
                    value={confirmPw}
                    onChange={(e) => setConfirmPw(e.target.value)}
                    placeholder="à¦¨à¦¤à§à¦¨ à¦ªà¦¾à¦¸à¦“à¦¯à¦¼à¦¾à¦°à§à¦¡à¦Ÿà¦¿ à¦†à¦¬à¦¾à¦° à¦²à¦¿à¦–à§à¦¨..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0f1016] border border-[#33354a] text-sm text-white focus:border-pink-500 outline-none"
                  />
                </div>

                {pwMsg && (
                  <div
                    className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
                      pwMsg.type === "success"
                        ? "bg-green-500/10 text-green-300 border-green-500/30"
                        : "bg-red-500/10 text-red-300 border-red-500/30"
                    }`}
                  >
                    {pwMsg.type === "success" ? (
                      <Check className="w-4 h-4 shrink-0 text-green-400" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                    )}
                    <span>{pwMsg.text}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isChangingPw}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 text-white font-bold text-sm shadow hover:opacity-95 transition-opacity cursor-pointer disabled:opacity-50"
                >
                  {isChangingPw ? "à¦¸à¦‚à¦°à¦•à§à¦·à¦£ à¦¹à¦šà§à¦›à§‡..." : "ðŸ”’ à¦¨à¦¤à§à¦¨ à¦ªà¦¾à¦¸à¦“à¦¯à¦¼à¦¾à¦°à§à¦¡ à¦¸à¦‚à¦°à¦•à§à¦·à¦£ à¦•à¦°à§à¦¨"}
                </button>
              </form>
            </div>

            {/* Telegram User ID Lock (Device / Account whitelist) */}
            <div className="p-5 rounded-2xl bg-[#1a1b26] border border-[#33354a] space-y-4">
              <div className="flex items-center justify-between border-b border-[#33354a] pb-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-pink-400" />
                  <h3 className="text-sm font-bold text-white">
                    à¦Ÿà§‡à¦²à¦¿à¦—à§à¦°à¦¾à¦® à¦†à¦‡à¦¡à¦¿ à¦¸à§à¦°à¦•à§à¦·à¦¾ (Telegram ID Lock)
                  </h3>
                </div>
                {authStatus?.adminTelegramId ? (
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-green-500/15 text-green-400 border border-green-500/30 flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    <span>à¦²à¦• à¦¸à¦•à§à¦°à¦¿à¦¯à¦¼</span>
                  </span>
                ) : (
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    à¦²à¦• à¦¨à¦¿à¦·à§à¦•à§à¦°à¦¿à¦¯à¦¼ (à¦ªà¦¾à¦¸à¦“à¦¯à¦¼à¦¾à¦°à§à¦¡ à¦¦à¦¿à§Ÿà§‡ à¦¯à§‡ à¦•à§‡à¦‰)
                  </span>
                )}
              </div>

              <p className="text-xs text-[#8f93ad] leading-relaxed">
                à¦†à¦ªà¦¨à¦¾à¦° à¦¬à§à¦¯à¦•à§à¦¤à¦¿à¦—à¦¤ à¦Ÿà§‡à¦²à¦¿à¦—à§à¦°à¦¾à¦® à¦‡à¦‰à¦œà¦¾à¦° à¦†à¦‡à¦¡à¦¿ à¦¦à¦¿à§Ÿà§‡ à¦…à§à¦¯à¦¾à¦¡à¦®à¦¿à¦¨ à¦²à¦• à¦•à¦°à§‡ à¦¦à¦¿à¦²à§‡, à¦…à¦¨à§à¦¯ à¦•à§‡à¦‰ à¦ªà¦¾à¦¸à¦“à§Ÿà¦¾à¦°à§à¦¡ à¦œà¦¾à¦¨à¦²à§‡à¦“ 
                à¦²à¦—à¦‡à¦¨ à¦•à¦°à¦¤à§‡ à¦ªà¦¾à¦°à¦¬à§‡ à¦¨à¦¾à¥¤ à¦¶à§à¦§à§à¦®à¦¾à¦¤à§à¦° à¦†à¦ªà¦¨à¦¾à¦° à¦¨à¦¿à¦°à§à¦¦à¦¿à¦·à§à¦Ÿ à¦Ÿà§‡à¦²à¦¿à¦—à§à¦°à¦¾à¦® à¦…à§à¦¯à¦¾à¦•à¦¾à¦‰à¦¨à§à¦Ÿ à¦¦à¦¿à§Ÿà§‡à¦‡ à¦à¦‡ à¦…à§à¦¯à¦¾à¦¡à¦®à¦¿à¦¨ à¦ªà§à¦¯à¦¾à¦¨à§‡à¦²à§‡ à¦ªà§à¦°à¦¬à§‡à¦¶ à¦¸à¦®à§à¦­à¦¬à¥¤
              </p>

              {/* Detected Telegram user */}
              {currentTgUser && (
                <div className="p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-xs text-purple-300 font-semibold block">
                      à¦¶à¦¨à¦¾à¦•à§à¦¤à¦•à§ƒà¦¤ à¦¬à¦°à§à¦¤à¦®à¦¾à¦¨ à¦Ÿà§‡à¦²à¦¿à¦—à§à¦°à¦¾à¦® à¦…à§à¦¯à¦¾à¦•à¦¾à¦‰à¦¨à§à¦Ÿ:
                    </span>
                    <span className="text-sm font-bold text-white">
                      {currentTgUser.first_name} {currentTgUser.last_name || ""}{" "}
                      <span className="text-pink-400 font-mono text-xs">
                        (ID: {currentTgUser.id})
                      </span>
                    </span>
                  </div>

                  {String(authStatus?.adminTelegramId) !== String(currentTgUser.id) ? (
                    <button
                      type="button"
                      disabled={isSavingTelegramId}
                      onClick={() => handleSetTelegramId(String(currentTgUser.id))}
                      className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 hover:opacity-95 text-white font-bold text-xs shrink-0 cursor-pointer shadow disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>ðŸ”’ à¦à¦‡ à¦†à¦‡à¦¡à¦¿à¦¤à§‡ à¦²à¦• à¦•à¦°à§à¦¨</span>
                    </button>
                  ) : (
                    <span className="px-3 py-1.5 rounded-lg bg-green-500/20 text-green-300 text-xs font-bold border border-green-500/40">
                      âœ… à¦†à¦ªà¦¨à¦¾à¦° à¦†à¦‡à¦¡à¦¿ à¦¬à¦°à§à¦¤à¦®à¦¾à¦¨à§‡ à¦²à¦• à¦•à¦°à¦¾ à¦†à¦›à§‡
                    </span>
                  )}
                </div>
              )}

              {/* Manual Input and Configured ID Display */}
              <div className="space-y-2 max-w-lg">
                <label className="text-xs text-[#8f93ad] block">
                  à¦¨à¦¿à¦°à§à¦§à¦¾à¦°à¦¿à¦¤ à¦…à§à¦¯à¦¾à¦¡à¦®à¦¿à¦¨ à¦Ÿà§‡à¦²à¦¿à¦—à§à¦°à¦¾à¦® à¦†à¦‡à¦¡à¦¿ (White-listed Telegram ID):
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={telegramIdInput}
                    onChange={(e) => setTelegramIdInput(e.target.value)}
                    placeholder={
                      authStatus?.adminTelegramId
                        ? String(authStatus.adminTelegramId)
                        : "à¦¯à§‡à¦®à¦¨: 123456789"
                    }
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#0f1016] border border-[#33354a] text-sm text-white focus:border-pink-500 outline-none font-mono"
                  />
                  <button
                    type="button"
                    disabled={isSavingTelegramId}
                    onClick={() => handleSetTelegramId(telegramIdInput)}
                    className="px-4 py-2.5 rounded-xl bg-[#2b2d42] hover:bg-[#383a54] border border-[#44476a] text-xs font-bold text-white transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                  >
                    {isSavingTelegramId ? "..." : "à¦¸à§‡à¦­"}
                  </button>
                  {authStatus?.adminTelegramId && (
                    <button
                      type="button"
                      disabled={isSavingTelegramId}
                      onClick={() => {
                        setTelegramIdInput("");
                        handleSetTelegramId("");
                      }}
                      className="px-3 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-xs font-bold text-red-400 transition-colors cursor-pointer shrink-0"
                      title="à¦²à¦• à¦°à¦¿à¦®à§à¦­ à¦•à¦°à§à¦¨"
                    >
                      à¦²à¦• à¦¤à§à¦²à§à¦¨
                    </button>
                  )}
                </div>
              </div>

              {telegramMsg && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
                    telegramMsg.type === "success"
                      ? "bg-green-500/10 text-green-300 border-green-500/30"
                      : "bg-red-500/10 text-red-300 border-red-500/30"
                  }`}
                >
                  {telegramMsg.type === "success" ? (
                    <Check className="w-4 h-4 shrink-0 text-green-400" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                  )}
                  <span>{telegramMsg.text}</span>
                </div>
              )}
            </div>

            {/* Session Management */}
            <div className="p-5 rounded-2xl bg-[#1a1b26] border border-[#33354a] space-y-3">
              <h3 className="text-sm font-bold text-white border-b border-[#33354a] pb-2">
                à¦¸à§‡à¦¶à¦¨ à¦“ à¦¡à¦¿à¦­à¦¾à¦‡à¦¸ à¦•à¦¨à§à¦Ÿà§à¦°à§‹à¦²
              </h3>
              <p className="text-xs text-[#8f93ad] leading-relaxed">
                à¦¯à¦¦à¦¿ à¦†à¦ªà¦¨à¦¾à¦° à¦®à¦¨à§‡ à¦¹à¦¯à¦¼ à¦…à¦¨à§à¦¯ à¦•à§‹à¦¨à§‹ à¦¬à§à¦°à¦¾à¦‰à¦œà¦¾à¦° à¦¬à¦¾ à¦¡à¦¿à¦­à¦¾à¦‡à¦¸à§‡ à¦…à§à¦¯à¦¾à¦¡à¦®à¦¿à¦¨ à¦…à§à¦¯à¦¾à¦•à¦¾à¦‰à¦¨à§à¦Ÿ à¦“à¦ªà§‡à¦¨ à¦°à¦¾à¦–à¦¾ à¦†à¦›à§‡, à¦¤à¦¬à§‡ à¦¨à¦¿à¦šà§‡à¦° à¦¬à¦¾à¦Ÿà¦¨ à¦šà§‡à¦ªà§‡ à¦à¦• à¦•à§à¦²à¦¿à¦•à§‡ à¦…à¦¨à§à¦¯ à¦¸à¦¬ à¦¸à§‡à¦¶à¦¨ à¦¬à¦¾à¦¤à¦¿à¦² à¦•à¦°à¦¤à§‡ à¦ªà¦¾à¦°à¦¬à§‡à¦¨à¥¤
              </p>

              <button
                onClick={handleRevokeAllSessions}
                className="px-4 py-2 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 hover:bg-red-500/25 text-xs font-bold transition-colors cursor-pointer"
              >
                ðŸšª à¦…à¦¨à§à¦¯ à¦¸à¦•à¦² à¦¡à¦¿à¦­à¦¾à¦‡à¦¸ à¦¥à§‡à¦•à§‡ à¦²à¦—à¦†à¦‰à¦Ÿ à¦•à¦°à§à¦¨ (Revoke All Sessions)
              </button>
            </div>

            {/* Project Backup & Full Source Code Download */}
            <div className="p-5 rounded-2xl bg-gradient-to-br from-[#1a1b26] to-[#20152e] border border-pink-500/30 space-y-4 shadow-xl">
              <div className="flex items-center gap-2 border-b border-[#33354a] pb-3">
                <Download className="w-5 h-5 text-pink-400" />
                <div>
                  <h3 className="text-sm font-bold text-white">
                    ðŸ“¦ à¦¸à¦®à§à¦ªà§‚à¦°à§à¦£ à¦ªà§à¦°à§‹à¦œà§‡à¦•à§à¦Ÿ à¦¡à¦¾à¦‰à¦¨à¦²à§‹à¦¡ à¦“ à¦¬à§à¦¯à¦¾à¦•à¦†à¦ª (Backup & Source Code)
                  </h3>
                  <p className="text-xs text-[#8f93ad]">
                    à¦†à¦ªà¦¨à¦¾à¦° à¦…à§à¦¯à¦¾à¦ªà§‡à¦° à¦¸à¦®à§à¦ªà§‚à¦°à§à¦£ à¦•à§‹à¦¡à¦¬à§‡à¦¸ à¦à¦¬à¦‚ à¦•à¦¨à¦«à¦¿à¦—à¦¾à¦°à§‡à¦¶à¦¨ à¦•à¦®à§à¦ªà¦¿à¦‰à¦Ÿà¦¾à¦°à§‡ à¦¸à¦‚à¦°à¦•à§à¦·à¦£ à¦•à¦°à§à¦¨
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <a
                  href="/api/download-project"
                  download="fun-hub-full-source.zip"
                  className="p-4 rounded-xl bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white flex flex-col gap-1.5 transition-all shadow-md group cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm flex items-center gap-2">
                      <Download className="w-4 h-4 group-hover:translate-y-0.5 transition-transform" />
                      à¦¸à¦®à§à¦ªà§‚à¦°à§à¦£ à¦¸à§‹à¦°à§à¦¸ à¦•à§‹à¦¡ (ZIP)
                    </span>
                    <span className="text-[10px] bg-black/30 px-2 py-0.5 rounded-full font-mono">
                      ~1 MB
                    </span>
                  </div>
                  <span className="text-xs text-pink-100/80 leading-snug">
                    React + Vite + Express + Tailwind + à¦¸à¦®à§à¦ªà§‚à¦°à§à¦£ à¦Ÿà¦¾à¦‡à¦ªà¦¸à§à¦•à§à¦°à¦¿à¦ªà§à¦Ÿ à¦¸à§‹à¦°à§à¦¸ à¦•à§‹à¦¡
                  </span>
                </a>

                <a
                  href="/api/download-zip"
                  download="fun-hub-standalone.zip"
                  className="p-4 rounded-xl bg-[#262838] hover:bg-[#32354a] border border-[#3b3e58] text-white flex flex-col gap-1.5 transition-all shadow-md group cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm flex items-center gap-2">
                      <Download className="w-4 h-4 group-hover:translate-y-0.5 transition-transform" />
                      à¦¸à§à¦Ÿà§à¦¯à¦¾à¦¨à§à¦¡à¦…à§à¦¯à¦¾à¦²à¦¨ à¦¸à¦¾à¦°à§à¦­à¦¾à¦° (ZIP)
                    </span>
                    <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded-full font-mono">
                      Zero-dep
                    </span>
                  </div>
                  <span className="text-xs text-[#a5a9c5] leading-snug">
                    à¦•à§‹à¦¨à§‹ à¦à¦•à§à¦¸à¦Ÿà¦¾à¦°à§à¦¨à¦¾à¦² à¦ªà§à¦¯à¦¾à¦•à§‡à¦œ à¦›à¦¾à§œà¦¾à¦‡ à¦¯à§‡à¦•à§‹à¦¨à§‹ à¦¸à¦¾à¦°à§à¦­à¦¾à¦°à§‡ à¦¶à§à¦§à§ node server.js à¦¦à¦¿à§Ÿà§‡ à¦šà¦²à¦¬à§‡
                  </span>
                </a>
              </div>

              <div className="p-3 rounded-xl bg-black/30 border border-white/5 text-[11px] text-[#8f93ad] space-y-1">
                <strong className="text-white block font-semibold">ðŸ’¡ à¦•à¦®à§à¦ªà¦¿à¦‰à¦Ÿà¦¾à¦°à§‡ à¦°à¦¾à¦¨ à¦•à¦°à¦¾à¦° à¦¨à¦¿à§Ÿà¦®:</strong>
                <div>à§§. à¦œà¦¿à¦ª à¦«à¦¾à¦‡à¦²à¦Ÿà¦¿ à¦†à¦¨à¦œà¦¿à¦ª à¦•à¦°à§à¦¨</div>
                <div>à§¨. à¦Ÿà¦¾à¦°à§à¦®à¦¿à¦¨à¦¾à¦²à§‡ <code className="text-pink-400 bg-pink-500/10 px-1 rounded">npm install</code> à¦°à¦¾à¦¨ à¦•à¦°à§à¦¨</div>
                <div>à§©. à¦à¦°à¦ªà¦° <code className="text-pink-400 bg-pink-500/10 px-1 rounded">npm run dev</code> à¦°à¦¾à¦¨ à¦•à¦°à¦²à§‡à¦‡ à¦²à§‹à¦•à¦¾à¦²à¦¹à§‹à¦¸à§à¦Ÿà§‡ à¦šà¦¾à¦²à§ à¦¹à¦¬à§‡!</div>
              </div>
            </div>

            {/* Security Audit Checklist */}
            <div className="p-5 rounded-2xl bg-[#1a1b26] border border-[#33354a] space-y-3">
              <h3 className="text-sm font-bold text-white border-b border-[#33354a] pb-2">
                ðŸ›¡ï¸ à¦¸à¦•à§à¦°à¦¿à¦¯à¦¼ à¦¨à¦¿à¦°à¦¾à¦ªà¦¤à§à¦¤à¦¾ à¦¸à§à¦°à¦•à§à¦·à¦¾ à¦¬à§à¦¯à¦¬à¦¸à§à¦¥à¦¾
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-[#0f1016] border border-[#33354a] flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white block">PBKDF2 à¦•à§à¦°à¦¿à¦ªà§à¦Ÿà§‹à¦—à§à¦°à¦¾à¦«à¦¿à¦• à¦¹à§à¦¯à¦¾à¦¶à¦¿à¦‚</strong>
                    <span className="text-[#8f93ad]">
                      à§§,à§¦à§¦,à§¦à§¦à§¦ à¦°à¦¾à¦‰à¦¨à§à¦¡ à¦¸à¦¹ à¦°à§à¦¯à¦¾à¦¨à§à¦¡à¦® à§©à§¨-à¦¬à¦¾à¦‡à¦Ÿ à¦¸à¦²à§à¦Ÿ (SHA-512)
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#0f1016] border border-[#33354a] flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white block">à¦¬à§à¦°à§à¦Ÿ-à¦«à§‹à¦°à§à¦¸ à¦…à§à¦¯à¦¾à¦¨à§à¦Ÿà¦¿-à¦¹à§à¦¯à¦¾à¦• à¦²à¦•à¦†à¦‰à¦Ÿ</strong>
                    <span className="text-[#8f93ad]">
                      à§« à¦¬à¦¾à¦° à¦­à§à¦² à¦¹à¦²à§‡ à§© à¦®à¦¿à¦¨à¦¿à¦Ÿ à¦à¦¬à¦‚ à§§à§¦ à¦¬à¦¾à¦°à§‡ à§§ à¦˜à¦£à§à¦Ÿà¦¾ à¦†à¦‡à¦ªà¦¿ à¦²à¦•
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#0f1016] border border-[#33354a] flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white block">à¦®à§à¦¯à¦¾à¦œà¦¿à¦• à¦¬à¦¾à¦‡à¦Ÿ à¦¸à¦¿à¦—à¦¨à§‡à¦šà¦¾à¦° à¦¯à¦¾à¦šà¦¾à¦‡</strong>
                    <span className="text-[#8f93ad]">
                      à¦†à¦ªà¦²à§‹à¦¡à¦•à§ƒà¦¤ à¦ªà§à¦°à¦¤à¦¿à¦Ÿà¦¿ à¦«à¦¾à¦‡à¦²à§‡à¦° à¦…à¦­à§à¦¯à¦¨à§à¦¤à¦°à§€à¦£ à¦¬à¦¾à¦«à¦¾à¦° à¦¸à¦¿à¦—à¦¨à§‡à¦šà¦¾à¦° à¦­à§à¦¯à¦¾à¦²à¦¿à¦¡à§‡à¦¶à¦¨
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#0f1016] border border-[#33354a] flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white block">à¦•à¦¨à¦Ÿà§‡à¦¨à§à¦Ÿ à¦¸à¦¿à¦•à¦¿à¦‰à¦°à¦¿à¦Ÿà¦¿ à¦ªà¦²à¦¿à¦¸à¦¿ (CSP)</strong>
                    <span className="text-[#8f93ad]">
                      à¦†à¦ªà¦²à§‹à¦¡ à¦«à§‹à¦²à§à¦¡à¦¾à¦°à§‡ à¦¸à§à¦•à§à¦°à¦¿à¦ªà§à¦Ÿ à¦à¦•à§à¦¸à¦¿à¦•à¦¿à¦‰à¦¶à¦¨ à¦¸à¦®à§à¦ªà§‚à¦°à§à¦£ à¦¬à§à¦²à¦• (Sandbox)
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 1. GENERAL & THEME */}
        {activeSection === "general" && (
          <div className="space-y-5">
            <div className="p-5 rounded-2xl bg-[#1a1b26] border border-[#33354a] space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-[#33354a] pb-2">
                <span>à¦…à§à¦¯à¦¾à¦ª à¦†à¦‡à¦¡à§‡à¦¨à§à¦Ÿà¦¿à¦Ÿà¦¿</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-[#8f93ad] block mb-1">
                    à¦…à§à¦¯à¦¾à¦ªà§‡à¦° à¦¨à¦¾à¦®
                  </label>
                  <input
                    type="text"
                    value={cfg.appName}
                    onChange={(e) => updateConfigValue("appName", e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0f1016] border border-[#33354a] text-sm text-white focus:border-pink-500 outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs text-[#8f93ad] block mb-1">
                    à¦²à§‹à¦—à§‹ à¦¬à¦¾ à¦‡à¦®à§‹à¦œà¦¿
                  </label>
                  <input
                    type="text"
                    value={cfg.logo}
                    onChange={(e) => updateConfigValue("logo", e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0f1016] border border-[#33354a] text-sm text-white focus:border-pink-500 outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs text-[#8f93ad] block mb-1">
                    à¦¡à¦¾à¦¨à¦¦à¦¿à¦•à§‡à¦° à¦¬à§à¦¯à¦¾à¦œ à¦²à§‡à¦¬à§‡à¦² (à¦–à¦¾à¦²à¦¿ à¦°à¦¾à¦–à¦²à§‡ à¦²à§à¦•à¦¾à¦¬à§‡)
                  </label>
                  <input
                    type="text"
                    value={cfg.premiumLabel}
                    onChange={(e) => updateConfigValue("premiumLabel", e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0f1016] border border-[#33354a] text-sm text-white focus:border-pink-500 outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs text-[#8f93ad] block mb-1">
                    à¦¸à¦¾à¦°à§à¦š à¦¬à¦•à§à¦¸à§‡à¦° à¦ªà§à¦²à§‡à¦¸à¦¹à§‹à¦²à§à¦¡à¦¾à¦°
                  </label>
                  <input
                    type="text"
                    value={cfg.searchPlaceholder}
                    onChange={(e) => updateConfigValue("searchPlaceholder", e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0f1016] border border-[#33354a] text-sm text-white focus:border-pink-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-[#8f93ad] block mb-1">
                  à¦¸à§à¦¬à¦¾à¦—à¦¤ à¦¬à§à¦¯à¦¾à¦¨à¦¾à¦° à¦¬à¦¾à¦°à§à¦¤à¦¾ (à¦–à¦¾à¦²à¦¿ à¦°à¦¾à¦–à¦²à§‡ à¦²à§à¦•à¦¾à¦¬à§‡)
                </label>
                <input
                  type="text"
                  value={cfg.notice}
                  onChange={(e) => updateConfigValue("notice", e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0f1016] border border-[#33354a] text-sm text-white focus:border-pink-500 outline-none"
                />
              </div>

              <div>
                <label className="text-xs text-[#8f93ad] block mb-1">
                  à¦­à¦¿à¦¡à¦¿à¦“ à¦¨à¦¾ à¦ªà§‡à¦²à§‡ à¦¯à§‡ à¦²à§‡à¦–à¦¾ à¦¦à§‡à¦–à¦¾à¦¬à§‡
                </label>
                <input
                  type="text"
                  value={cfg.emptyText}
                  onChange={(e) => updateConfigValue("emptyText", e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0f1016] border border-[#33354a] text-sm text-white focus:border-pink-500 outline-none"
                />
              </div>
            </div>

            {/* Color Palette */}
            <div className="p-5 rounded-2xl bg-[#1a1b26] border border-[#33354a] space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center justify-between border-b border-[#33354a] pb-2">
                <span>à¦°à¦™à§‡à¦° à¦¥à¦¿à¦® (Color Palette)</span>
                <span className="text-xs text-[#8f93ad] font-normal">
                  à¦®à¦¿à¦¨à¦¿ à¦…à§à¦¯à¦¾à¦ªà§‡à¦° à¦¸à¦¾à¦¥à§‡ à¦°à¦¿à¦¯à¦¼à§‡à¦²-à¦Ÿà¦¾à¦‡à¦®à§‡ à¦¸à¦¿à¦™à§à¦• à¦¹à¦¯à¦¼
                </span>
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                {[
                  { key: "bg", label: "à¦¬à§à¦¯à¦¾à¦•à¦—à§à¦°à¦¾à¦‰à¦¨à§à¦¡" },
                  { key: "card", label: "à¦•à¦¾à¦°à§à¦¡ à¦“ à¦¹à§‡à¦¡à¦¾à¦°" },
                  { key: "line", label: "à¦¬à¦°à§à¦¡à¦¾à¦° à¦²à¦¾à¦‡à¦¨" },
                  { key: "text", label: "à¦®à§‚à¦² à¦²à§‡à¦–à¦¾" },
                  { key: "mute", label: "à¦¹à¦¾à¦²à¦•à¦¾ à¦Ÿà§‡à¦•à§à¦¸à¦Ÿ" },
                  { key: "accent1", label: "à¦…à§à¦¯à¦¾à¦•à¦¸à§‡à¦¨à§à¦Ÿ à§§ (à¦—à§‹à¦²à¦¾à¦ªà§€)" },
                  { key: "accent2", label: "à¦…à§à¦¯à¦¾à¦•à¦¸à§‡à¦¨à§à¦Ÿ à§¨ (à¦¬à§‡à¦—à§à¦¨à§€)" },
                  { key: "gold", label: "à¦²à¦• à¦“ à¦—à§‹à¦²à§à¦¡" },
                ].map(({ key, label }) => {
                  const val = (cfg.theme as any)[key] || "#000000";
                  return (
                    <div
                      key={key}
                      className="p-3 rounded-xl bg-[#0f1016] border border-[#33354a] flex flex-col gap-1.5"
                    >
                      <span className="text-[11px] text-[#8f93ad] font-medium">
                        {label}
                      </span>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={val}
                          onChange={(e) => updateConfigValue(`theme.${key}`, e.target.value)}
                          className="w-8 h-8 rounded-lg cursor-pointer border border-[#33354a] bg-transparent"
                        />
                        <input
                          type="text"
                          value={val}
                          onChange={(e) => updateConfigValue(`theme.${key}`, e.target.value)}
                          className="w-full text-xs font-mono uppercase bg-transparent text-white border-0 outline-none"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* 2. MENU TABS */}
        {activeSection === "menu" && (
          <div className="space-y-4">
            <p className="text-xs text-[#8f93ad]">
              à¦Ÿà§‡à¦²à¦¿à¦—à§à¦°à¦¾à¦® à¦®à¦¿à¦¨à¦¿ à¦…à§à¦¯à¦¾à¦ªà§‡à¦° à¦¨à¦¿à¦šà§‡à¦° à¦®à§‡à¦¨à§ à¦¬à¦¾à¦° à¦•à¦¾à¦¸à§à¦Ÿà¦®à¦¾à¦‡à¦œ à¦•à¦°à§à¦¨à¥¤ à¦ªà§à¦°à¦¤à¦¿à¦Ÿà¦¿ à¦Ÿà§à¦¯à¦¾à¦¬à§‡à¦° à¦†à¦‡à¦•à¦¨ à¦“ à¦•à¦¨à¦Ÿà§‡à¦¨à§à¦Ÿ à¦¸à¦¾à¦œà¦¾à¦¨à¥¤
            </p>

            {(cfg.tabs || []).map((tab, idx) => (
              <div
                key={idx}
                className="p-5 rounded-2xl bg-[#1a1b26] border border-[#33354a] space-y-4"
              >
                <div className="flex items-center justify-between border-b border-[#33354a] pb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-pink-500/20 text-pink-400 text-xs flex items-center justify-center font-bold">
                      {idx + 1}
                    </span>
                    <span className="text-sm font-bold text-white">
                      {tab.label} ({tab.icon})
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => moveItem("tabs", idx, -1)}
                      disabled={idx === 0}
                      className="p-1.5 rounded-lg bg-[#262838] border border-[#33354a] hover:bg-white/10 disabled:opacity-30 cursor-pointer"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => moveItem("tabs", idx, 1)}
                      disabled={idx === cfg.tabs.length - 1}
                      className="p-1.5 rounded-lg bg-[#262838] border border-[#33354a] hover:bg-white/10 disabled:opacity-30 cursor-pointer"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => deleteItem("tabs", idx)}
                      className="p-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 cursor-pointer ml-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-[#8f93ad] block mb-1">
                      à¦®à§‡à¦¨à§à¦° à¦¨à¦¾à¦®
                    </label>
                    <input
                      type="text"
                      value={tab.label}
                      onChange={(e) => updateConfigValue(`tabs.${idx}.label`, e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#0f1016] border border-[#33354a] text-sm text-white outline-none focus:border-pink-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-[#8f93ad] block mb-1">
                      à¦†à¦‡à¦•à¦¨ (à¦‡à¦®à§‹à¦œà¦¿)
                    </label>
                    <input
                      type="text"
                      value={tab.icon}
                      onChange={(e) => updateConfigValue(`tabs.${idx}.icon`, e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#0f1016] border border-[#33354a] text-sm text-white outline-none focus:border-pink-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-[#8f93ad] block mb-1">
                      à¦®à§‡à¦¨à§à¦° à¦§à¦°à¦¨
                    </label>
                    <select
                      value={tab.type}
                      onChange={(e) => updateConfigValue(`tabs.${idx}.type`, e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#0f1016] border border-[#33354a] text-sm text-white outline-none focus:border-pink-500 cursor-pointer"
                    >
                      <option value="videos">à¦­à¦¿à¦¡à¦¿à¦“ à¦«à¦¿à¦¡ (Videos)</option>
                      <option value="links">à¦²à¦¿à¦‚à¦• à¦¤à¦¾à¦²à¦¿à¦•à¦¾ (Telegram Links)</option>
                      <option value="page">à¦²à§‡à¦–à¦¾à¦° à¦ªà§‡à¦œ (Rich Text Page)</option>
                    </select>
                  </div>
                </div>

                {tab.type === "links" && (
                  <div className="space-y-3 pt-2">
                    <div>
                      <label className="text-xs text-[#8f93ad] block mb-1">
                        à¦ªà§‡à¦œà§‡à¦° à¦¶à¦¿à¦°à§‹à¦¨à¦¾à¦®
                      </label>
                      <input
                        type="text"
                        value={tab.title || ""}
                        onChange={(e) => updateConfigValue(`tabs.${idx}.title`, e.target.value)}
                        placeholder="à¦¯à§‡à¦®à¦¨: à¦Ÿà§‡à¦²à¦¿à¦—à§à¦°à¦¾à¦® à¦•à¦®à¦¿à¦‰à¦¨à¦¿à¦Ÿà¦¿ à¦¸à¦®à§‚à¦¹"
                        className="w-full px-3 py-2 rounded-xl bg-[#0f1016] border border-[#33354a] text-sm text-white outline-none focus:border-pink-500"
                      />
                    </div>

                    <div className="space-y-2">
                      <span className="text-xs font-semibold text-[#8f93ad] block">
                        à¦²à¦¿à¦‚à¦• à¦†à¦‡à¦Ÿà§‡à¦® à¦¸à¦®à§‚à¦¹:
                      </span>
                      {(tab.items || []).map((it, itemIdx) => (
                        <div
                          key={itemIdx}
                          className="p-3 rounded-xl bg-[#0f1016] border-l-2 border-l-pink-500 border border-[#33354a] space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-[#8f93ad]">
                              à¦²à¦¿à¦‚à¦• #{itemIdx + 1}
                            </span>
                            <button
                              onClick={() => {
                                markDirty();
                                setCfg((c) => {
                                  const copy = JSON.parse(JSON.stringify(c));
                                  copy.tabs[idx].items.splice(itemIdx, 1);
                                  return copy;
                                });
                              }}
                              className="text-red-400 text-xs hover:underline cursor-pointer"
                            >
                              à¦®à§à¦›à§à¦¨
                            </button>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <input
                              type="text"
                              value={it.title}
                              placeholder="à¦¶à¦¿à¦°à§‹à¦¨à¦¾à¦®"
                              onChange={(e) =>
                                updateConfigValue(`tabs.${idx}.items.${itemIdx}.title`, e.target.value)
                              }
                              className="px-2.5 py-1.5 rounded-lg bg-[#1a1b26] border border-[#33354a] text-xs text-white"
                            />
                            <input
                              type="text"
                              value={it.url}
                              placeholder="URL (https://t.me/...)"
                              onChange={(e) =>
                                updateConfigValue(`tabs.${idx}.items.${itemIdx}.url`, e.target.value)
                              }
                              className="px-2.5 py-1.5 rounded-lg bg-[#1a1b26] border border-[#33354a] text-xs text-white"
                            />
                            <input
                              type="text"
                              value={it.button}
                              placeholder="à¦¬à¦¾à¦Ÿà¦¨ à¦Ÿà§‡à¦•à§à¦¸à¦Ÿ (à¦¯à§‡à¦®à¦¨: à¦œà¦¯à¦¼à§‡à¦¨)"
                              onChange={(e) =>
                                updateConfigValue(`tabs.${idx}.items.${itemIdx}.button`, e.target.value)
                              }
                              className="px-2.5 py-1.5 rounded-lg bg-[#1a1b26] border border-[#33354a] text-xs text-white"
                            />
                          </div>
                        </div>
                      ))}

                      <button
                        onClick={() => {
                          markDirty();
                          setCfg((c) => {
                            const copy = JSON.parse(JSON.stringify(c));
                            if (!copy.tabs[idx].items) copy.tabs[idx].items = [];
                            copy.tabs[idx].items.push({
                              title: "à¦¨à¦¤à§à¦¨ à¦Ÿà§‡à¦²à¦¿à¦—à§à¦°à¦¾à¦® à¦—à§à¦°à§à¦ª",
                              url: "https://t.me/",
                              button: "à¦œà¦¯à¦¼à§‡à¦¨",
                            });
                            return copy;
                          });
                        }}
                        className="w-full py-2 rounded-xl border border-dashed border-pink-500/50 text-pink-400 text-xs font-medium hover:bg-pink-500/10 cursor-pointer flex items-center justify-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>+ à¦¨à¦¤à§à¦¨ à¦²à¦¿à¦‚à¦• à¦¯à§‹à¦— à¦•à¦°à§à¦¨</span>
                      </button>
                    </div>
                  </div>
                )}

                {tab.type === "page" && (
                  <div className="space-y-3 pt-2">
                    <div>
                      <label className="text-xs text-[#8f93ad] block mb-1">
                        à¦ªà§‡à¦œà§‡à¦° à¦¶à¦¿à¦°à§‹à¦¨à¦¾à¦®
                      </label>
                      <input
                        type="text"
                        value={tab.title || ""}
                        onChange={(e) => updateConfigValue(`tabs.${idx}.title`, e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-[#0f1016] border border-[#33354a] text-sm text-white outline-none focus:border-pink-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[#8f93ad] block mb-1">
                        à¦ªà§‡à¦œà§‡à¦° à¦¬à¦¿à¦¸à§à¦¤à¦¾à¦°à¦¿à¦¤ à¦²à§‡à¦–à¦¾
                      </label>
                      <textarea
                        rows={4}
                        value={tab.text || ""}
                        onChange={(e) => updateConfigValue(`tabs.${idx}.text`, e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-[#0f1016] border border-[#33354a] text-sm text-white outline-none focus:border-pink-500 resize-y"
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}

            <button
              onClick={() => {
                markDirty();
                setCfg((c) => {
                  const copy = JSON.parse(JSON.stringify(c));
                  copy.tabs.push({
                    label: "à¦¨à¦¤à§à¦¨ à¦®à§‡à¦¨à§",
                    icon: "â­",
                    type: "page",
                    title: "à¦¨à¦¤à§à¦¨ à¦ªà§‡à¦œ",
                    text: "à¦à¦–à¦¾à¦¨à§‡ à¦†à¦ªà¦¨à¦¾à¦° à¦¬à¦¿à¦¬à¦°à¦£ à¦²à¦¿à¦–à§à¦¨à¥¤",
                  });
                  return copy;
                });
              }}
              className="w-full py-3 rounded-2xl border border-dashed border-pink-500 text-pink-400 text-sm font-semibold hover:bg-pink-500/10 transition-colors cursor-pointer flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>+ à¦¨à¦¤à§à¦¨ à¦®à§‡à¦¨à§ à¦Ÿà§à¦¯à¦¾à¦¬ à¦¤à§ˆà¦°à¦¿ à¦•à¦°à§à¦¨</span>
            </button>
          </div>
        )}

        {/* 3. CATEGORIES */}
        {activeSection === "cats" && (
          <div className="p-5 rounded-2xl bg-[#1a1b26] border border-[#33354a] space-y-4">
            <h3 className="text-sm font-bold text-white border-b border-[#33354a] pb-2">
              à¦•à§à¦¯à¦¾à¦Ÿà¦¾à¦—à¦°à¦¿ à¦®à§à¦¯à¦¾à¦¨à§‡à¦œà¦®à§‡à¦¨à§à¦Ÿ
            </h3>
            <p className="text-xs text-[#8f93ad]">
              à¦ªà§à¦°à¦¥à¦® à¦•à§à¦¯à¦¾à¦Ÿà¦¾à¦—à¦°à¦¿à¦Ÿà¦¿ à¦¸à¦¬ à¦¸à¦®à¦¯à¦¼ "à¦¸à¦¬à¦—à§à¦²à§‹" (Default All)à¥¤ à¦•à§‹à¦¨à§‹ à¦•à§à¦¯à¦¾à¦Ÿà¦¾à¦—à¦°à¦¿ à¦°à¦¿à¦¨à§‡à¦® à¦•à¦°à¦²à§‡ à¦¬à¦¿à¦¦à§à¦¯à¦®à¦¾à¦¨ à¦¸à¦¬ à¦­à¦¿à¦¡à¦¿à¦“ à¦¸à§à¦¬à¦¯à¦¼à¦‚à¦•à§à¦°à¦¿à¦¯à¦¼à¦­à¦¾à¦¬à§‡ à¦†à¦ªà¦¡à§‡à¦Ÿ à¦¹à¦¬à§‡à¥¤
            </p>

            <div className="space-y-2.5">
              {(cfg.categories || []).map((cat, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 p-2 rounded-xl bg-[#0f1016] border border-[#33354a]"
                >
                  <span className="w-6 text-center text-xs text-[#8f93ad] font-mono">
                    {idx === 0 ? "â˜…" : idx}
                  </span>
                  <input
                    type="text"
                    value={cat}
                    onChange={(e) => handleRenameCategory(idx, e.target.value)}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-[#1a1b26] border border-transparent focus:border-pink-500 text-sm text-white outline-none"
                  />

                  {idx > 0 ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => moveItem("categories", idx, -1)}
                        disabled={idx === 1}
                        className="p-1.5 rounded-lg bg-[#262838] border border-[#33354a] hover:bg-white/10 disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => moveItem("categories", idx, 1)}
                        disabled={idx === cfg.categories.length - 1}
                        className="p-1.5 rounded-lg bg-[#262838] border border-[#33354a] hover:bg-white/10 disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => deleteItem("categories", idx)}
                        className="p-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-[#8f93ad] px-2">(à¦ªà§à¦°à¦§à¦¾à¦¨)</span>
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={() => {
                markDirty();
                setCfg((c) => {
                  const copy = JSON.parse(JSON.stringify(c));
                  copy.categories.push("à¦¨à¦¤à§à¦¨ à¦•à§à¦¯à¦¾à¦Ÿà¦¾à¦—à¦°à¦¿");
                  return copy;
                });
              }}
              className="w-full py-2.5 rounded-xl border border-dashed border-pink-500 text-pink-400 text-xs font-semibold hover:bg-pink-500/10 transition-colors cursor-pointer flex items-center justify-center gap-1"
            >
              <Plus className="w-4 h-4" />
              <span>+ à¦¨à¦¤à§à¦¨ à¦•à§à¦¯à¦¾à¦Ÿà¦¾à¦—à¦°à¦¿ à¦¯à§‹à¦— à¦•à¦°à§à¦¨</span>
            </button>
          </div>
        )}

        {/* 4. VIDEOS */}
        {activeSection === "videos" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-[#8f93ad]">
                à¦®à§‹à¦Ÿ à¦­à¦¿à¦¡à¦¿à¦“: <span className="text-white font-bold">{cfg.videos?.length || 0}</span> à¦Ÿà¦¿
              </p>
              <button
                onClick={() => {
                  markDirty();
                  setCfg((c) => {
                    const copy = JSON.parse(JSON.stringify(c));
                    copy.videos.push({
                      id: "v" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
                      title: "à¦¨à¦¤à§à¦¨ à¦†à¦•à¦°à§à¦·à¦£à§€à¦¯à¦¼ à¦­à¦¿à¦¡à¦¿à¦“",
                      cat: copy.categories[1] || copy.categories[0] || "à¦«à¦¾à¦¨à¦¿",
                      dur: "03:00",
                      views: 0,
                      likes: 0,
                      ads: 3,
                      src: "",
                      thumb: "",
                    });
                    return copy;
                  });
                }}
                className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 text-white text-xs font-bold flex items-center gap-1 cursor-pointer shadow"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>à¦¨à¦¤à§à¦¨ à¦­à¦¿à¦¡à¦¿à¦“ à¦¯à§‹à¦— à¦•à¦°à§à¦¨</span>
              </button>
            </div>

            {/* Recommended Video Hosting Guide Card */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-950/40 via-purple-950/40 to-[#1a1b26] border border-blue-500/30 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-blue-300">
                <Sparkles className="w-4 h-4 text-blue-400" />
                <span>à¦­à¦¿à¦¡à¦¿à¦“ à¦¹à§‹à¦¸à§à¦Ÿà¦¿à¦‚ à¦ªà¦°à¦¾à¦®à¦°à§à¦¶: à¦—à§à¦—à¦² à¦¡à§à¦°à¦¾à¦‡à¦­ / à¦¡à§à¦°à¦ªà¦¬à¦•à§à¦¸ à¦¬à¦¾à¦¦à§‡ à¦¸à§‡à¦°à¦¾ à¦¸à¦¾à¦‡à¦Ÿà¦¸à¦®à§‚à¦¹</span>
              </div>
              <p className="text-[11px] text-[#8f93ad] leading-relaxed">
                à¦—à§à¦—à¦² à¦¡à§à¦°à¦¾à¦‡à¦­ à¦“ à¦¡à§à¦°à¦ªà¦¬à¦•à§à¦¸à§‡ à¦…à¦¨à§‡à¦• à¦¸à¦®à¦¯à¦¼ à¦Ÿà§à¦°à¦¾à¦«à¦¿à¦• à¦²à¦¿à¦®à¦¿à¦Ÿ à¦¬à¦¾ à¦²à§‹à¦¡à¦¿à¦‚à¦¯à¦¼à§‡ à¦¦à§‡à¦°à¦¿ à¦¹à¦¯à¦¼à¥¤ à¦¦à§à¦°à§à¦¤ à¦ªà§à¦²à§‡ à¦•à¦°à¦¾à¦° à¦œà¦¨à§à¦¯ à¦¨à¦¿à¦šà§‡à¦° à¦¯à§‡à¦•à§‹à¦¨à§‹ à¦¸à¦¾à¦°à§à¦­à¦¿à¦¸ à¦¬à§à¦¯à¦¬à¦¹à¦¾à¦° à¦•à¦°à¦¤à§‡ à¦ªà¦¾à¦°à§‡à¦¨:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                <div className="p-2.5 rounded-xl bg-[#0f1016] border border-[#33354a]">
                  <b className="text-white">à§§. Bunny.net (Bunny Stream):</b>
                  <p className="text-[#8f93ad] mt-0.5">à¦¸à¦¬à¦šà§‡à¦¯à¦¼à§‡ à¦•à¦® à¦–à¦°à¦šà§‡ à¦¸à§à¦ªà¦¾à¦° à¦«à¦¾à¦¸à§à¦Ÿ à¦­à¦¿à¦¡à¦¿à¦“ à¦¸à§à¦Ÿà§à¦°à¦¿à¦®à¦¿à¦‚ à¦“ à¦¡à¦¿à¦°à§‡à¦•à§à¦Ÿ MP4/HLS à¦²à¦¿à¦‚à¦• à¦¦à§‡à¦¯à¦¼à¥¤ à¦•à§‹à¦¨à§‹ à¦¬à¦¾à¦«à¦¾à¦°à¦¿à¦‚ à¦¬à¦¾ à¦²à¦¿à¦®à¦¿à¦Ÿ à¦¨à§‡à¦‡à¥¤</p>
                </div>
                <div className="p-2.5 rounded-xl bg-[#0f1016] border border-[#33354a]">
                  <b className="text-white">à§¨. Cloudflare R2 (à¦«à§à¦°à¦¿ à§§à§¦ GB):</b>
                  <p className="text-[#8f93ad] mt-0.5">à¦•à§‹à¦¨à§‹ à¦¬à§à¦¯à¦¾à¦¨à§à¦¡à¦‰à¦‡à¦¥ à¦–à¦°à¦š à¦¨à§‡à¦‡ (Zero Egress)à¥¤ à¦¡à¦¿à¦°à§‡à¦•à§à¦Ÿ à¦ªà¦¾à¦¬à¦²à¦¿à¦• à¦²à¦¿à¦‚à¦•à§‡ à¦­à¦¿à¦¡à¦¿à¦“ à¦‡à¦¨à¦¸à§à¦Ÿà§à¦¯à¦¾à¦¨à§à¦Ÿ à¦ªà§à¦²à§‡ à¦¹à¦¯à¦¼à¥¤</p>
                </div>
                <div className="p-2.5 rounded-xl bg-[#0f1016] border border-[#33354a]">
                  <b className="text-white">à§©. Internet Archive (archive.org):</b>
                  <p className="text-[#8f93ad] mt-0.5">à§§à§¦à§¦% à¦¸à¦®à§à¦ªà§‚à¦°à§à¦£ à¦«à§à¦°à¦¿ à¦“ à¦†à¦¨à¦²à¦¿à¦®à¦¿à¦Ÿà§‡à¦¡à¥¤ à¦­à¦¿à¦¡à¦¿à¦“ à¦†à¦ªà¦²à§‹à¦¡ à¦•à¦°à¦²à§‡ à¦¸à¦°à¦¾à¦¸à¦°à¦¿ à¦¹à¦¾à¦‡-à¦¸à§à¦ªà¦¿à¦¡ .mp4 à¦²à¦¿à¦‚à¦• à¦ªà¦¾à¦“à¦¯à¦¼à¦¾ à¦¯à¦¾à¦¯à¦¼à¥¤</p>
                </div>
                <div className="p-2.5 rounded-xl bg-[#0f1016] border border-[#33354a]">
                  <b className="text-white">à§ª. à¦¸à¦°à¦¾à¦¸à¦°à¦¿ à¦¸à¦¾à¦°à§à¦­à¦¾à¦°à§‡ à¦†à¦ªà¦²à§‹à¦¡ (Upload):</b>
                  <p className="text-[#8f93ad] mt-0.5">à¦ªà§à¦°à¦¤à¦¿à¦Ÿà¦¿ à¦­à¦¿à¦¡à¦¿à¦“à¦° à¦ªà¦¾à¦¶à§‡ à¦¥à¦¾à¦•à¦¾ &apos;à¦†à¦ªà¦²à§‹à¦¡&apos; à¦¬à¦¾à¦Ÿà¦¨ à¦¦à¦¿à¦¯à¦¼à§‡ à¦«à¦¾à¦‡à¦² à¦¸à¦°à¦¾à¦¸à¦°à¦¿ à¦†à¦ªà¦¨à¦¾à¦° à¦¸à¦¾à¦°à§à¦­à¦¾à¦°à§‡ à¦¹à§‹à¦¸à§à¦Ÿ à¦•à¦°à¦¤à§‡ à¦ªà¦¾à¦°à§‡à¦¨à¥¤</p>
                </div>
              </div>
            </div>

            {(cfg.videos || []).map((video, idx) => {
              const srcProg = uploadProgress[`${idx}-src`];
              const thumbProg = uploadProgress[`${idx}-thumb`];

              return (
                <div
                  key={video.id || idx}
                  className="p-5 rounded-2xl bg-[#1a1b26] border border-[#33354a] space-y-4"
                >
                  <div className="flex items-center justify-between border-b border-[#33354a] pb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-pink-500/20 text-pink-400 text-xs flex items-center justify-center font-bold">
                        {idx + 1}
                      </span>
                      <span className="text-sm font-bold text-white truncate max-w-[200px] sm:max-w-md">
                        {video.title}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => moveItem("videos", idx, -1)}
                        disabled={idx === 0}
                        className="p-1.5 rounded-lg bg-[#262838] border border-[#33354a] hover:bg-white/10 disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => moveItem("videos", idx, 1)}
                        disabled={idx === cfg.videos.length - 1}
                        className="p-1.5 rounded-lg bg-[#262838] border border-[#33354a] hover:bg-white/10 disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => deleteItem("videos", idx)}
                        className="p-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 cursor-pointer ml-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Title & Category */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label className="text-xs text-[#8f93ad] block mb-1">
                        à¦­à¦¿à¦¡à¦¿à¦“à¦° à¦¶à¦¿à¦°à§‹à¦¨à¦¾à¦®
                      </label>
                      <input
                        type="text"
                        value={video.title}
                        onChange={(e) => updateConfigValue(`videos.${idx}.title`, e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-[#0f1016] border border-[#33354a] text-sm text-white outline-none focus:border-pink-500"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-[#8f93ad] block mb-1">
                        à¦•à§à¦¯à¦¾à¦Ÿà¦¾à¦—à¦°à¦¿
                      </label>
                      <select
                        value={video.cat}
                        onChange={(e) => updateConfigValue(`videos.${idx}.cat`, e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-[#0f1016] border border-[#33354a] text-sm text-white outline-none focus:border-pink-500 cursor-pointer"
                      >
                        {cfg.categories.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Metrics & Ads requirement */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="text-xs text-[#8f93ad] block mb-1">
                        à¦¸à¦®à¦¯à¦¼ (MM:SS)
                      </label>
                      <input
                        type="text"
                        value={video.dur}
                        onChange={(e) => updateConfigValue(`videos.${idx}.dur`, e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-[#0f1016] border border-[#33354a] text-sm text-white outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-[#8f93ad] block mb-1">
                        à¦¬à¦¿à¦œà§à¦žà¦¾à¦ªà¦¨ à¦¸à¦‚à¦–à§à¦¯à¦¾ (à§¦ = à¦«à§à¦°à¦¿)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={video.ads}
                        onChange={(e) =>
                          updateConfigValue(`videos.${idx}.ads`, parseInt(e.target.value, 10) || 0)
                        }
                        className="w-full px-3 py-2 rounded-xl bg-[#0f1016] border border-[#33354a] text-sm text-white outline-none font-bold text-amber-400"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-[#8f93ad] block mb-1">
                        à¦­à¦¿à¦‰ (à¦¶à§à¦°à§à¦° à¦¸à¦‚à¦–à§à¦¯à¦¾)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={video.views}
                        onChange={(e) =>
                          updateConfigValue(`videos.${idx}.views`, parseInt(e.target.value, 10) || 0)
                        }
                        className="w-full px-3 py-2 rounded-xl bg-[#0f1016] border border-[#33354a] text-sm text-white outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-[#8f93ad] block mb-1">
                        à¦²à¦¾à¦‡à¦• (à¦¶à§à¦°à§à¦° à¦¸à¦‚à¦–à§à¦¯à¦¾)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={video.likes}
                        onChange={(e) =>
                          updateConfigValue(`videos.${idx}.likes`, parseInt(e.target.value, 10) || 0)
                        }
                        className="w-full px-3 py-2 rounded-xl bg-[#0f1016] border border-[#33354a] text-sm text-white outline-none"
                      />
                    </div>
                  </div>

                  {/* Video Media Source & Upload */}
                  <div className="p-3 rounded-xl bg-[#0f1016] border border-[#33354a] space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-[#8f93ad] block">
                        à¦­à¦¿à¦¡à¦¿à¦“ à¦«à¦¾à¦‡à¦² à¦²à¦¿à¦‚à¦• (à¦—à§à¦—à¦² à¦¡à§à¦°à¦¾à¦‡à¦­, à¦¡à§à¦°à¦ªà¦¬à¦•à§à¦¸, mp4 à¦²à¦¿à¦‚à¦• à¦¬à¦¾ à¦†à¦ªà¦²à§‹à¦¡)
                      </label>
                      {video.src && (
                        <button
                          type="button"
                          onClick={() => setPreviewModalUrl(normalizeMediaUrl(video.src))}
                          className="text-[11px] text-pink-400 hover:text-pink-300 font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>à¦Ÿà§‡à¦¸à§à¦Ÿ à¦“ à¦ªà§à¦°à¦¿à¦­à¦¿à¦‰</span>
                        </button>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={video.src}
                        onChange={(e) => {
                          const val = e.target.value;
                          const normalized = normalizeMediaUrl(val);
                          markDirty();
                          setCfg((prev) => {
                            const clone = JSON.parse(JSON.stringify(prev));
                            if (!clone.videos[idx]) return clone;
                            clone.videos[idx].src = normalized;
                            // Auto populate Google Drive thumbnail if thumbnail is empty
                            if (!clone.videos[idx].thumb) {
                              const autoThumb = getGoogleDriveThumbnailUrl(val);
                              if (autoThumb) {
                                clone.videos[idx].thumb = autoThumb;
                              }
                            }
                            return clone;
                          });
                        }}
                        placeholder="Google Drive, Dropbox à¦…à¦¥à¦¬à¦¾ à¦¸à¦°à¦¾à¦¸à¦°à¦¿ MP4 à¦²à¦¿à¦‚à¦• à¦ªà§‡à¦¸à§à¦Ÿ à¦•à¦°à§à¦¨"
                        className="flex-1 px-3 py-2 rounded-xl bg-[#1a1b26] border border-[#33354a] text-xs text-white outline-none focus:border-pink-500 font-mono"
                      />
                      <label className="px-3 py-2 rounded-xl bg-[#262838] border border-[#33354a] hover:bg-white/10 text-xs font-semibold text-white cursor-pointer flex items-center gap-1.5 shrink-0">
                        <Upload className="w-3.5 h-3.5" />
                        <span>à¦†à¦ªà¦²à§‹à¦¡</span>
                        <input
                          type="file"
                          accept="video/mp4,video/webm,video/quicktime"
                          hidden
                          onChange={(e) => handleFileUpload(e, idx, "src")}
                        />
                      </label>
                    </div>

                    {/* Helpful status indicator for Google Drive / Dropbox */}
                    {video.src && (video.src.includes("/api/stream-drive") || isGoogleDriveUrl(video.src)) && (
                      <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/30 text-[11px] text-blue-300 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span>âš¡ à¦—à§à¦—à¦² à¦¡à§à¦°à¦¾à¦‡à¦­ à¦¸à¦°à¦¾à¦¸à¦°à¦¿ à¦¸à§à¦Ÿà§à¦°à¦¿à¦®à¦¿à¦‚ à¦®à§‹à¦¡ à¦¸à¦•à§à¦°à¦¿à¦¯à¦¼! (à¦«à¦¾à¦‡à¦² &apos;Anyone with the link&apos; à¦¶à§‡à¦¯à¦¼à¦¾à¦° à¦¥à¦¾à¦•à¦¤à§‡ à¦¹à¦¬à§‡)</span>
                      </div>
                    )}
                    {video.src && isDropboxUrl(video.src) && (
                      <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/30 text-[11px] text-purple-300 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                        <span>âš¡ à¦¡à§à¦°à¦ªà¦¬à¦•à§à¦¸ à¦¸à¦°à¦¾à¦¸à¦°à¦¿ à¦¸à§à¦Ÿà§à¦°à¦¿à¦®à¦¿à¦‚ à¦®à§‹à¦¡ à¦¸à¦•à§à¦°à¦¿à¦¯à¦¼!</span>
                      </div>
                    )}
                    {video.src && isTeraboxUrl(video.src) && (
                      <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/30 text-[11px] text-blue-300 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span>âš¡ à¦Ÿà§‡à¦°à¦¾à¦¬à¦•à§à¦¸ (Terabox) à¦²à¦¿à¦‚à¦• à¦¸à¦¨à¦¾à¦•à§à¦¤ à¦¹à¦¯à¦¼à§‡à¦›à§‡! à¦¸à¦°à¦¾à¦¸à¦°à¦¿ à¦ªà§à¦²à§‡à¦¯à¦¼à¦¾à¦° à¦à¦®à§à¦¬à§‡à¦¡ à¦¸à¦•à§à¦°à¦¿à¦¯à¦¼à¥¤</span>
                      </div>
                    )}

                    {srcProg && (
                      <p className="text-xs font-mono text-pink-400">{srcProg}</p>
                    )}
                  </div>

                  {/* Thumbnail Source & Upload */}
                  <div className="p-3 rounded-xl bg-[#0f1016] border border-[#33354a] space-y-2">
                    <label className="text-xs text-[#8f93ad] block">
                      à¦¥à¦¾à¦®à§à¦¬à¦¨à§‡à¦‡à¦² à¦²à¦¿à¦‚à¦• à¦¬à¦¾ à¦›à¦¬à¦¿ à¦†à¦ªà¦²à§‹à¦¡
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={video.thumb}
                        onChange={(e) => updateConfigValue(`videos.${idx}.thumb`, e.target.value)}
                        placeholder="https://... à¦…à¦¥à¦¬à¦¾ à¦›à¦¬à¦¿ à¦†à¦ªà¦²à§‹à¦¡ à¦•à¦°à§à¦¨"
                        className="flex-1 px-3 py-2 rounded-xl bg-[#1a1b26] border border-[#33354a] text-xs text-white outline-none"
                      />
                      <label className="px-3 py-2 rounded-xl bg-[#262838] border border-[#33354a] hover:bg-white/10 text-xs font-semibold text-white cursor-pointer flex items-center gap-1.5 shrink-0">
                        <ImageIcon className="w-3.5 h-3.5" />
                        <span>à¦›à¦¬à¦¿ à¦†à¦ªà¦²à§‹à¦¡</span>
                        <input
                          type="file"
                          accept="image/*"
                          hidden
                          onChange={(e) => handleFileUpload(e, idx, "thumb")}
                        />
                      </label>
                    </div>
                    {thumbProg && (
                      <p className="text-xs font-mono text-pink-400">{thumbProg}</p>
                    )}
                    {(video.thumb || getGoogleDriveThumbnailUrl(video.src)) && (
                      <div className="mt-2 flex items-center gap-2.5">
                        <img
                          src={video.thumb || getGoogleDriveThumbnailUrl(video.src)!}
                          alt="preview"
                          className="h-16 w-28 rounded-lg object-cover border border-[#33354a]"
                        />
                        {!video.thumb && getGoogleDriveThumbnailUrl(video.src) && (
                          <span className="text-[11px] text-pink-400 font-medium">
                            âœ¨ à¦—à§à¦—à¦² à¦¡à§à¦°à¦¾à¦‡à¦­ à¦…à¦Ÿà§‹-à¦¥à¦¾à¦®à§à¦¬à¦¨à§‡à¦‡à¦² à¦¸à¦•à§à¦°à¦¿à¦¯à¦¼
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            <button
              onClick={() => {
                markDirty();
                setCfg((c) => {
                  const copy = JSON.parse(JSON.stringify(c));
                  copy.videos.push({
                    id: "v" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
                    title: "à¦¨à¦¤à§à¦¨ à¦­à¦¿à¦¡à¦¿à¦“",
                    cat: copy.categories[1] || copy.categories[0] || "à¦«à¦¾à¦¨à¦¿",
                    dur: "03:00",
                    views: 0,
                    likes: 0,
                    ads: 3,
                    src: "",
                    thumb: "",
                  });
                  return copy;
                });
              }}
              className="w-full py-3 rounded-2xl border border-dashed border-pink-500 text-pink-400 text-sm font-semibold hover:bg-pink-500/10 transition-colors cursor-pointer flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>+ à¦¨à¦¤à§à¦¨ à¦­à¦¿à¦¡à¦¿à¦“ à¦¯à§‹à¦— à¦•à¦°à§à¦¨</span>
            </button>
          </div>
        )}

        {/* 5. ADS CONFIG */}
        {activeSection === "ads" && (
          <div className="p-5 rounded-2xl bg-[#1a1b26] border border-[#33354a] space-y-4">
            <h3 className="text-sm font-bold text-white border-b border-[#33354a] pb-2">
              à¦¬à¦¿à¦œà§à¦žà¦¾à¦ªà¦¨ à¦“ à¦®à¦¨à¦¿à¦Ÿà¦¾à¦‡à¦œà§‡à¦¶à¦¨ à¦•à¦¨à¦«à¦¿à¦—à¦¾à¦°à§‡à¦¶à¦¨
            </h3>
            <p className="text-xs text-[#8f93ad]">
              à¦­à¦¿à¦¡à¦¿à¦“ à¦†à¦¨à¦²à¦• à¦•à¦°à¦¤à§‡ à¦‡à¦‰à¦œà¦¾à¦° à¦•à¦¯à¦¼à¦Ÿà¦¿ à¦¬à¦¿à¦œà§à¦žà¦¾à¦ªà¦¨ à¦¦à§‡à¦–à¦¬à§‡ à¦¤à¦¾ à¦ à¦¿à¦• à¦•à¦°à§à¦¨à¥¤ à¦ªà§à¦°à¦¤à¦¿à¦Ÿà¦¿ à¦­à¦¿à¦¡à¦¿à¦“à¦¤à§‡ à¦†à¦²à¦¾à¦¦à¦¾ à¦•à¦°à§‡ à¦¬à¦¿à¦œà§à¦žà¦¾à¦ªà¦¨à§‡à¦° à¦¸à¦‚à¦–à§à¦¯à¦¾ à¦¨à¦¿à¦°à§à¦§à¦¾à¦°à¦£ à¦•à¦°à¦¤à§‡ à¦ªà¦¾à¦°à¦¬à§‡à¦¨à¥¤
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-[#8f93ad] block mb-1">
                  à¦¬à¦¿à¦œà§à¦žà¦¾à¦ªà¦¨à§‡à¦° à¦§à¦°à¦¨ (Ad Provider)
                </label>
                <select
                  value={cfg.ads.provider || "adsterra"}
                  onChange={(e) => updateConfigValue("ads.provider", e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#0f1016] border border-[#33354a] text-sm text-white outline-none cursor-pointer"
                >
                  <option value="adsterra">Adsterra (à¦¸à§à¦®à¦¾à¦°à§à¦Ÿà¦²à¦¿à¦™à§à¦• / à¦¡à¦¿à¦°à§‡à¦•à§à¦Ÿ à¦²à¦¿à¦™à§à¦• - à§§à§¦à§¦% à¦°à¦¿à¦¯à¦¼à§‡à¦² à¦“ à¦•à¦¾à¦°à§à¦¯à¦•à¦°)</option>
                  <option value="demo">à¦¡à§‡à¦®à§‹ à¦•à¦¾à¦‰à¦¨à§à¦Ÿà¦¡à¦¾à¦‰à¦¨ à¦Ÿà¦¾à¦‡à¦®à¦¾à¦° (Demo)</option>
                  <option value="adsgram">Adsgram (à¦Ÿà§‡à¦²à¦¿à¦—à§à¦°à¦¾à¦® à¦†à¦¸à¦² à¦¬à¦¿à¦œà§à¦žà¦¾à¦ªà¦¨)</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-[#8f93ad] block mb-1">
                  Adsterra Direct Link (Smartlink URL)
                </label>
                <input
                  type="url"
                  value={cfg.ads.adsterraUrl || ""}
                  placeholder="https://www.profitablecpmrate.com/..."
                  onChange={(e) => updateConfigValue("ads.adsterraUrl", e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#0f1016] border border-[#33354a] text-sm text-white outline-none"
                />
              </div>

              {cfg.ads.provider === "adsgram" && (
                <div>
                  <label className="text-xs text-[#8f93ad] block mb-1">
                    Adsgram Block ID (à¦¯à¦¦à¦¿ Adsgram à¦¬à§à¦¯à¦¬à¦¹à¦¾à¦° à¦•à¦°à§‡à¦¨)
                  </label>
                  <input
                    type="text"
                    value={cfg.ads.blockId || ""}
                    placeholder="à¦¯à§‡à¦®à¦¨: 1234"
                    onChange={(e) => updateConfigValue("ads.blockId", e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#0f1016] border border-[#33354a] text-sm text-white outline-none"
                  />
                </div>
              )}

              <div>
                <label className="text-xs text-[#8f93ad] block mb-1">
                  à¦¡à§‡à¦®à§‹ à¦¬à¦¿à¦œà§à¦žà¦¾à¦ªà¦¨à§‡à¦° à¦¸à¦®à¦¯à¦¼ (à¦¸à§‡à¦•à§‡à¦¨à§à¦¡)
                </label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={cfg.ads.demoSeconds}
                  onChange={(e) =>
                    updateConfigValue("ads.demoSeconds", parseInt(e.target.value, 10) || 5)
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[#0f1016] border border-[#33354a] text-sm text-white outline-none"
                />
              </div>

              <div>
                <label className="text-xs text-[#8f93ad] block mb-1">
                  à¦²à¦• à¦¬à§à¦¯à¦¾à¦œà§‡à¦° à¦²à§‡à¦–à¦¾ (à¦¯à§‡à¦®à¦¨: Ads)
                </label>
                <input
                  type="text"
                  value={cfg.ads.lockedLabel}
                  onChange={(e) => updateConfigValue("ads.lockedLabel", e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#0f1016] border border-[#33354a] text-sm text-white outline-none"
                />
              </div>

              <div className="sm:col-span-2 p-3.5 rounded-xl bg-[#0f1016] border border-pink-500/30 space-y-1.5">
                <label className="text-xs text-pink-300 font-bold flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-pink-400" />
                  <span>à¦¬à¦¿à¦œà§à¦žà¦¾à¦ªà¦¨ à¦†à¦¨à¦²à¦•à§‡à¦° à¦¸à§à¦¥à¦¾à¦¯à¦¼à¦¿à¦¤à§à¦¬ (Lock/Unlock Policy)</span>
                </label>
                <select
                  value={cfg.ads.unlockDuration || "session"}
                  onChange={(e) => updateConfigValue("ads.unlockDuration", e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#1a1b26] border border-[#33354a] text-xs text-white outline-none cursor-pointer focus:border-pink-500"
                >
                  <option value="session">
                    ðŸ”’ à¦¸à§‡à¦¶à¦¨ à¦­à¦¿à¦¤à§à¦¤à¦¿à¦• (à¦à¦•à¦¬à¦¾à¦° à¦¬à§‡à¦° à¦¹à¦¯à¦¼à§‡ à¦ªà§à¦¨à¦°à¦¾à¦¯à¦¼ à¦ªà§à¦°à¦¬à§‡à¦¶ à¦•à¦°à¦²à§‡ à¦†à¦¬à¦¾à¦° à¦²à¦• à¦¹à¦¬à§‡ - à¦°à¦¿à¦•à¦®à§‡à¦¨à§à¦¡à§‡à¦¡)
                  </option>
                  <option value="forever">
                    ðŸ”“ à¦šà¦¿à¦°à¦¤à¦°à§‡ à¦†à¦¨à¦²à¦• (à¦à¦•à¦¬à¦¾à¦° à¦…à§à¦¯à¦¾à¦¡ à¦¦à§‡à¦–à¦²à§‡ à¦ªà¦¾à¦°à¦®à¦¾à¦¨à§‡à¦¨à§à¦Ÿà¦²à¦¿ à¦†à¦¨à¦²à¦• à¦¥à¦¾à¦•à¦¬à§‡)
                  </option>
                </select>
                <p className="text-[11px] text-[#8f93ad] leading-relaxed">
                  ðŸ’¡ <b>à¦¸à§‡à¦¶à¦¨ à¦­à¦¿à¦¤à§à¦¤à¦¿à¦•:</b> à¦¬à§à¦¯à¦¬à¦¹à¦¾à¦°à¦•à¦¾à¦°à§€ à¦Ÿà§‡à¦²à¦¿à¦—à§à¦°à¦¾à¦® à¦®à¦¿à¦¨à¦¿ à¦…à§à¦¯à¦¾à¦ª à¦¬à¦¨à§à¦§ à¦•à¦°à§‡ à¦¬à§‡à¦° à¦¹à¦¯à¦¼à§‡ à¦—à§‡à¦²à§‡ à¦à¦¬à¦‚ à¦ªà¦°à§‡ à¦†à¦¬à¦¾à¦° à¦¢à§à¦•à¦²à§‡ à¦¸à¦¬à¦—à§à¦²à§‹ à¦­à¦¿à¦¡à¦¿à¦“ à¦ªà§à¦¨à¦°à¦¾à¦¯à¦¼ à¦²à¦• à¦¥à¦¾à¦•à¦¬à§‡ à¦à¦¬à¦‚ à¦¨à¦¤à§à¦¨ à¦•à¦°à§‡ à¦…à§à¦¯à¦¾à¦¡ à¦¦à§‡à¦–à¦¤à§‡ à¦¹à¦¬à§‡à¥¤
                </p>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <div>
                <label className="text-xs text-[#8f93ad] block mb-1">
                  à¦†à¦¨à¦²à¦• à¦ªà¦ªà¦†à¦ªà§‡à¦° à¦¶à¦¿à¦°à§‹à¦¨à¦¾à¦®
                </label>
                <input
                  type="text"
                  value={cfg.ads.unlockTitle}
                  onChange={(e) => updateConfigValue("ads.unlockTitle", e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#0f1016] border border-[#33354a] text-sm text-white outline-none"
                />
              </div>

              <div>
                <label className="text-xs text-[#8f93ad] block mb-1">
                  à¦†à¦¨à¦²à¦• à¦ªà¦ªà¦†à¦ªà§‡à¦° à¦Ÿà§‡à¦•à§à¦¸à¦Ÿ (<span className="text-pink-400 font-mono">{"{n}"}</span> = à¦¬à¦¾à¦•à¦¿ à¦¬à¦¿à¦œà§à¦žà¦¾à¦ªà¦¨à§‡à¦° à¦¸à¦‚à¦–à§à¦¯à¦¾)
                </label>
                <input
                  type="text"
                  value={cfg.ads.unlockText}
                  onChange={(e) => updateConfigValue("ads.unlockText", e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#0f1016] border border-[#33354a] text-sm text-white outline-none font-medium"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-[#8f93ad] block mb-1">
                    à¦¬à¦¿à¦œà§à¦žà¦¾à¦ªà¦¨ à¦¦à§‡à¦–à¦¾à¦° à¦¬à¦¾à¦Ÿà¦¨à§‡à¦° à¦²à§‡à¦–à¦¾
                  </label>
                  <input
                    type="text"
                    value={cfg.ads.watchButton}
                    onChange={(e) => updateConfigValue("ads.watchButton", e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#0f1016] border border-[#33354a] text-sm text-white outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs text-[#8f93ad] block mb-1">
                    à¦¬à¦¾à¦¤à¦¿à¦² à¦¬à¦¾à¦Ÿà¦¨à§‡à¦° à¦²à§‡à¦–à¦¾
                  </label>
                  <input
                    type="text"
                    value={cfg.ads.cancelButton}
                    onChange={(e) => updateConfigValue("ads.cancelButton", e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#0f1016] border border-[#33354a] text-sm text-white outline-none"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Floating Save Action Bar (For tabs 1-5) */}
      {activeSection !== "security" && (
        <div className="fixed bottom-0 left-0 right-0 p-3 sm:p-4 bg-[#1a1b26]/95 backdrop-blur-md border-t border-[#33354a] z-40 flex items-center justify-between max-w-4xl mx-auto shadow-2xl">
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 text-white font-bold text-sm shadow-lg hover:opacity-95 transition-all cursor-pointer flex items-center gap-2 active:scale-95"
            >
              <Save className="w-4 h-4" />
              <span>ðŸ’¾ à¦ªà¦°à¦¿à¦¬à¦°à§à¦¤à¦¨ à¦¸à§‡à¦­ à¦•à¦°à§à¦¨</span>
            </button>
            {isDirty && (
              <span className="hidden sm:inline text-xs text-amber-400 font-medium">
                â— à¦¸à§‡à¦­ à¦•à¦°à¦¾ à¦¬à¦¾à¦•à¦¿
              </span>
            )}
          </div>

          <div>
            {saveStatus && (
              <span
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border ${
                  saveStatus.startsWith("âœ…")
                    ? "bg-green-500/10 text-green-400 border-green-500/30"
                    : saveStatus.startsWith("âŒ")
                    ? "bg-red-500/10 text-red-400 border-red-500/30"
                    : "bg-white/5 text-[#8f93ad] border-[#33354a]"
                }`}
              >
                {saveStatus}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Floating Video Preview Test Modal */}
      {previewModalUrl && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#160a26] border border-pink-500/40 rounded-3xl p-5 shadow-2xl relative space-y-3">
            <div className="flex items-center justify-between border-b border-[#33354a] pb-2.5">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Play className="w-4 h-4 text-pink-400 fill-current" />
                <span>à¦­à¦¿à¦¡à¦¿à¦“ à¦ªà§à¦°à¦¿à¦­à¦¿à¦‰ à¦Ÿà§‡à¦¸à§à¦Ÿ</span>
              </span>
              <button
                onClick={() => setPreviewModalUrl(null)}
                className="p-1.5 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-2xl overflow-hidden bg-black aspect-video flex items-center justify-center border border-white/10">
              <video
                src={previewModalUrl}
                controls
                autoPlay
                playsInline
                className="w-full h-full object-contain"
              />
            </div>

            <p className="text-[11px] text-[#a58bb8] leading-relaxed">
              ðŸ’¡ à¦­à¦¿à¦¡à¦¿à¦“à¦Ÿà¦¿ à¦šà¦¾à¦²à§ à¦¹à¦²à§‡ à¦¬à§à¦à¦¬à§‡à¦¨ à¦²à¦¿à¦‚à¦•à¦Ÿà¦¿ à¦ªà§à¦°à§‹à¦ªà§à¦°à¦¿ à¦•à¦¾à¦°à§à¦¯à¦•à¦°à¥¤ à¦—à§à¦—à¦² à¦¡à§à¦°à¦¾à¦‡à¦­ à¦­à¦¿à¦¡à¦¿à¦“ à¦¨à¦¾ à¦šà¦²à¦²à§‡ à¦«à¦¾à¦‡à¦²à§‡ &apos;Anyone with the link&apos; à¦¶à§‡à¦¯à¦¼à¦¾à¦° à¦ªà¦¾à¦°à¦®à¦¿à¦¶à¦¨ à¦šà¦¾à¦²à§ à¦†à¦›à§‡ à¦•à¦¿à¦¨à¦¾ à¦¨à¦¿à¦¶à§à¦šà¦¿à¦¤ à¦•à¦°à§à¦¨à¥¤
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
