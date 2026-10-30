import React, { useState, useEffect } from "react";
import { AppConfig } from "./types";
import { TelegramSimulator } from "./components/TelegramSimulator";
import { AdminPanel } from "./components/AdminPanel";
import { DeployGuide } from "./components/DeployGuide";
import {
  Smartphone,
  Settings,
  BookOpen,
  Download,
  ExternalLink,
  Sparkles,
  RefreshCw,
  Maximize2,
  Minimize2,
  Lock,
} from "lucide-react";

export const App: React.FC = () => {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<"simulator" | "admin" | "guide">("simulator");
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Check if inside real Telegram WebApp
  const isRealTelegram = !!(
    typeof window !== "undefined" &&
    ((window as any).Telegram?.WebApp?.initData ||
      (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.id ||
      (window as any).TelegramWebviewProxy ||
      (window as any).Telegram?.WebApp?.platform)
  );

  const [isAdminUser, setIsAdminUser] = useState<boolean>(!isRealTelegram);

  const checkAdminAccess = async () => {
    try {
      const tgId = (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.id || "";
      const res = await fetch(`/api/check-admin-access?tgId=${encodeURIComponent(tgId)}`);
      if (res.ok) {
        const data = await res.json();
        if (isRealTelegram) {
          setIsAdminUser(!!data.allowed);
        } else {
          setIsAdminUser(true);
        }
      }
    } catch {
      if (!isRealTelegram) setIsAdminUser(true);
    }
  };

  const fetchConfig = async () => {
    try {
      const res = await fetch("/api/config");
      if (!res.ok) throw new Error("কনফিগ লোড করা যায়নি");
      const data = await res.json();
      setConfig(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || "নেটওয়ার্ক সমস্যা");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
    checkAdminAccess();
  }, []);

  // Handle URL hash, query params, or Telegram start_param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tgStart = (window as any).Telegram?.WebApp?.initDataUnsafe?.start_param;
    const wantsAdmin =
      window.location.pathname.startsWith("/admin") ||
      window.location.hash === "#admin" ||
      params.get("view") === "admin" ||
      params.get("admin") === "1" ||
      tgStart === "admin";

    if (wantsAdmin) {
      if (!isRealTelegram || isAdminUser) {
        setActiveView("admin");
      }
    }
  }, [isAdminUser, isRealTelegram]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#14061f] flex flex-col items-center justify-center text-white p-4">
        <div className="w-12 h-12 rounded-full border-4 border-pink-500 border-t-transparent animate-spin mb-4" />
        <h2 className="text-lg font-bold text-pink-400">ফান হাব লোড হচ্ছে...</h2>
        <p className="text-xs text-[#a58bb8] mt-1">অনুগ্রহ করে অপেক্ষা করুন</p>
      </div>
    );
  }

  if (error || !config) {
    return (
      <div className="min-h-screen bg-[#14061f] flex flex-col items-center justify-center text-white p-4 text-center">
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 max-w-md">
          <h2 className="text-lg font-bold text-red-400 mb-2">সমস্যা দেখা দিয়েছে</h2>
          <p className="text-xs text-[#a58bb8] mb-4">{error}</p>
          <button
            onClick={() => {
              setLoading(true);
              fetchConfig();
            }}
            className="px-4 py-2 rounded-xl bg-pink-600 text-white text-xs font-semibold hover:bg-pink-500 cursor-pointer"
          >
            পুনরায় চেষ্টা করুন
          </button>
        </div>
      </div>
    );
  }

  // If inside real Telegram WebApp
  if (isRealTelegram) {
    if (activeView === "admin") {
      // If user is not authorized, don't show admin screen; keep in mini app
      if (!isAdminUser) {
        return (
          <TelegramSimulator
            config={config}
            isFullscreen={true}
            onRefreshConfig={fetchConfig}
            isAdmin={false}
          />
        );
      }

      return (
        <div className="min-h-screen bg-[#0e0a16] text-[#eceef8] pt-[env(safe-area-inset-top,0px)] pb-[calc(70px+env(safe-area-inset-bottom,0px))]">
          <AdminPanel
            currentConfig={config}
            onConfigUpdated={(newCfg) => setConfig(newCfg)}
            onBackToApp={() => setActiveView("simulator")}
            isTelegram={true}
          />
        </div>
      );
    }

    return (
      <TelegramSimulator
        config={config}
        isFullscreen={true}
        onRefreshConfig={fetchConfig}
        onOpenAdmin={() => setActiveView("admin")}
        isAdmin={isAdminUser}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#0e0a16] text-[#f3e9fb] flex flex-col font-sans">
      {/* Top Application Bar */}
      <header className="sticky top-0 z-50 bg-[#160d24]/90 backdrop-blur-md border-b border-[#3b194f] px-3 sm:px-6 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-pink-500 text-xl font-black">
              {config.logo || "♥"}
            </span>
            <span className="font-bold text-base sm:text-lg tracking-tight bg-gradient-to-r from-pink-400 to-purple-400 bg-clip-text text-transparent">
              {config.appName || "ফান হাব"}
            </span>
          </div>

          <span className="hidden md:inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-pink-500/10 text-pink-300 border border-pink-500/30">
            টেলিগ্রাম মিনি অ্যাপ + অ্যাডমিন
          </span>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-1 sm:gap-1.5 p-1 rounded-xl bg-[#231238] border border-[#3b194f]">
          <button
            onClick={() => setActiveView("simulator")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeView === "simulator"
                ? "bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-sm"
                : "text-[#a58bb8] hover:text-white"
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">মিনি অ্যাপ</span>
          </button>

          <button
            onClick={() => setActiveView("admin")}
            className={`p-2 sm:px-3 sm:py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeView === "admin"
                ? "bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-sm"
                : "text-[#a58bb8] hover:text-white"
            }`}
            title="লগইন"
          >
            <Lock className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setActiveView("guide")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeView === "guide"
                ? "bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-sm"
                : "text-[#a58bb8] hover:text-white"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">ডিপ্লয় গাইড</span>
          </button>
        </div>

        {/* Right Quick Actions */}
        <div className="flex items-center gap-2">
          {activeView === "simulator" && (
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Preview"}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#231238] border border-[#3b194f] text-xs font-medium text-white/80 hover:text-white transition-colors cursor-pointer"
            >
              {isFullscreen ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5" />
                  <span>ফ্রেম ভিউ</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>ফুলস্ক্রিন</span>
                </>
              )}
            </button>
          )}

          <a
            href="/api/download-zip"
            download="fun-hub-standalone.zip"
            title="Download Standalone Node.js zip"
            className="p-1.5 sm:px-3 sm:py-1.5 rounded-lg bg-pink-500/10 hover:bg-pink-500/20 border border-pink-500/30 text-pink-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden md:inline">জিপ ডাউনলোড</span>
          </a>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col">
        {activeView === "simulator" && (
          <div className="flex-1 flex items-center justify-center">
            <TelegramSimulator
              config={config}
              isFullscreen={isFullscreen}
              onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
              onRefreshConfig={fetchConfig}
              onOpenAdmin={() => setActiveView("admin")}
              isAdmin={isAdminUser}
            />
          </div>
        )}

        {activeView === "admin" && (
          <AdminPanel
            currentConfig={config}
            onConfigUpdated={(newCfg) => setConfig(newCfg)}
            onBackToApp={() => setActiveView("simulator")}
            isTelegram={isRealTelegram}
          />
        )}

        {activeView === "guide" && <DeployGuide />}
      </main>
    </div>
  );
};

export default App;
