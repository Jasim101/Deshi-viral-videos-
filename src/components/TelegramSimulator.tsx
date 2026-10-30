import React, { useState, useEffect, useRef } from "react";
import { AppConfig, VideoItem } from "../types";
import {
  Play,
  Lock,
  Heart,
  Eye,
  Search,
  ExternalLink,
  X,
  Volume2,
  Clock,
  Sparkles,
  Smartphone,
  Maximize2,
  Minimize2,
  RotateCcw,
  Settings,
} from "lucide-react";

interface TelegramSimulatorProps {
  config: AppConfig;
  onRefreshConfig?: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onOpenAdmin?: () => void;
  isAdmin?: boolean;
}

export const TelegramSimulator: React.FC<TelegramSimulatorProps> = ({
  config,
  isFullscreen = false,
  onToggleFullscreen,
  onOpenAdmin,
  isAdmin = false,
}) => {
  const [activeTab, setActiveTab] = useState(0);
  const [activeCat, setActiveCat] = useState(config.categories?.[0] || "সবগুলো");
  const [searchQuery, setSearchQuery] = useState("");
  const [unlockedVideos, setUnlockedVideos] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem("unl") || "{}");
    } catch {
      return {};
    }
  });
  const [likedVideos, setLikedVideos] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem("liked") || "{}");
    } catch {
      return {};
    }
  });
  const [adProgress, setAdProgress] = useState<Record<string, number>>({});
  const lastTapRef = useRef<number>(0);
  const [logoTapCount, setLogoTapCount] = useState(0);
  const [modalState, setModalState] = useState<{
    type: "none" | "ad_prompt" | "ad_playing" | "video_player";
    video?: VideoItem;
    countdown?: number;
  }>({ type: "none" });

  const handleLogoTap = () => {
    // Discreet multi-tap gesture: 5 taps within 2.5s only opens if user is authorized admin
    const now = Date.now();
    if (now - lastTapRef.current > 2500) {
      setLogoTapCount(1);
    } else {
      const next = logoTapCount + 1;
      setLogoTapCount(next);
      if (next >= 5) {
        setLogoTapCount(0);
        if (isAdmin && onOpenAdmin) {
          onOpenAdmin();
        }
      }
    }
    lastTapRef.current = now;
  };

  const currentTab = config.tabs?.[activeTab] || config.tabs?.[0];

  useEffect(() => {
    if (config.categories && !config.categories.includes(activeCat)) {
      setActiveCat(config.categories[0] || "সবগুলো");
    }
  }, [config.categories]);

  const recordStat = async (id: string, type: "view" | "like") => {
    try {
      await fetch("/api/stat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, type }),
      });
    } catch (e) {
      // ignore
    }
  };

  const getRemainingAds = (video: VideoItem) => {
    const required = Number(video.ads) || 0;
    const watched = adProgress[video.id] || 0;
    return Math.max(0, required - watched);
  };

  const isVideoUnlocked = (video: VideoItem) => {
    const required = Number(video.ads) || 0;
    return required === 0 || !!unlockedVideos[video.id];
  };

  const handleLike = (e: React.MouseEvent, video: VideoItem) => {
    e.stopPropagation();
    if (likedVideos[video.id]) return;
    const newLiked = { ...likedVideos, [video.id]: true };
    setLikedVideos(newLiked);
    try {
      localStorage.setItem("liked", JSON.stringify(newLiked));
    } catch {}
    video.likes = (video.likes || 0) + 1;
    recordStat(video.id, "like");
  };

  const handleVideoClick = (video: VideoItem) => {
    if (isVideoUnlocked(video)) {
      playVideo(video);
    } else {
      setModalState({ type: "ad_prompt", video });
    }
  };

  const playVideo = (video: VideoItem) => {
    video.views = (video.views || 0) + 1;
    recordStat(video.id, "view");
    setModalState({ type: "video_player", video });
  };

  const startWatchingAd = (video: VideoItem) => {
    const seconds = config.ads?.demoSeconds || 5;
    setModalState({ type: "ad_playing", video, countdown: seconds });

    let remaining = seconds;
    const timer = setInterval(() => {
      remaining -= 1;
      setModalState((prev) => {
        if (prev.type === "ad_playing" && prev.video?.id === video.id) {
          if (remaining <= 0) {
            clearInterval(timer);
            // Completed ad
            setTimeout(() => completeAd(video), 100);
            return { ...prev, countdown: 0 };
          }
          return { ...prev, countdown: remaining };
        }
        clearInterval(timer);
        return prev;
      });
    }, 1000);
  };

  const completeAd = (video: VideoItem) => {
    const currentProg = (adProgress[video.id] || 0) + 1;
    const newProg = { ...adProgress, [video.id]: currentProg };
    setAdProgress(newProg);

    const required = Number(video.ads) || 0;
    if (required - currentProg <= 0) {
      const newUnlocked = { ...unlockedVideos, [video.id]: true };
      setUnlockedVideos(newUnlocked);
      try {
        localStorage.setItem("unl", JSON.stringify(newUnlocked));
      } catch {}
      playVideo(video);
    } else {
      setModalState({ type: "ad_prompt", video });
    }
  };

  const closeModal = () => {
    setModalState({ type: "none" });
  };

  const resetAllProgress = () => {
    if (confirm("সমস্ত আনলক ও লাইকের লোকাল প্রগ্রেস রিসেট করতে চান?")) {
      localStorage.removeItem("unl");
      localStorage.removeItem("liked");
      setUnlockedVideos({});
      setLikedVideos({});
      setAdProgress({});
    }
  };

  const filteredVideos = (config.videos || []).filter((v) => {
    const matchesCat = activeCat === config.categories?.[0] || v.cat === activeCat;
    const matchesSearch =
      !searchQuery.trim() ||
      v.title.toLowerCase().includes(searchQuery.trim().toLowerCase());
    return matchesCat && matchesSearch;
  });

  const theme = config.theme || {
    bg: "#14061f",
    card: "#1f0b31",
    line: "#4a2060",
    text: "#f3e9fb",
    mute: "#a58bb8",
    accent1: "#ec2b8a",
    accent2: "#b02bec",
    gold: "#f5b94a",
  };

  const content = (
    <div
      className="flex flex-col h-full overflow-hidden select-none"
      style={{
        backgroundColor: theme.bg,
        color: theme.text,
        fontFamily: 'system-ui, "Noto Sans Bengali", sans-serif',
      }}
    >
      {/* Telegram App Header Bar */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0 border-b z-10 transition-colors"
        style={{ backgroundColor: theme.card, borderColor: theme.line }}
      >
        <div
          className="flex items-center gap-2 cursor-pointer select-none active:scale-95 transition-transform"
          onClick={handleLogoTap}
          title={config.appName || "ফান হাব"}
        >
          <span
            className="text-xl font-bold flex items-center gap-1.5"
            style={{ color: theme.accent1 }}
          >
            <span>{config.logo || "♥"}</span>
            <span>{config.appName || "ফান হাব"}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && onOpenAdmin && (
            <button
              onClick={onOpenAdmin}
              className="p-1.5 rounded-full border flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow-sm hover:opacity-90"
              style={{
                color: "#ff80bf",
                backgroundColor: "rgba(236, 72, 153, 0.15)",
                borderColor: "rgba(236, 72, 153, 0.4)",
              }}
              title="লগইন"
            >
              <Lock className="w-3.5 h-3.5 text-pink-400" />
            </button>
          )}

          {config.premiumLabel && (
            <div
              className="text-xs font-semibold px-2.5 py-1 rounded-full border flex items-center gap-1 select-none"
              style={{
                color: theme.gold,
                backgroundColor: `${theme.gold}18`,
                borderColor: `${theme.gold}40`,
              }}
            >
              <Sparkles className="w-3 h-3" />
              <span>{config.premiumLabel}</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Tab Content Area */}
      <div className="flex-1 overflow-y-auto pb-20 custom-scroll">
        {currentTab?.type === "videos" && (
          <div className="p-4 space-y-4">
            {/* Notice Banner */}
            {config.notice && (
              <div
                className="p-3 rounded-2xl border text-sm flex items-start gap-2.5 shadow-sm"
                style={{
                  backgroundColor: theme.card,
                  borderColor: theme.line,
                  color: theme.text,
                }}
              >
                <div className="shrink-0 text-base">📢</div>
                <div className="leading-snug">{config.notice}</div>
              </div>
            )}

            {/* Search Bar */}
            <div
              className="flex items-center px-4 py-2.5 rounded-full border transition-all focus-within:ring-2"
              style={{
                backgroundColor: theme.card,
                borderColor: theme.line,
              }}
            >
              <input
                type="text"
                placeholder={config.searchPlaceholder || "ভিডিও খুঁজুন..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent border-0 outline-none text-sm placeholder:opacity-50"
                style={{ color: theme.text }}
              />
              <Search className="w-4 h-4 ml-2 opacity-60 shrink-0" />
            </div>

            {/* Category Chips */}
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {(config.categories || []).map((catName) => {
                const isActive = activeCat === catName;
                return (
                  <button
                    key={catName}
                    onClick={() => setActiveCat(catName)}
                    className="px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all border shrink-0 cursor-pointer"
                    style={{
                      background: isActive
                        ? `linear-gradient(90deg, ${theme.accent1}, ${theme.accent2})`
                        : "transparent",
                      color: isActive ? "#ffffff" : theme.mute,
                      borderColor: isActive ? "transparent" : theme.line,
                      boxShadow: isActive ? `0 4px 12px ${theme.accent1}40` : "none",
                    }}
                  >
                    {catName}
                  </button>
                );
              })}
            </div>

            {/* Video Cards Grid */}
            <div className="space-y-4 pt-1">
              {filteredVideos.length === 0 ? (
                <div
                  className="py-12 text-center text-sm font-medium"
                  style={{ color: theme.mute }}
                >
                  {config.emptyText || "কোনো ভিডিও পাওয়া যায়নি"}
                </div>
              ) : (
                filteredVideos.map((video) => {
                  const unlocked = isVideoUnlocked(video);
                  const remaining = getRemainingAds(video);
                  const isLiked = !!likedVideos[video.id];

                  return (
                    <div
                      key={video.id}
                      onClick={() => handleVideoClick(video)}
                      className="rounded-2xl border overflow-hidden transition-all duration-200 cursor-pointer active:scale-[0.98] hover:shadow-lg"
                      style={{
                        backgroundColor: theme.card,
                        borderColor: theme.line,
                      }}
                    >
                      {/* Thumbnail Container */}
                      <div
                        className="relative h-48 w-full flex items-center justify-center bg-cover bg-center overflow-hidden"
                        style={{
                          backgroundImage: video.thumb
                            ? `url('${video.thumb}')`
                            : `linear-gradient(135deg, ${theme.accent2}, ${theme.accent1})`,
                        }}
                      >
                        {/* Overlay Dark Tint */}
                        <div className="absolute inset-0 bg-black/25" />

                        {/* Lock Badge if locked */}
                        {!unlocked && (
                          <div
                            className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-xl text-xs font-bold border flex items-center gap-1.5 shadow-md backdrop-blur-md"
                            style={{
                              backgroundColor: "rgba(20, 6, 31, 0.85)",
                              color: theme.gold,
                              borderColor: theme.gold,
                            }}
                          >
                            <Lock className="w-3.5 h-3.5" />
                            <span>
                              {remaining} {config.ads?.lockedLabel || "Ads"}
                            </span>
                          </div>
                        )}

                        {/* Duration Pill */}
                        <div className="absolute right-2.5 bottom-2.5 px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-black/80 text-white flex items-center gap-1 backdrop-blur-sm">
                          <Clock className="w-3 h-3" />
                          <span>{video.dur || "00:00"}</span>
                        </div>

                        {/* Center Play Button */}
                        <div
                          className="w-13 h-13 rounded-full flex items-center justify-center text-white shadow-xl transition-transform hover:scale-110 active:scale-95 border-2 border-white/40"
                          style={{
                            background: `linear-gradient(135deg, ${theme.accent1}, ${theme.accent2})`,
                          }}
                        >
                          <Play className="w-6 h-6 ml-0.5 fill-current" />
                        </div>
                      </div>

                      {/* Video Info */}
                      <div className="p-3.5">
                        <h4
                          className="font-semibold text-sm line-clamp-2 leading-snug"
                          style={{ color: theme.text }}
                        >
                          {video.title}
                        </h4>
                        <div
                          className="flex items-center justify-between text-xs mt-2.5 pt-2 border-t"
                          style={{
                            color: theme.mute,
                            borderColor: `${theme.line}60`,
                          }}
                        >
                          <span className="flex items-center gap-1">
                            <Eye className="w-3.5 h-3.5" />
                            <span>
                              {Number(video.views || 0).toLocaleString("bn-BD")} ভিউ
                            </span>
                          </span>

                          <button
                            onClick={(e) => handleLike(e, video)}
                            className="flex items-center gap-1 cursor-pointer transition-transform active:scale-125"
                            style={{
                              color: isLiked ? theme.accent1 : theme.mute,
                              fontWeight: isLiked ? 700 : 400,
                            }}
                          >
                            <Heart
                              className={`w-3.5 h-3.5 ${
                                isLiked ? "fill-current" : ""
                              }`}
                            />
                            <span>
                              {Number(video.likes || 0).toLocaleString("bn-BD")}
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Links Tab */}
        {currentTab?.type === "links" && (
          <div className="p-4 space-y-3">
            <h3 className="text-base font-bold mb-2" style={{ color: theme.text }}>
              {currentTab.title || currentTab.label}
            </h3>
            {(currentTab.items || []).map((item, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3.5 rounded-2xl border transition-all"
                style={{
                  backgroundColor: theme.card,
                  borderColor: theme.line,
                }}
              >
                <span className="font-medium text-sm" style={{ color: theme.text }}>
                  {item.title}
                </span>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-1.5 rounded-full text-xs font-semibold text-white transition-opacity hover:opacity-90 flex items-center gap-1 shadow-sm shrink-0"
                  style={{
                    background: `linear-gradient(90deg, ${theme.accent1}, ${theme.accent2})`,
                  }}
                >
                  <span>{item.button || "জয়েন"}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            ))}
          </div>
        )}

        {/* Rich Text Page Tab */}
        {currentTab?.type === "page" && (
          <div className="p-4 space-y-3">
            <h3 className="text-base font-bold mb-2" style={{ color: theme.text }}>
              {currentTab.title || currentTab.label}
            </h3>
            <div
              className="p-4 rounded-2xl border text-sm leading-relaxed whitespace-pre-line"
              style={{
                backgroundColor: theme.card,
                borderColor: theme.line,
                color: theme.text,
              }}
            >
              {currentTab.text || "কোনো তথ্য দেওয়া হয়নি।"}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Telegram Mini App Nav */}
      <div
        className="shrink-0 flex items-center justify-around border-t py-1.5 px-2 fixed bottom-0 left-0 right-0 z-20"
        style={{
          backgroundColor: theme.card,
          borderColor: theme.line,
        }}
      >
        {(config.tabs || []).map((tab, idx) => {
          const isActive = idx === activeTab;
          return (
            <button
              key={idx}
              onClick={() => setActiveTab(idx)}
              className="flex-1 flex flex-col items-center justify-center py-1 px-1 cursor-pointer transition-all"
              style={{
                color: isActive ? theme.accent1 : theme.mute,
              }}
            >
              <span className="text-xl leading-none mb-1">{tab.icon}</span>
              <span
                className={`text-[11px] ${
                  isActive ? "font-bold" : "font-medium"
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}

        {onOpenAdmin && (
          <button
            onClick={onOpenAdmin}
            className="flex-1 flex flex-col items-center justify-center py-1 px-1 cursor-pointer transition-all hover:opacity-90 active:scale-95"
            style={{
              color: theme.mute,
            }}
            title="লগইন"
          >
            <span className="text-xl leading-none">🔐</span>
          </button>
        )}
      </div>

      {/* Modal Overlay: Ad Prompt, Ad Countdown, Video Player */}
      {modalState.type !== "none" && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div
            className="w-full max-w-sm rounded-3xl border p-5 text-center shadow-2xl relative animate-in fade-in zoom-in duration-200"
            style={{
              backgroundColor: theme.card,
              borderColor: theme.line,
              color: theme.text,
            }}
          >
            {/* Close Button top right */}
            <button
              onClick={closeModal}
              className="absolute top-4 right-4 p-1.5 rounded-full text-white/60 hover:text-white hover:bg-white/10 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* State: Prompt to Watch Ad */}
            {modalState.type === "ad_prompt" && modalState.video && (
              <div className="py-2">
                <div
                  className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center mb-3 shadow-lg"
                  style={{
                    backgroundColor: `${theme.gold}20`,
                    color: theme.gold,
                    border: `1px solid ${theme.gold}50`,
                  }}
                >
                  <Lock className="w-7 h-7" />
                </div>
                <h3 className="text-lg font-bold">
                  {config.ads?.unlockTitle || "🔒 ভিডিও আনলক করুন"}
                </h3>
                <p className="text-sm mt-2 mb-5" style={{ color: theme.mute }}>
                  {(config.ads?.unlockText || "আরও {n}টি বিজ্ঞাপন দেখলে ভিডিওটি চালু হবে।").replace(
                    "{n}",
                    String(getRemainingAds(modalState.video))
                  )}
                </p>

                <div className="space-y-2.5">
                  <button
                    onClick={() => startWatchingAd(modalState.video!)}
                    className="w-full py-3 rounded-2xl font-bold text-white text-sm shadow-lg transition-transform active:scale-98 cursor-pointer flex items-center justify-center gap-2"
                    style={{
                      background: `linear-gradient(90deg, ${theme.accent1}, ${theme.accent2})`,
                    }}
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>{config.ads?.watchButton || "বিজ্ঞাপন দেখুন"}</span>
                  </button>
                  <button
                    onClick={closeModal}
                    className="w-full py-2.5 rounded-2xl text-xs font-semibold border cursor-pointer transition-colors"
                    style={{
                      borderColor: theme.line,
                      color: theme.mute,
                    }}
                  >
                    {config.ads?.cancelButton || "বাতিল"}
                  </button>
                </div>
              </div>
            )}

            {/* State: Ad Playing Countdown */}
            {modalState.type === "ad_playing" && (
              <div className="py-4">
                <div className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-white/10 text-white/80 mb-3">
                  Sponsored Partner Ad
                </div>
                <h3 className="text-base font-bold">বিজ্ঞাপন চলছে...</h3>
                <p className="text-xs mt-1" style={{ color: theme.mute }}>
                  কাউন্টডাউন শেষ হলে ভিডিও আনলক হবে
                </p>

                {/* Animated Circular Countdown */}
                <div className="my-6 relative flex items-center justify-center">
                  <div
                    className="w-24 h-24 rounded-full flex items-center justify-center border-4 border-dashed animate-spin text-3xl font-black"
                    style={{
                      borderColor: theme.accent1,
                    }}
                  />
                  <div
                    className="absolute text-4xl font-extrabold"
                    style={{ color: theme.accent1 }}
                  >
                    {modalState.countdown}
                  </div>
                </div>

                <p className="text-[11px] opacity-70">
                  বিজ্ঞাপন শেষ হওয়ার জন্য অপেক্ষা করুন
                </p>
              </div>
            )}

            {/* State: Video Player Modal */}
            {modalState.type === "video_player" && modalState.video && (
              <div className="py-1 text-left">
                <div className="flex items-center gap-2 mb-2 pr-6">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: theme.accent1 }}
                  />
                  <h3
                    className="font-bold text-sm truncate"
                    style={{ color: theme.text }}
                  >
                    {modalState.video.title}
                  </h3>
                </div>

                <div className="rounded-2xl overflow-hidden bg-black border border-white/10 shadow-inner">
                  {modalState.video.src ? (
                    <video
                      src={modalState.video.src}
                      controls
                      autoPlay
                      playsInline
                      className="w-full max-h-56 object-contain"
                    />
                  ) : (
                    <div className="h-44 flex flex-col items-center justify-center p-4 text-center text-xs text-white/60">
                      <Volume2 className="w-8 h-8 mb-2 opacity-40" />
                      <p>এই ভিডিওর ফাইল এখনো সার্ভারে যোগ করা হয়নি।</p>
                      <p className="mt-1 text-white/40">
                        অ্যাডমিন প্যানেল থেকে ভিডিও আপলোড করুন।
                      </p>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <span className="text-xs" style={{ color: theme.mute }}>
                    {modalState.video.cat} • {modalState.video.dur}
                  </span>
                  <button
                    onClick={closeModal}
                    className="px-5 py-2 rounded-xl text-xs font-bold text-white shadow cursor-pointer"
                    style={{
                      background: `linear-gradient(90deg, ${theme.accent1}, ${theme.accent2})`,
                    }}
                  >
                    বন্ধ করুন
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  if (isFullscreen) {
    return <div className="w-full h-full relative">{content}</div>;
  }

  // Telegram Mobile Mockup Frame
  return (
    <div className="flex flex-col items-center justify-center p-2 sm:p-6 w-full">
      {/* Device Controller Bar */}
      <div className="w-full max-w-[400px] flex items-center justify-between mb-3 px-2">
        <div className="flex items-center gap-2 text-xs text-white/70">
          <Smartphone className="w-4 h-4 text-pink-400" />
          <span className="font-medium">Telegram Mini App Preview</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={resetAllProgress}
            title="Reset unlocked ads progress"
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-xs flex items-center gap-1 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">রিসেট প্রগ্রেস</span>
          </button>
          {onToggleFullscreen && (
            <button
              onClick={onToggleFullscreen}
              title="Toggle Fullscreen"
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors cursor-pointer"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Simulated Smartphone Frame */}
      <div className="relative w-full max-w-[390px] h-[780px] max-h-[88vh] rounded-[48px] p-3.5 bg-[#1e2330] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.1)] ring-8 ring-black/40 flex flex-col overflow-hidden">
        {/* Dynamic Island / Notch */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 w-28 h-4.5 bg-black rounded-full z-40 pointer-events-none flex items-center justify-center">
          <div className="w-2.5 h-2.5 rounded-full bg-white/10 mr-4" />
          <div className="w-2 h-2 rounded-full bg-blue-900/40" />
        </div>

        {/* Telegram Top Navigation Header */}
        <div
          className="rounded-t-[34px] px-4 pt-5 pb-2.5 flex items-center justify-between shrink-0 select-none z-30 transition-colors border-b"
          style={{
            backgroundColor: theme.card,
            borderColor: theme.line,
          }}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-pink-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold shadow">
              {config.logo || "♥"}
            </div>
            <div className="text-left">
              <div
                className="text-xs font-bold leading-tight"
                style={{ color: theme.text }}
              >
                {config.appName || "ফান হাব"}
              </div>
              <div className="text-[10px] text-white/50">bot</div>
            </div>
          </div>

          <div className="flex items-center gap-3 text-white/60 text-sm">
            <span className="cursor-pointer hover:text-white text-xs">•••</span>
            <span className="cursor-pointer hover:text-white text-xs font-bold">
              ✕
            </span>
          </div>
        </div>

        {/* App Screen inside phone */}
        <div className="flex-1 rounded-b-[34px] overflow-hidden relative shadow-inner">
          {content}
        </div>

        {/* Home Indicator Bar */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1 bg-white/30 rounded-full z-40 pointer-events-none" />
      </div>
    </div>
  );
};
