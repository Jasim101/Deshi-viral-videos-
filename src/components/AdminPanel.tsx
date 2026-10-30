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
} from "lucide-react";

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
      if (!res.ok) throw new Error(data.error || "আইডি সেট করা যায়নি");
      setAuthStatus((prev: any) => ({ ...prev, adminTelegramId: data.adminTelegramId }));
      setTelegramMsg({
        type: "success",
        text: data.message || "টেলিগ্রাম আইডি লক সফলভাবে আপডেট করা হয়েছে!",
      });
      fetch("/api/login-info")
        .then((r) => r.json())
        .then((d) => setLoginInfo(d))
        .catch(() => {});
    } catch (err: any) {
      setTelegramMsg({
        type: "error",
        text: err.message || "টেলিগ্রাম আইডি সেভ করতে ব্যর্থ হয়েছে",
      });
    } finally {
      setIsSavingTelegramId(false);
    }
  };

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!password) {
      setLoginError("পাসওয়ার্ড প্রদান করুন");
      return;
    }
    if (retryAfterSeconds > 0) {
      setLoginError(`লকআউট সক্রিয় রয়েছে! আর ${retryAfterSeconds} সেকেন্ড পর চেষ্টা করুন।`);
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
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.retryAfter) {
          setRetryAfterSeconds(data.retryAfter);
        }
        setLoginError(data.error || "পাসওয়ার্ড ভুল হয়েছে");
        setIsLoggingIn(false);
        return;
      }

      setToken(data.token);
      setIsDefaultPassword(!!data.isDefaultPassword);

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
      setLoginError("সার্ভারের সাথে যোগাযোগ করা যায়নি");
    } finally {
      setIsLoggingIn(false);
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
      setPwMsg({ type: "error", text: "সবগুলো ঘর পূরণ করুন" });
      return;
    }
    if (newPw.length < 8) {
      setPwMsg({ type: "error", text: "নতুন পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে" });
      return;
    }
    if (newPw !== confirmPw) {
      setPwMsg({ type: "error", text: "নতুন পাসওয়ার্ড দুবার একই হতে হবে" });
      return;
    }
    if (newPw === "admin123") {
      setPwMsg({ type: "error", text: "ডিফল্ট 'admin123' ছাড়া অন্য শক্তিশালী পাসওয়ার্ড দিন" });
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
        throw new Error(data.error || "পাসওয়ার্ড পরিবর্তন করা যায়নি");
      }

      setToken(data.token);
      setIsDefaultPassword(false);
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
      setPwMsg({
        type: "success",
        text: "✅ পাসওয়ার্ড সফলভাবে পরিবর্তন হয়েছে! অন্য সব সেশন বাতিল করা হয়েছে।",
      });
      fetchAuthStatus(data.token);
    } catch (err: any) {
      setPwMsg({ type: "error", text: err.message || "পাসওয়ার্ড পরিবর্তন ব্যর্থ হয়েছে" });
    } finally {
      setIsChangingPw(false);
    }
  };

  const handleRevokeAllSessions = async () => {
    if (!confirm("আপনি কি অন্য সকল ডিভাইস ও ব্রাউজারের সেশন লগআউট করে দিতে চান?")) return;
    try {
      const res = await fetch("/api/admin/revoke-sessions", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setToken(data.token);
        alert("✅ অন্য সকল ডিভাইসের সক্রিয় সেশন সফলভাবে বাতিল করা হয়েছে।");
      } else {
        alert(data.error || "সেশন বাতিল করা যায়নি");
      }
    } catch {
      alert("নেটওয়ার্ক ত্রুটি");
    }
  };

  const markDirty = () => {
    setIsDirty(true);
    setSaveStatus("● সেভ করা হয়নি");
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
    if (!confirm("মুছে ফেলতে চান?")) return;
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
    setUploadProgress((p) => ({ ...p, [progKey]: "আপলোড শুরু হচ্ছে..." }));

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
          setUploadProgress((p) => ({ ...p, [progKey]: `${pct}% আপলোড হচ্ছে...` }));
        } else {
          setUploadProgress((p) => ({ ...p, [progKey]: "১০০% আপলোড সম্পন্ন! সার্ভারে সংরক্ষণ ও যাচাই হচ্ছে..." }));
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
                URL.revokeObjectURL(videoElement.src);
              };
              videoElement.src = URL.createObjectURL(file);
            }

            return clone;
          });

          setUploadProgress((p) => ({ ...p, [progKey]: "✅ আপলোড সফলভাবে সম্পন্ন হয়েছে!" }));
          setTimeout(() => {
            setUploadProgress((p) => {
              const copy = { ...p };
              delete copy[progKey];
              return copy;
            });
          }, 4000);
        } catch {
          setUploadProgress((p) => ({ ...p, [progKey]: "❌ রেসপন্স প্রসেস করা যায়নি" }));
        }
      } else {
        let msg = "আপলোড ব্যর্থ হয়েছে";
        try {
          msg = JSON.parse(xhr.responseText).error || msg;
        } catch {}
        setUploadProgress((p) => ({ ...p, [progKey]: `❌ ${msg}` }));
      }
    };

    xhr.ontimeout = () => {
      setUploadProgress((p) => ({ ...p, [progKey]: "❌ টাইমআউট: ইন্টারনেটের গতি ধীর হওয়ায় আপলোড সম্পন্ন করা যায়নি।" }));
    };

    xhr.onerror = () => {
      setUploadProgress((p) => ({ ...p, [progKey]: "❌ নেটওয়ার্ক সমস্যা: সার্ভারের সাথে সংযোগ বিচ্ছিন্ন।" }));
    };

    xhr.send(file);
  };

  const handleSave = async () => {
    const isUploading = Object.values(uploadProgress).some(
      (msg) => typeof msg === "string" && (msg.includes("হচ্ছে") || msg.includes("চলছে"))
    );
    if (isUploading) {
      alert("⚠️ একটি ফাইল এখনো আপলোড হচ্ছে! অনুগ্রহ করে আপলোড শেষ হওয়া পর্যন্ত অপেক্ষা করে তারপর সেভ করুন।");
      return;
    }

    setSaveStatus("সেভ হচ্ছে...");
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
        throw new Error(data.error || "সেভ করা যায়নি");
      }

      setRemovedFiles([]);
      setIsDirty(false);
      setSaveStatus("✅ সফলভাবে সেভ হয়েছে!");
      onConfigUpdated(cfg);

      setTimeout(() => {
        setSaveStatus("");
      }, 4000);
    } catch (err: any) {
      setSaveStatus(`❌ ${err.message || "সেভ ব্যর্থ হয়েছে"}`);
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

    if (score <= 2) return { score: 1, label: "দুর্বল (Weak)", color: "text-red-400 bg-red-500" };
    if (score <= 4) return { score: 2, label: "মাঝারি (Medium)", color: "text-amber-400 bg-amber-500" };
    return { score: 3, label: "শক্তিশালী (Strong)", color: "text-green-400 bg-green-500" };
  };

  const pwStrength = getPasswordStrength(newPw);

  // If in Telegram and user is not the authorized admin, hide password box completely
  if (isTelegram && isTgDenied) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="w-full max-w-xs bg-[#160a26]/90 backdrop-blur-xl border border-red-500/30 rounded-3xl p-6 sm:p-7 text-center shadow-2xl relative">
          {onBackToApp && (
            <button
              onClick={handleExitToApp}
              className="absolute top-3.5 right-3.5 p-1.5 rounded-full text-white/40 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="বন্ধ করুন"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-3xl">
            ⛔
          </div>
          <h3 className="text-sm font-bold text-red-400 mb-1">অ্যাক্সেস সংরক্ষিত</h3>
          <p className="text-xs text-[#a58bb8] mb-5 leading-relaxed">
            শুধুমাত্র অনুমোদিত টেলিগ্রাম অ্যাডমিন অ্যাকাউন্টের জন্য এই প্যানেলটি সংরক্ষিত।
          </p>
          {onBackToApp && (
            <button
              onClick={handleExitToApp}
              className="w-full py-2.5 rounded-xl bg-pink-600 hover:bg-pink-500 text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              অ্যাপে ফিরে যান
            </button>
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
              title="বন্ধ করুন"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-tr from-pink-500/20 to-purple-600/20 border border-pink-500/30 flex items-center justify-center text-3xl shadow-inner">
            🔐
          </div>

          <form onSubmit={handleLogin} className="space-y-3">
            <div className="relative flex items-center">
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                disabled={retryAfterSeconds > 0}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                className="w-full px-4 py-3.5 pr-12 rounded-2xl bg-[#0d0417] border border-[#3b194f] text-white text-base tracking-widest placeholder:tracking-normal placeholder:text-white/30 outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition-all text-center disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={isLoggingIn || retryAfterSeconds > 0 || !password}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 text-white flex items-center justify-center shadow hover:opacity-90 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
                title="প্রবেশ"
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
          </form>
        </div>
      </div>
    );
  }

  const sections: { id: AdminSection; label: string; icon: any }[] = [
    { id: "general", label: "🎨 সাধারণ ও রঙ", icon: Palette },
    { id: "menu", label: "📑 মেনু", icon: Menu },
    { id: "cats", label: "🏷 ক্যাটাগরি", icon: Tags },
    { id: "videos", label: "🎬 ভিডিও", icon: Video },
    { id: "ads", label: "💰 বিজ্ঞাপন", icon: DollarSign },
    { id: "security", label: "🔐 সিকিউরিটি", icon: ShieldCheck },
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
                ⚠️ জরুরি সিকিউরিটি সতর্কবার্তা: ডিফল্ট পাসওয়ার্ড সক্রিয়!
              </h4>
              <p className="text-xs text-amber-200/80 mt-0.5">
                আপনার সিস্টেমে এখনো ডিফল্ট পাসওয়ার্ড (<span className="font-mono font-bold text-white">admin123</span>) রয়েছে। যে কেউ এটি অনুমান করতে পারে।
              </p>
            </div>
          </div>
          <button
            onClick={() => setActiveSection("security")}
            className="px-4 py-2 rounded-xl bg-amber-500 text-black font-bold text-xs hover:bg-amber-400 transition-colors shrink-0 cursor-pointer shadow"
          >
            এখনই পাসওয়ার্ড বদলান →
          </button>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-[#1a1b26] border border-[#33354a] mb-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-pink-500/20 border border-pink-500/40 flex items-center justify-center text-pink-400 font-bold">
            ⚙
          </div>
          <div>
            <h2 className="text-base font-bold text-white leading-tight">
              {cfg.appName || "ফান হাব"} অ্যাডমিন কন্ট্রোল
            </h2>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-[#8f93ad]">
                ভিডিও, মেনু, বিজ্ঞাপন ও থিম ম্যানেজমেন্ট
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20">
                <ShieldCheck className="w-3 h-3" />
                <span>সিকিউরড</span>
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
              <span>📱 অ্যাপে ফিরুন</span>
            </button>
          )}
          <a
            href="/api/download-project"
            download="fun-hub-full-source.zip"
            className="flex px-3 py-1.5 rounded-lg bg-pink-500/15 hover:bg-pink-500/25 border border-pink-500/30 text-xs font-semibold text-pink-300 items-center gap-1.5 transition-colors cursor-pointer"
            title="সম্পূর্ণ প্রোজেক্ট কোড ডাউনলোড করুন"
          >
            <Download className="w-3.5 h-3.5" />
            <span>ডাউনলোড ZIP</span>
          </a>
          <button
            onClick={handleLogout}
            className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-xs font-medium text-red-400 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>লগআউট</span>
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
                  অ্যাডমিন পাসওয়ার্ড পরিবর্তন করুন
                </h3>
              </div>
              <p className="text-xs text-[#8f93ad]">
                পাসওয়ার্ড পরিবর্তন করার সাথে সাথে অন্য সকল ডিভাইসে চালু থাকা সেশনগুলো স্বয়ংক্রিয়ভাবে বাতিল হয়ে যাবে।
              </p>

              <form onSubmit={handleChangePassword} className="space-y-3.5 max-w-lg">
                <div>
                  <label className="text-xs text-[#8f93ad] block mb-1">
                    বর্তমান পাসওয়ার্ড
                  </label>
                  <div className="relative">
                    <input
                      type={showPw ? "text" : "password"}
                      value={currentPw}
                      onChange={(e) => setCurrentPw(e.target.value)}
                      placeholder="বর্তমান পাসওয়ার্ড লিখুন..."
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
                    নতুন শক্তিশালী পাসওয়ার্ড (কমপক্ষে ৮ অক্ষর)
                  </label>
                  <input
                    type={showPw ? "text" : "password"}
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    placeholder="নতুন পাসওয়ার্ড দিন..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0f1016] border border-[#33354a] text-sm text-white focus:border-pink-500 outline-none"
                  />

                  {/* Password strength meter */}
                  {newPw && (
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-[#8f93ad]">পাসওয়ার্ড শক্তি:</span>
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
                    নতুন পাসওয়ার্ড নিশ্চিতকরণ
                  </label>
                  <input
                    type={showPw ? "text" : "password"}
                    value={confirmPw}
                    onChange={(e) => setConfirmPw(e.target.value)}
                    placeholder="নতুন পাসওয়ার্ডটি আবার লিখুন..."
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
                  {isChangingPw ? "সংরক্ষণ হচ্ছে..." : "🔒 নতুন পাসওয়ার্ড সংরক্ষণ করুন"}
                </button>
              </form>
            </div>

            {/* Telegram User ID Lock (Device / Account whitelist) */}
            <div className="p-5 rounded-2xl bg-[#1a1b26] border border-[#33354a] space-y-4">
              <div className="flex items-center justify-between border-b border-[#33354a] pb-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-pink-400" />
                  <h3 className="text-sm font-bold text-white">
                    টেলিগ্রাম আইডি সুরক্ষা (Telegram ID Lock)
                  </h3>
                </div>
                {authStatus?.adminTelegramId ? (
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-green-500/15 text-green-400 border border-green-500/30 flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    <span>লক সক্রিয়</span>
                  </span>
                ) : (
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    লক নিষ্ক্রিয় (পাসওয়ার্ড দিয়ে যে কেউ)
                  </span>
                )}
              </div>

              <p className="text-xs text-[#8f93ad] leading-relaxed">
                আপনার ব্যক্তিগত টেলিগ্রাম ইউজার আইডি দিয়ে অ্যাডমিন লক করে দিলে, অন্য কেউ পাসওয়ার্ড জানলেও 
                লগইন করতে পারবে না। শুধুমাত্র আপনার নির্দিষ্ট টেলিগ্রাম অ্যাকাউন্ট দিয়েই এই অ্যাডমিন প্যানেলে প্রবেশ সম্ভব।
              </p>

              {/* Detected Telegram user */}
              {currentTgUser && (
                <div className="p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-xs text-purple-300 font-semibold block">
                      শনাক্তকৃত বর্তমান টেলিগ্রাম অ্যাকাউন্ট:
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
                      <span>🔒 এই আইডিতে লক করুন</span>
                    </button>
                  ) : (
                    <span className="px-3 py-1.5 rounded-lg bg-green-500/20 text-green-300 text-xs font-bold border border-green-500/40">
                      ✅ আপনার আইডি বর্তমানে লক করা আছে
                    </span>
                  )}
                </div>
              )}

              {/* Manual Input and Configured ID Display */}
              <div className="space-y-2 max-w-lg">
                <label className="text-xs text-[#8f93ad] block">
                  নির্ধারিত অ্যাডমিন টেলিগ্রাম আইডি (White-listed Telegram ID):
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={telegramIdInput}
                    onChange={(e) => setTelegramIdInput(e.target.value)}
                    placeholder={
                      authStatus?.adminTelegramId
                        ? String(authStatus.adminTelegramId)
                        : "যেমন: 123456789"
                    }
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#0f1016] border border-[#33354a] text-sm text-white focus:border-pink-500 outline-none font-mono"
                  />
                  <button
                    type="button"
                    disabled={isSavingTelegramId}
                    onClick={() => handleSetTelegramId(telegramIdInput)}
                    className="px-4 py-2.5 rounded-xl bg-[#2b2d42] hover:bg-[#383a54] border border-[#44476a] text-xs font-bold text-white transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                  >
                    {isSavingTelegramId ? "..." : "সেভ"}
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
                      title="লক রিমুভ করুন"
                    >
                      লক তুলুন
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
                সেশন ও ডিভাইস কন্ট্রোল
              </h3>
              <p className="text-xs text-[#8f93ad] leading-relaxed">
                যদি আপনার মনে হয় অন্য কোনো ব্রাউজার বা ডিভাইসে অ্যাডমিন অ্যাকাউন্ট ওপেন রাখা আছে, তবে নিচের বাটন চেপে এক ক্লিকে অন্য সব সেশন বাতিল করতে পারবেন।
              </p>

              <button
                onClick={handleRevokeAllSessions}
                className="px-4 py-2 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 hover:bg-red-500/25 text-xs font-bold transition-colors cursor-pointer"
              >
                🚪 অন্য সকল ডিভাইস থেকে লগআউট করুন (Revoke All Sessions)
              </button>
            </div>

            {/* Project Backup & Full Source Code Download */}
            <div className="p-5 rounded-2xl bg-gradient-to-br from-[#1a1b26] to-[#20152e] border border-pink-500/30 space-y-4 shadow-xl">
              <div className="flex items-center gap-2 border-b border-[#33354a] pb-3">
                <Download className="w-5 h-5 text-pink-400" />
                <div>
                  <h3 className="text-sm font-bold text-white">
                    📦 সম্পূর্ণ প্রোজেক্ট ডাউনলোড ও ব্যাকআপ (Backup & Source Code)
                  </h3>
                  <p className="text-xs text-[#8f93ad]">
                    আপনার অ্যাপের সম্পূর্ণ কোডবেস এবং কনফিগারেশন কম্পিউটারে সংরক্ষণ করুন
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
                      সম্পূর্ণ সোর্স কোড (ZIP)
                    </span>
                    <span className="text-[10px] bg-black/30 px-2 py-0.5 rounded-full font-mono">
                      ~1 MB
                    </span>
                  </div>
                  <span className="text-xs text-pink-100/80 leading-snug">
                    React + Vite + Express + Tailwind + সম্পূর্ণ টাইপস্ক্রিপ্ট সোর্স কোড
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
                      স্ট্যান্ডঅ্যালন সার্ভার (ZIP)
                    </span>
                    <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded-full font-mono">
                      Zero-dep
                    </span>
                  </div>
                  <span className="text-xs text-[#a5a9c5] leading-snug">
                    কোনো এক্সটার্নাল প্যাকেজ ছাড়াই যেকোনো সার্ভারে শুধু node server.js দিয়ে চলবে
                  </span>
                </a>
              </div>

              <div className="p-3 rounded-xl bg-black/30 border border-white/5 text-[11px] text-[#8f93ad] space-y-1">
                <strong className="text-white block font-semibold">💡 কম্পিউটারে রান করার নিয়ম:</strong>
                <div>১. জিপ ফাইলটি আনজিপ করুন</div>
                <div>২. টার্মিনালে <code className="text-pink-400 bg-pink-500/10 px-1 rounded">npm install</code> রান করুন</div>
                <div>৩. এরপর <code className="text-pink-400 bg-pink-500/10 px-1 rounded">npm run dev</code> রান করলেই লোকালহোস্টে চালু হবে!</div>
              </div>
            </div>

            {/* Security Audit Checklist */}
            <div className="p-5 rounded-2xl bg-[#1a1b26] border border-[#33354a] space-y-3">
              <h3 className="text-sm font-bold text-white border-b border-[#33354a] pb-2">
                🛡️ সক্রিয় নিরাপত্তা সুরক্ষা ব্যবস্থা
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-[#0f1016] border border-[#33354a] flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white block">PBKDF2 ক্রিপ্টোগ্রাফিক হ্যাশিং</strong>
                    <span className="text-[#8f93ad]">
                      ১,০০,০০০ রাউন্ড সহ র্যান্ডম ৩২-বাইট সল্ট (SHA-512)
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#0f1016] border border-[#33354a] flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white block">ব্রুট-ফোর্স অ্যান্টি-হ্যাক লকআউট</strong>
                    <span className="text-[#8f93ad]">
                      ৫ বার ভুল হলে ৩ মিনিট এবং ১০ বারে ১ ঘণ্টা আইপি লক
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#0f1016] border border-[#33354a] flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white block">ম্যাজিক বাইট সিগনেচার যাচাই</strong>
                    <span className="text-[#8f93ad]">
                      আপলোডকৃত প্রতিটি ফাইলের অভ্যন্তরীণ বাফার সিগনেচার ভ্যালিডেশন
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#0f1016] border border-[#33354a] flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white block">কনটেন্ট সিকিউরিটি পলিসি (CSP)</strong>
                    <span className="text-[#8f93ad]">
                      আপলোড ফোল্ডারে স্ক্রিপ্ট এক্সিকিউশন সম্পূর্ণ ব্লক (Sandbox)
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
                <span>অ্যাপ আইডেন্টিটি</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-[#8f93ad] block mb-1">
                    অ্যাপের নাম
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
                    লোগো বা ইমোজি
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
                    ডানদিকের ব্যাজ লেবেল (খালি রাখলে লুকাবে)
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
                    সার্চ বক্সের প্লেসহোল্ডার
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
                  স্বাগত ব্যানার বার্তা (খালি রাখলে লুকাবে)
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
                  ভিডিও না পেলে যে লেখা দেখাবে
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
                <span>রঙের থিম (Color Palette)</span>
                <span className="text-xs text-[#8f93ad] font-normal">
                  মিনি অ্যাপের সাথে রিয়েল-টাইমে সিঙ্ক হয়
                </span>
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                {[
                  { key: "bg", label: "ব্যাকগ্রাউন্ড" },
                  { key: "card", label: "কার্ড ও হেডার" },
                  { key: "line", label: "বর্ডার লাইন" },
                  { key: "text", label: "মূল লেখা" },
                  { key: "mute", label: "হালকা টেক্সট" },
                  { key: "accent1", label: "অ্যাকসেন্ট ১ (গোলাপী)" },
                  { key: "accent2", label: "অ্যাকসেন্ট ২ (বেগুনী)" },
                  { key: "gold", label: "লক ও গোল্ড" },
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
              টেলিগ্রাম মিনি অ্যাপের নিচের মেনু বার কাস্টমাইজ করুন। প্রতিটি ট্যাবের আইকন ও কনটেন্ট সাজান।
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
                      মেনুর নাম
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
                      আইকন (ইমোজি)
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
                      মেনুর ধরন
                    </label>
                    <select
                      value={tab.type}
                      onChange={(e) => updateConfigValue(`tabs.${idx}.type`, e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#0f1016] border border-[#33354a] text-sm text-white outline-none focus:border-pink-500 cursor-pointer"
                    >
                      <option value="videos">ভিডিও ফিড (Videos)</option>
                      <option value="links">লিংক তালিকা (Telegram Links)</option>
                      <option value="page">লেখার পেজ (Rich Text Page)</option>
                    </select>
                  </div>
                </div>

                {tab.type === "links" && (
                  <div className="space-y-3 pt-2">
                    <div>
                      <label className="text-xs text-[#8f93ad] block mb-1">
                        পেজের শিরোনাম
                      </label>
                      <input
                        type="text"
                        value={tab.title || ""}
                        onChange={(e) => updateConfigValue(`tabs.${idx}.title`, e.target.value)}
                        placeholder="যেমন: টেলিগ্রাম কমিউনিটি সমূহ"
                        className="w-full px-3 py-2 rounded-xl bg-[#0f1016] border border-[#33354a] text-sm text-white outline-none focus:border-pink-500"
                      />
                    </div>

                    <div className="space-y-2">
                      <span className="text-xs font-semibold text-[#8f93ad] block">
                        লিংক আইটেম সমূহ:
                      </span>
                      {(tab.items || []).map((it, itemIdx) => (
                        <div
                          key={itemIdx}
                          className="p-3 rounded-xl bg-[#0f1016] border-l-2 border-l-pink-500 border border-[#33354a] space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-[#8f93ad]">
                              লিংক #{itemIdx + 1}
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
                              মুছুন
                            </button>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <input
                              type="text"
                              value={it.title}
                              placeholder="শিরোনাম"
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
                              placeholder="বাটন টেক্সট (যেমন: জয়েন)"
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
                              title: "নতুন টেলিগ্রাম গ্রুপ",
                              url: "https://t.me/",
                              button: "জয়েন",
                            });
                            return copy;
                          });
                        }}
                        className="w-full py-2 rounded-xl border border-dashed border-pink-500/50 text-pink-400 text-xs font-medium hover:bg-pink-500/10 cursor-pointer flex items-center justify-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>+ নতুন লিংক যোগ করুন</span>
                      </button>
                    </div>
                  </div>
                )}

                {tab.type === "page" && (
                  <div className="space-y-3 pt-2">
                    <div>
                      <label className="text-xs text-[#8f93ad] block mb-1">
                        পেজের শিরোনাম
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
                        পেজের বিস্তারিত লেখা
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
                    label: "নতুন মেনু",
                    icon: "⭐",
                    type: "page",
                    title: "নতুন পেজ",
                    text: "এখানে আপনার বিবরণ লিখুন।",
                  });
                  return copy;
                });
              }}
              className="w-full py-3 rounded-2xl border border-dashed border-pink-500 text-pink-400 text-sm font-semibold hover:bg-pink-500/10 transition-colors cursor-pointer flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>+ নতুন মেনু ট্যাব তৈরি করুন</span>
            </button>
          </div>
        )}

        {/* 3. CATEGORIES */}
        {activeSection === "cats" && (
          <div className="p-5 rounded-2xl bg-[#1a1b26] border border-[#33354a] space-y-4">
            <h3 className="text-sm font-bold text-white border-b border-[#33354a] pb-2">
              ক্যাটাগরি ম্যানেজমেন্ট
            </h3>
            <p className="text-xs text-[#8f93ad]">
              প্রথম ক্যাটাগরিটি সব সময় "সবগুলো" (Default All)। কোনো ক্যাটাগরি রিনেম করলে বিদ্যমান সব ভিডিও স্বয়ংক্রিয়ভাবে আপডেট হবে।
            </p>

            <div className="space-y-2.5">
              {(cfg.categories || []).map((cat, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 p-2 rounded-xl bg-[#0f1016] border border-[#33354a]"
                >
                  <span className="w-6 text-center text-xs text-[#8f93ad] font-mono">
                    {idx === 0 ? "★" : idx}
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
                    <span className="text-xs text-[#8f93ad] px-2">(প্রধান)</span>
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={() => {
                markDirty();
                setCfg((c) => {
                  const copy = JSON.parse(JSON.stringify(c));
                  copy.categories.push("নতুন ক্যাটাগরি");
                  return copy;
                });
              }}
              className="w-full py-2.5 rounded-xl border border-dashed border-pink-500 text-pink-400 text-xs font-semibold hover:bg-pink-500/10 transition-colors cursor-pointer flex items-center justify-center gap-1"
            >
              <Plus className="w-4 h-4" />
              <span>+ নতুন ক্যাটাগরি যোগ করুন</span>
            </button>
          </div>
        )}

        {/* 4. VIDEOS */}
        {activeSection === "videos" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-[#8f93ad]">
                মোট ভিডিও: <span className="text-white font-bold">{cfg.videos?.length || 0}</span> টি
              </p>
              <button
                onClick={() => {
                  markDirty();
                  setCfg((c) => {
                    const copy = JSON.parse(JSON.stringify(c));
                    copy.videos.push({
                      id: "v" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
                      title: "নতুন আকর্ষণীয় ভিডিও",
                      cat: copy.categories[1] || copy.categories[0] || "ফানি",
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
                <span>নতুন ভিডিও যোগ করুন</span>
              </button>
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
                        ভিডিওর শিরোনাম
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
                        ক্যাটাগরি
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
                        সময় (MM:SS)
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
                        বিজ্ঞাপন সংখ্যা (০ = ফ্রি)
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
                        ভিউ (শুরুর সংখ্যা)
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
                        লাইক (শুরুর সংখ্যা)
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
                    <label className="text-xs text-[#8f93ad] block">
                      ভিডিও ফাইল লিংক (mp4 লিংক বা নিরাপদ আপলোড)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={video.src}
                        onChange={(e) => updateConfigValue(`videos.${idx}.src`, e.target.value)}
                        placeholder="https://... অথবা আপলোড করুন"
                        className="flex-1 px-3 py-2 rounded-xl bg-[#1a1b26] border border-[#33354a] text-xs text-white outline-none"
                      />
                      <label className="px-3 py-2 rounded-xl bg-[#262838] border border-[#33354a] hover:bg-white/10 text-xs font-semibold text-white cursor-pointer flex items-center gap-1.5 shrink-0">
                        <Upload className="w-3.5 h-3.5" />
                        <span>আপলোড</span>
                        <input
                          type="file"
                          accept="video/mp4,video/webm,video/quicktime"
                          hidden
                          onChange={(e) => handleFileUpload(e, idx, "src")}
                        />
                      </label>
                    </div>
                    {srcProg && (
                      <p className="text-xs font-mono text-pink-400">{srcProg}</p>
                    )}
                  </div>

                  {/* Thumbnail Source & Upload */}
                  <div className="p-3 rounded-xl bg-[#0f1016] border border-[#33354a] space-y-2">
                    <label className="text-xs text-[#8f93ad] block">
                      থাম্বনেইল লিংক বা ছবি আপলোড
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={video.thumb}
                        onChange={(e) => updateConfigValue(`videos.${idx}.thumb`, e.target.value)}
                        placeholder="https://... অথবা ছবি আপলোড করুন"
                        className="flex-1 px-3 py-2 rounded-xl bg-[#1a1b26] border border-[#33354a] text-xs text-white outline-none"
                      />
                      <label className="px-3 py-2 rounded-xl bg-[#262838] border border-[#33354a] hover:bg-white/10 text-xs font-semibold text-white cursor-pointer flex items-center gap-1.5 shrink-0">
                        <ImageIcon className="w-3.5 h-3.5" />
                        <span>ছবি আপলোড</span>
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
                    {video.thumb && (
                      <div className="mt-2">
                        <img
                          src={video.thumb}
                          alt="preview"
                          className="h-16 rounded-lg object-cover border border-[#33354a]"
                        />
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
                    title: "নতুন ভিডিও",
                    cat: copy.categories[1] || copy.categories[0] || "ফানি",
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
              <span>+ নতুন ভিডিও যোগ করুন</span>
            </button>
          </div>
        )}

        {/* 5. ADS CONFIG */}
        {activeSection === "ads" && (
          <div className="p-5 rounded-2xl bg-[#1a1b26] border border-[#33354a] space-y-4">
            <h3 className="text-sm font-bold text-white border-b border-[#33354a] pb-2">
              বিজ্ঞাপন ও মনিটাইজেশন কনফিগারেশন
            </h3>
            <p className="text-xs text-[#8f93ad]">
              ভিডিও আনলক করতে ইউজার কয়টি বিজ্ঞাপন দেখবে তা ঠিক করুন। প্রতিটি ভিডিওতে আলাদা করে বিজ্ঞাপনের সংখ্যা নির্ধারণ করতে পারবেন।
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-[#8f93ad] block mb-1">
                  বিজ্ঞাপনের ধরন (Ad Provider)
                </label>
                <select
                  value={cfg.ads.provider}
                  onChange={(e) => updateConfigValue("ads.provider", e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#0f1016] border border-[#33354a] text-sm text-white outline-none cursor-pointer"
                >
                  <option value="demo">ডেমো কাউন্টডাউন টাইমার (Demo)</option>
                  <option value="adsgram">Adsgram (টেলিগ্রাম আসল বিজ্ঞাপন)</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-[#8f93ad] block mb-1">
                  Adsgram Block ID (যদি Adsgram ব্যবহার করেন)
                </label>
                <input
                  type="text"
                  value={cfg.ads.blockId}
                  placeholder="যেমন: 1234"
                  onChange={(e) => updateConfigValue("ads.blockId", e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#0f1016] border border-[#33354a] text-sm text-white outline-none"
                />
              </div>

              <div>
                <label className="text-xs text-[#8f93ad] block mb-1">
                  ডেমো বিজ্ঞাপনের সময় (সেকেন্ড)
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
                  লক ব্যাজের লেখা (যেমন: Ads)
                </label>
                <input
                  type="text"
                  value={cfg.ads.lockedLabel}
                  onChange={(e) => updateConfigValue("ads.lockedLabel", e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#0f1016] border border-[#33354a] text-sm text-white outline-none"
                />
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <div>
                <label className="text-xs text-[#8f93ad] block mb-1">
                  আনলক পপআপের শিরোনাম
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
                  আনলক পপআপের টেক্সট (<span className="text-pink-400 font-mono">{"{n}"}</span> = বাকি বিজ্ঞাপনের সংখ্যা)
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
                    বিজ্ঞাপন দেখার বাটনের লেখা
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
                    বাতিল বাটনের লেখা
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
              <span>💾 পরিবর্তন সেভ করুন</span>
            </button>
            {isDirty && (
              <span className="hidden sm:inline text-xs text-amber-400 font-medium">
                ● সেভ করা বাকি
              </span>
            )}
          </div>

          <div>
            {saveStatus && (
              <span
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border ${
                  saveStatus.startsWith("✅")
                    ? "bg-green-500/10 text-green-400 border-green-500/30"
                    : saveStatus.startsWith("❌")
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
    </div>
  );
};
