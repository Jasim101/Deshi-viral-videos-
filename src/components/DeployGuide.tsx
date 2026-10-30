import React, { useState } from "react";
import {
  Download,
  Terminal,
  Server,
  Send,
  Shield,
  Copy,
  Check,
  ExternalLink,
  HelpCircle,
  HardDrive,
  Key,
} from "lucide-react";

export const DeployGuide: React.FC = () => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-4 sm:p-6 pb-24 text-[#eceef8] space-y-6">
      {/* Hero Banner */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-pink-950/40 via-purple-950/40 to-[#1a1b26] border border-[#33354a] shadow-xl relative overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-pink-500/20 text-pink-300 border border-pink-500/30 mb-3">
            <Send className="w-3 h-3" />
            <span>টেলিগ্রাম মিনি অ্যাপ ডিপ্লয়মেন্ট গাইড</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">
            টেলিগ্রামে আপনার নিজস্ব ভিডিও হাব চালু করুন
          </h2>
          <p className="text-xs sm:text-sm text-[#8f93ad] leading-relaxed mb-5">
            সার্ভারটি শুধুমাত্র Node.js 18+ তে চলে, অতিরিক্ত কোনো প্যাকেজ ইনস্টল করা লাগে না! আপনি খুব সহজেই Render, Railway, VPS বা নিজস্ব সার্ভারে এটি হোস্ট করতে পারবেন।
          </p>

          <a
            href="/api/download-zip"
            download="fun-hub-standalone.zip"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-pink-500 to-purple-600 text-white font-bold text-sm shadow-lg hover:opacity-95 transition-transform active:scale-95 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>📦 রেডি জিপ প্যাকেজ ডাউনলোড করুন</span>
          </a>
        </div>
      </div>

      {/* Step 1: Running Locally */}
      <div className="p-5 rounded-2xl bg-[#1a1b26] border border-[#33354a] space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-xl bg-pink-500/20 text-pink-400 text-xs font-bold flex items-center justify-center">
            ১
          </div>
          <h3 className="text-sm font-bold text-white">
            নিজের কম্পিউটারে চালিয়ে দেখা (Local Run)
          </h3>
        </div>
        <p className="text-xs text-[#8f93ad]">
          ডাউনলোড করা জিপটি আনজিপ করে টার্মিনালে রান করুন:
        </p>

        <div className="relative p-3.5 rounded-xl bg-[#0f1016] border border-[#33354a] font-mono text-xs text-pink-300 flex items-center justify-between">
          <code>node server.js</code>
          <button
            onClick={() => copyToClipboard("node server.js", "local-cmd")}
            className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white cursor-pointer"
          >
            {copiedKey === "local-cmd" ? (
              <Check className="w-3.5 h-3.5 text-green-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
        <p className="text-xs text-[#8f93ad]">
          তারপর ব্রাউজারে ভিজিট করুন: <span className="text-white font-mono">http://localhost:3000</span> (মিনি অ্যাপ) এবং <span className="text-white font-mono">http://localhost:3000/admin</span> (পাসওয়ার্ড: <span className="text-pink-400 font-mono">admin123</span>)।
        </p>
      </div>

      {/* Step 2: Hosting Online */}
      <div className="p-5 rounded-2xl bg-[#1a1b26] border border-[#33354a] space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-xl bg-pink-500/20 text-pink-400 text-xs font-bold flex items-center justify-center">
            ২
          </div>
          <h3 className="text-sm font-bold text-white">
            অনলাইনে হোস্টিং করা (Render, Railway বা VPS)
          </h3>
        </div>
        <p className="text-xs text-[#8f93ad] leading-relaxed">
          টেলিগ্রাম মিনি অ্যাপের জন্য অবশ্যই <strong className="text-white">HTTPS</strong> ডোমেইন দরকার। Render বা Railway তে ফ্রি HTTPS ডোমেইন পাওয়া যায়।
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          <div className="p-3.5 rounded-xl bg-[#0f1016] border border-[#33354a]">
            <span className="text-xs font-bold text-white block mb-1">
              ১. গিটহাবে আপলোড
            </span>
            <span className="text-[11px] text-[#8f93ad]">
              ফোল্ডারটি আপনার গিটহাব একাউন্টে রিপোজিটরি হিসেবে পুশ করুন।
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-[#0f1016] border border-[#33354a]">
            <span className="text-xs font-bold text-white block mb-1">
              ২. স্টার্ট কমান্ড
            </span>
            <span className="text-[11px] text-pink-300 font-mono">
              node server.js
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-[#0f1016] border border-[#33354a]">
            <span className="text-xs font-bold text-white block mb-1">
              ৩. ডিস্ক ভলিউম (গুরুত্বপূর্ণ)
            </span>
            <span className="text-[11px] text-[#8f93ad]">
              ভিডিও পারসিস্টেন্ট রাখতে Render Disk বা Railway Volume সেট করুন।
            </span>
          </div>
        </div>

        {/* Env Variables Guide */}
        <div className="pt-2">
          <h4 className="text-xs font-bold text-white mb-2 flex items-center gap-1.5">
            <Key className="w-3.5 h-3.5 text-amber-400" />
            <span>Environment Variables কনফিগারেশন:</span>
          </h4>
          <div className="space-y-1.5 font-mono text-[11px]">
            <div className="p-2.5 rounded-lg bg-[#0f1016] border border-[#33354a] flex items-center justify-between">
              <div>
                <span className="text-pink-400 font-bold">ADMIN_PASSWORD</span> = আপনার পছন্দমতো একটি শক্তিশালী পাসওয়ার্ড (অনলাইনে লগইন সিকিউর করতে এটি বাধ্যতামূলক)
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-[#0f1016] border border-[#33354a] flex items-center justify-between">
              <div>
                <span className="text-pink-400 font-bold">DATA_DIR</span> = /data (ডিস্ক স্টোরেজ পাথ, যাতে রিস্টার্টে ভিডিও ও লাইক ডাটা না মোছে)
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-[#0f1016] border border-[#33354a] flex items-center justify-between">
              <div>
                <span className="text-pink-400 font-bold">MAX_UPLOAD_MB</span> = 500 (সর্বোচ্চ কত মেগাবাইট পর্যন্ত ফাইল আপলোড গ্রহণ করবে)
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Step 3: Telegram BotFather Setup */}
      <div className="p-5 rounded-2xl bg-[#1a1b26] border border-[#33354a] space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-xl bg-pink-500/20 text-pink-400 text-xs font-bold flex items-center justify-center">
            ৩
          </div>
          <h3 className="text-sm font-bold text-white">
            টেলিগ্রাম বটে মিনি অ্যাপ যুক্ত করার নিয়মাবলী
          </h3>
        </div>

        <div className="space-y-3 text-xs text-[#8f93ad] leading-relaxed">
          <div className="flex items-start gap-2.5">
            <span className="w-5 h-5 rounded-full bg-white/10 text-white flex items-center justify-center shrink-0 text-[10px] font-bold">
              ক
            </span>
            <div>
              টেলিগ্রামে যান এবং সার্চ বক্সে <strong className="text-white">@BotFather</strong> লিখে ওপেন করুন।
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <span className="w-5 h-5 rounded-full bg-white/10 text-white flex items-center justify-center shrink-0 text-[10px] font-bold">
              খ
            </span>
            <div>
              <code className="text-pink-300 font-bold bg-[#0f1016] px-1.5 py-0.5 rounded">/newbot</code> পাঠিয়ে বটের নাম ও একটি ইউজারনেম দিন (যেমন: <span className="text-white">my_fun_hub_bot</span>)।
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <span className="w-5 h-5 rounded-full bg-white/10 text-white flex items-center justify-center shrink-0 text-[10px] font-bold">
              গ
            </span>
            <div>
              মিনি অ্যাপ তৈরি করতে BotFather এ <code className="text-pink-300 font-bold bg-[#0f1016] px-1.5 py-0.5 rounded">/newapp</code> দিন, তৈরি করা বটটি নির্বাচন করুন, তারপর আপনার লাইভ সাইটের HTTPS লিংক দিন।
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <span className="w-5 h-5 rounded-full bg-white/10 text-white flex items-center justify-center shrink-0 text-[10px] font-bold">
              ঘ
            </span>
            <div>
              অথবা চ্যাট উইন্ডোর নিচে ডিরেক্ট "Open App" বাটন আনতে BotFather এ যান:
              <br />
              <code className="text-pink-300 font-mono mt-1 inline-block bg-[#0f1016] px-2 py-1 rounded">
                /mybots → আপনার বট সিলেক্ট করুন → Bot Settings → Menu Button → Configure menu button → আপনার HTTPS লিংক পেস্ট করুন।
              </code>
            </div>
          </div>
        </div>
      </div>

      {/* Adsgram Monetization Guide */}
      <div className="p-5 rounded-2xl bg-[#1a1b26] border border-[#33354a] space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-xl bg-amber-500/20 text-amber-400 text-xs font-bold flex items-center justify-center">
            💰
          </div>
          <h3 className="text-sm font-bold text-white">
            বিজ্ঞাপন থেকে আসল আয় (Adsgram Integration)
          </h3>
        </div>
        <p className="text-xs text-[#8f93ad] leading-relaxed">
          টেলিগ্রাম ট্রাফিক মনিটাইজ করতে <strong className="text-white">Adsgram.ai</strong> সবচেয়ে জনপ্রিয় প্ল্যাটফর্ম। ইউজার প্রতিটি ভিডিও আনলক করতে বিজ্ঞাপন দেখলে আপনার একাউন্টে টন (TON) কয়েন বা ডলার জমা হবে।
        </p>

        <div className="p-3 rounded-xl bg-[#0f1016] border border-[#33354a] text-xs text-[#8f93ad] space-y-2">
          <p>
            ১. <a href="https://adsgram.ai" target="_blank" rel="noopener noreferrer" className="text-pink-400 underline font-semibold">adsgram.ai</a> এ গিয়ে একাউন্ট খুলুন।
          </p>
          <p>
            ২. আপনার টেলিগ্রাম বটের ইউজারনেম দিয়ে একটি নতুন রিওয়ার্ডেড ব্লক (Rewarded Block) তৈরি করুন।
          </p>
          <p>
            ৩. প্রাপ্ত <code className="text-pink-300 font-bold">Block ID</code> টি এই অ্যাপের অ্যাডমিন প্যানেলের "বিজ্ঞাপন" ট্যাবে বসিয়ে সেভ করুন!
          </p>
        </div>
      </div>
    </div>
  );
};
