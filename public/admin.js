const $ = s => document.querySelector(s);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
let cfg, token = localStorage.getItem("tk") || "", removed = [], sec = "general", isDefault = false;
const SECS = [["general", "🎨 সাধারণ ও রঙ"], ["menu", "📑 মেনু"], ["cats", "🏷 ক্যাটাগরি"], ["videos", "🎬 ভিডিও"], ["ads", "💰 বিজ্ঞাপন"], ["security", "🔐 সিকিউরিটি"]];
const get = (o, p) => p.split(".").reduce((a, k) => a == null ? a : a[k], o);
const set = (o, p, v) => { const ks = p.split("."), l = ks.pop(); let t = o; ks.forEach(k => t = t[k]); t[l] = v; };
const arr = p => { let a = get(cfg, p); if (!a) { set(cfg, p, []); a = get(cfg, p); } return a; };
const dirty = () => $("#st").textContent = "● সেভ করা হয়নি";

async function api(p, o = {}) {
  o.headers = Object.assign({ Authorization: "Bearer " + token }, o.headers || {});
  const r = await fetch(p, o);
  if (r.status === 401) { logout(); throw new Error("401"); }
  return r;
}

async function login() {
  const pw = $("#pw").value;
  if (!pw) { $("#lerr").textContent = "পাসওয়ার্ড লিখুন"; return; }
  $("#lerr").textContent = "লগইন হচ্ছে...";
  try {
    const r = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw })
    });
    const j = await r.json();
    if (!r.ok) {
      $("#lerr").textContent = j.error || "পাসওয়ার্ড ভুল হয়েছে";
      return;
    }
    token = j.token;
    isDefault = !!j.isDefaultPassword;
    localStorage.setItem("tk", token);
    start();
  } catch (e) {
    $("#lerr").textContent = "সার্ভারে যোগাযোগ করা যায়নি";
  }
}

function logout() {
  token = "";
  localStorage.removeItem("tk");
  $("#app").style.display = "none";
  $("#login").style.display = "block";
}

async function start() {
  if (!token) return logout();
  try {
    cfg = await (await api("/api/admin/config")).json();
    const st = await (await api("/api/admin/auth-status")).json();
    isDefault = !!st.isDefaultPassword;
  } catch (e) {
    return logout();
  }
  $("#login").style.display = "none";
  $("#app").style.display = "block";
  render();
}

const F = (l, p, t = "text", x = "") => `<label>${l}<input type="${t}" data-p="${p}" value="${esc(get(cfg, p))}" ${x}></label>`;
const T = (l, p) => `<label>${l}<textarea data-p="${p}">${esc(get(cfg, p))}</textarea></label>`;
const S = (l, p, opts, re) => `<label>${l}<select data-p="${p}" ${re ? 'onchange="render()"' : ""}>${opts.map(([v, n]) => `<option value="${esc(v)}" ${get(cfg, p) === v ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></label>`;
const btns = (p, i) => `<button onclick="mv('${p}',${i},-1)">↑</button><button onclick="mv('${p}',${i},1)">↓</button><button class="del" onclick="del('${p}',${i})">🗑</button>`;

const VIEW = {
  general: () => F("অ্যাপের নাম", "appName") + F("লোগো (ইমোজি/চিহ্ন)", "logo") + F("ডানদিকের লেখা (খালি রাখলে লুকাবে)", "premiumLabel") +
    F("স্বাগত বার্তা (খালি রাখলে লুকাবে)", "notice") + F("সার্চ বক্সের লেখা", "searchPlaceholder") + F("ভিডিও না পেলে যে লেখা দেখাবে", "emptyText") +
    `<div class="card"><b>রঙের প্যালেট</b><div class="grid">` + [["bg", "ব্যাকগ্রাউন্ড"], ["card", "কার্ড ব্যাকগ্রাউন্ড"], ["line", "বর্ডার ও লাইন"], ["text", "প্রধান লেখা"], ["mute", "হালকা লেখা"], ["accent1", "মূল রঙ ১ (গোলাপী)"], ["accent2", "মূল রঙ ২ (বেগুনী)"], ["gold", "লক/প্রিমিয়াম গোল্ড"]]
      .map(([k, n]) => F(n, "theme." + k, "color")).join("") + `</div></div>`,
  menu: () => cfg.tabs.map((t, i) => {
    const b = "tabs." + i;
    let extra = '<p class="mute">এই মেনুতে ভিডিও ফিড দেখাবে।</p>';
    if (t.type === "links") extra = F("পেজের শিরোনাম", b + ".title") + (t.items || []).map((it, j) => `<div class="sub"><div class="bar"><span class="mute">লিংক ${j + 1}</span><span>${btns(b + ".items", j)}</span></div>` +
      F("লেখা", `${b}.items.${j}.title`) + F("লিংক (https://t.me/...)", `${b}.items.${j}.url`) + F("বাটনের লেখা", `${b}.items.${j}.button`) + "</div>").join("") +
      `<button class="add" onclick="add('${b}.items',{title:'নতুন টেলিগ্রাম গ্রুপ',url:'https://t.me/',button:'জয়েন'})">+ লিংক যোগ করুন</button>`;
    if (t.type === "page") extra = F("পেজের শিরোনাম", b + ".title") + T("লেখা", b + ".text");
    return `<div class="card"><div class="bar"><b>${i + 1}. ${esc(t.label)}</b><span>${btns("tabs", i)}</span></div>` + F("মেনুর নাম", b + ".label") + F("আইকন (ইমোজি)", b + ".icon") +
      S("ধরন", b + ".type", [["videos", "ভিডিও ফিড"], ["links", "লিংকের তালিকা"], ["page", "লেখার পেজ"]], true) + extra + "</div>";
  }).join("") + `<button class="add" onclick="add('tabs',{label:'নতুন মেনু',icon:'⭐',type:'page',title:'',text:''})">+ নতুন মেনু</button>`,
  cats: () => `<p class="mute">প্রথমটি "সব" ক্যাটাগরি। নাম বদলালে ভিডিওগুলোতেও স্বয়ংক্রিয়ভাবে আপডেট হবে।</p>` +
    cfg.categories.map((c, i) => `<div class="row2"><input value="${esc(c)}" oninput="renameCat(${i},this.value)">${i ? btns("categories", i) : '<span class="mute">(সবগুলো)</span>'}</div>`).join("") +
    `<button class="add" onclick="add('categories','নতুন ক্যাটাগরি')">+ নতুন ক্যাটাগরি</button>`,
  videos: () => cfg.videos.map((v, i) => {
    const b = "videos." + i;
    return `<div class="card"><div class="bar"><b>${i + 1}. ${esc(v.title)}</b><span>${btns("videos", i)}</span></div>` + F("শিরোনাম", b + ".title") +
      S("ক্যাটাগরি", b + ".cat", cfg.categories.slice(1).map(c => [c, c])) +
      `<div class="grid">${F("সময় (মিনিট:সেকেন্ড)", b + ".dur")}${F("কয়টি বিজ্ঞাপন (০ = ফ্রি)", b + ".ads", "number", 'min="0"')}${F("ভিউ (শুরুর সংখ্যা)", b + ".views", "number", 'min="0"')}${F("লাইক (শুরুর সংখ্যা)", b + ".likes", "number", 'min="0"')}</div>` +
      F("ভিডিও লিংক (নিজে আপলোড করলে অটো বসবে)", b + ".src") +
      `<label class="up">📤 ভিডিও আপলোড<input type="file" accept="video/mp4,video/webm,video/quicktime" hidden onchange="upl(this,${i},'src')"></label> <span class="mute" id="pr-${i}-src"></span>` +
      F("থাম্বনেইল লিংক", b + ".thumb") + (v.thumb ? `<img class="th" src="${esc(v.thumb)}">` : "") +
      `<label class="up">🖼 থাম্বনেইল আপলোড<input type="file" accept="image/*" hidden onchange="upl(this,${i},'thumb')"></label> <span class="mute" id="pr-${i}-thumb"></span></div>`;
  }).join("") + `<button class="add" onclick="addVideo()">+ নতুন ভিডিও যোগ করুন</button>`,
  ads: () => `<div class="card">` + S("বিজ্ঞাপনের ধরন", "ads.provider", [["demo", "ডেমো (কাউন্টডাউন টাইমার)"], ["adsgram", "Adsgram (টেলিগ্রাম বিজ্ঞাপন)"]]) + F("Adsgram Block ID", "ads.blockId") + F("ডেমো কাউন্টডাউন (সেকেন্ড)", "ads.demoSeconds", "number", 'min="1"') +
    F("লক ব্যাজের লেখা (যেমন Ads)", "ads.lockedLabel") + F("আনলক পপআপের শিরোনাম", "ads.unlockTitle") + F("আনলক পপআপের লেখা ({n} = বাকি বিজ্ঞাপন)", "ads.unlockText") +
    F("বিজ্ঞাপন দেখার বাটন", "ads.watchButton") + F("বাতিল বাটনের লেখা", "ads.cancelButton") + `</div><p class="mute">প্রতিটি ভিডিওতে কয়টি বিজ্ঞাপন লাগবে তা "ভিডিও" ট্যাবে নির্ধারণ করুন।</p>`,
  security: () => `
    ${isDefault ? `<div style="background:#52310a;border:1px solid #f5b94a;color:#f5b94a;padding:12px;border-radius:12px;margin-bottom:12px">
      ⚠️ <b>সতর্কবার্তা:</b> আপনি এখনো ডিফল্ট পাসওয়ার্ড ('admin123') ব্যবহার করছেন! যে কেউ আপনার প্যানেল এক্সেস করতে পারে। অবিলম্বে নিচে নতুন পাসওয়ার্ড সেট করুন।
    </div>` : ""}
    <div class="card">
      <b>🔒 পাসওয়ার্ড পরিবর্তন করুন</b>
      <p class="mute">নতুন পাসওয়ার্ড দিলে অন্য সব ডিভাইসের সক্রিয় সেশন বাতিল হয়ে যাবে।</p>
      <label>বর্তমান পাসওয়ার্ড<input type="password" id="curpw" placeholder="বর্তমান পাসওয়ার্ড"></label>
      <label>নতুন পাসওয়ার্ড (কমপক্ষে ৮ অক্ষর)<input type="password" id="newpw" placeholder="নতুন শক্তিশালী পাসওয়ার্ড"></label>
      <label>নতুন পাসওয়ার্ড নিশ্চিতকরণ<input type="password" id="confpw" placeholder="পুনরায় নতুন পাসওয়ার্ড"></label>
      <button class="add" style="border-style:solid;background:#ec2b8a;color:#fff" onclick="changePw()">পাসওয়ার্ড পরিবর্তন করুন</button>
      <p id="pwres" class="mute" style="margin-top:10px"></p>
    </div>
    <div class="card" style="margin-top:14px">
      <b>🚪 অন্য সকল সেশন বন্ধ করুন</b>
      <p class="mute">অন্য কোনো ডিভাইসে লগইন থাকলে তা লগআউট করে দিতে চান?</p>
      <button class="up" style="background:#ff6b7a22;border-color:#ff6b7a66;color:#ff6b7a" onclick="revokeSessions()">সকল সেশন বাতিল করুন</button>
    </div>
  `
};

async function changePw() {
  const cur = $("#curpw").value, nw = $("#newpw").value, conf = $("#confpw").value;
  if (!cur || !nw || !conf) { $("#pwres").textContent = "❌ সব ঘর পূরণ করুন"; return; }
  if (nw.length < 8) { $("#pwres").textContent = "❌ পাসওয়ার্ড কমপক্ষে ৮ অক্ষর হতে হবে"; return; }
  if (nw !== conf) { $("#pwres").textContent = "❌ নতুন পাসওয়ার্ড দুবার একই হতে হবে"; return; }
  $("#pwres").textContent = "আপডেট হচ্ছে...";
  try {
    const r = await api("/api/admin/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: cur, newPassword: nw })
    });
    const j = await r.json();
    if (!r.ok) { $("#pwres").textContent = "❌ " + (j.error || "ব্যর্থ"); return; }
    token = j.token;
    localStorage.setItem("tk", token);
    isDefault = false;
    $("#pwres").textContent = "✅ " + j.message;
    setTimeout(() => render(), 2000);
  } catch (e) {
    $("#pwres").textContent = "❌ পরিবর্তন করা যায়নি";
  }
}

async function revokeSessions() {
  if (!confirm("অন্য সব ডিভাইস লগআউট করবেন?")) return;
  try {
    const r = await api("/api/admin/revoke-sessions", { method: "POST" });
    const j = await r.json();
    if (r.ok) {
      token = j.token;
      localStorage.setItem("tk", token);
      alert("✅ অন্য সকল সেশন বাতিল করা হয়েছে।");
    }
  } catch (e) {
    alert("সমস্যা হয়েছে");
  }
}

function render() {
  $("#tabs").innerHTML = SECS.map(([k, l]) => `<button class="${k === sec ? "on" : ""}" onclick="sec='${k}';render()">${l}</button>`).join("");
  $("#body").innerHTML = VIEW[sec]();
  if (sec === "security") {
    $(".save").style.display = "none";
  } else {
    $(".save").style.display = "flex";
  }
}

document.addEventListener("input", e => {
  const p = e.target.dataset && e.target.dataset.p; if (!p) return;
  set(cfg, p, e.target.type === "number" ? (+e.target.value || 0) : e.target.value); dirty();
});

function mv(p, i, d) { const a = arr(p), j = i + d; if (j < 0 || j >= a.length || (p === "categories" && j < 1)) return; [a[i], a[j]] = [a[j], a[i]]; dirty(); render(); }
function add(p, o) { arr(p).push(o); dirty(); render(); }
function addVideo() { add("videos", { id: "v" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), title: "নতুন ভিডিও", cat: cfg.categories[1] || "", dur: "00:00", views: 0, likes: 0, ads: 3, src: "", thumb: "" }); }
function del(p, i) {
  if (!confirm("মুছে ফেলতে চান?")) return;
  const a = arr(p);
  if (p === "videos") [a[i].src, a[i].thumb].forEach(u => u && u.startsWith("/uploads/") && removed.push(u));
  if (p === "categories") cfg.videos.forEach(v => { if (v.cat === a[i]) v.cat = cfg.categories[1] === a[i] ? (cfg.categories[2] || "") : cfg.categories[1]; });
  a.splice(i, 1); dirty(); render();
}
function renameCat(i, val) { const old = cfg.categories[i]; cfg.categories[i] = val; cfg.videos.forEach(v => { if (v.cat === old) v.cat = val; }); dirty(); }
function dur(f, cb) {
  const v = document.createElement("video"); v.preload = "metadata";
  v.onloadedmetadata = () => { const s = Math.round(v.duration); if (isFinite(s)) cb(String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0")); URL.revokeObjectURL(v.src); };
  v.src = URL.createObjectURL(f);
}
function upl(inp, i, key) {
  const f = inp.files[0]; if (!f) return;
  const pr = $(`#pr-${i}-${key}`), x = new XMLHttpRequest();
  x.open("POST", "/api/upload?name=" + encodeURIComponent(f.name));
  x.setRequestHeader("Authorization", "Bearer " + token);
  x.upload.onprogress = e => { if (e.lengthComputable) pr.textContent = Math.round(e.loaded / e.total * 100) + "% আপলোড হচ্ছে..."; };
  x.onerror = () => pr.textContent = "❌ নেটওয়ার্ক সমস্যা";
  x.onload = () => {
    if (x.status !== 200) { let m = x.status; try { m = JSON.parse(x.responseText).error; } catch (e) {} pr.textContent = "❌ " + m; return; }
    const url = JSON.parse(x.responseText).url, old = cfg.videos[i][key];
    if (old && old.startsWith("/uploads/")) removed.push(old);
    cfg.videos[i][key] = url; dirty(); render();
    if (key === "src") dur(f, d => { cfg.videos[i].dur = d; render(); });
  };
  x.send(f);
}
async function save() {
  $("#st").textContent = "সেভ হচ্ছে...";
  try {
    const r = await api("/api/admin/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: cfg, removed })
    });
    if (!r.ok) throw new Error((await r.json()).error);
    removed = []; $("#st").textContent = "✅ সফলভাবে সেভ হয়েছে";
    setTimeout(() => { if ($("#st").textContent.startsWith("✅")) $("#st").textContent = ""; }, 3000);
  } catch (e) { $("#st").textContent = "❌ সেভ হয়নি: " + (e.message || ""); }
}
start();
