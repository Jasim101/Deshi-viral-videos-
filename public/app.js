(async function () {
  let C;
  try {
    C = await (await fetch("/api/config")).json();
  } catch (e) {
    document.body.innerHTML = '<div style="padding:40px;color:#fff;text-align:center"><p>লোড করা যায়নি, সার্ভার চালু আছে কি না পরীক্ষা করুন।</p><button onclick="location.reload()" style="padding:10px 20px;border-radius:10px;background:#ec2b8a;color:#fff;border:0;cursor:pointer">পুনরায় চেষ্টা করুন</button></div>';
    return;
  }
  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg) {
    try {
      tg.ready();
      tg.expand();
      if (C.theme && C.theme.card) tg.setHeaderColor(C.theme.card);
      if (C.theme && C.theme.bg) tg.setBackgroundColor(C.theme.bg);
    } catch (e) {}
  }
  if (C.theme) {
    Object.keys(C.theme).forEach(k => document.documentElement.style.setProperty("--" + k, C.theme[k]));
  }

  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safeUrl = u => /^(https?:\/\/|\/uploads\/|blob:)/i.test(u || "") ? u : "";
  const ls = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || "") || d; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const stat = (id, type) => fetch("/api/stat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, type })
  }).catch(() => {});

  let tab = 0;
  let cat = C.categories ? C.categories[0] : "সবগুলো";
  let unlocked = ls("unl", {});
  let liked = ls("liked", {});
  let progress = {};

  document.title = C.appName || "Fun Hub";
  if ($("logo")) {
    $("logo").textContent = (C.logo || "♥") + " " + (C.appName || "ফান হাব");
    $("logo").style.cursor = "pointer";
    $("logo").onclick = () => { location.href = "/admin"; };
  }
  if ($("prem")) $("prem").textContent = C.premiumLabel || "";

  window.__openLink = url => {
    if (!safeUrl(url)) return;
    if (tg && /^https?:\/\/t\.me\//i.test(url)) tg.openTelegramLink(url);
    else if (tg) tg.openLink(url);
    else window.open(url, "_blank");
  };

  function renderNav() {
    const nav = $("nav");
    if (!nav || !C.tabs) return;
    nav.innerHTML = C.tabs.map((t, i) => `<button class="${i === tab ? "on" : ""}" onclick="__tab(${i})"><span>${esc(t.icon)}</span>${esc(t.label)}</button>`).join("") +
      `<button onclick="location.href='/admin'" style="color:var(--accent1);font-weight:600"><span>⚙️</span>অ্যাডমিন</button>`;
  }
  window.__tab = i => { tab = i; renderNav(); renderTab(); window.scrollTo(0, 0); };

  function renderTab() {
    const t = C.tabs && C.tabs[tab];
    const m = $("main");
    if (!m || !t) return;
    if (t.type === "videos") {
      m.innerHTML = `<div class="wrap">${C.notice ? `<div class="notice">${esc(C.notice)}</div>` : ""}
        <div class="search"><input id="q" placeholder="${esc(C.searchPlaceholder || "ভিডিও খুঁজুন...")}"><span style="align-self:center;cursor:pointer">🔍</span></div>
        <div class="chips" id="chips"></div><div id="list"></div></div>`;
      const qInput = $("q");
      if (qInput) qInput.addEventListener("input", renderList);
      renderChips();
      renderList();
    } else if (t.type === "links") {
      m.innerHTML = `<div class="wrap"><h3>${esc(t.title || t.label)}</h3>` + (t.items || []).map(it =>
        `<div class="row"><span>${esc(it.title)}</span><button class="btn" onclick="__openLink('${esc(it.url)}')">${esc(it.button || "খুলুন")}</button></div>`).join("") + "</div>";
    } else {
      m.innerHTML = `<div class="wrap"><h3>${esc(t.title || t.label)}</h3><div class="page">${esc(t.text)}</div></div>`;
    }
  }

  function renderChips() {
    const chips = $("chips");
    if (!chips || !C.categories) return;
    chips.innerHTML = C.categories.map(c => `<button class="chip ${c === cat ? "on" : ""}" data-c="${esc(c)}">${esc(c)}</button>`).join("");
    document.querySelectorAll(".chip").forEach(b => b.onclick = () => { cat = b.dataset.c; renderChips(); renderList(); });
  }

  const need = v => Math.max(0, (+v.ads || 0) - (progress[v.id] || 0));
  const isOpen = v => !(+v.ads) || unlocked[v.id];
  const byId = id => (C.videos || []).find(v => v.id === id);

  function renderList() {
    const list = $("list");
    if (!list) return;
    const qEl = $("q");
    const q = (qEl ? qEl.value : "").trim().toLowerCase();
    const filtered = (C.videos || []).filter(v => (cat === C.categories[0] || v.cat === cat) && (v.title || "").toLowerCase().includes(q));

    const html = filtered.map(v => {
      const bg = safeUrl(v.thumb) ? `background-image:url('${esc(v.thumb)}')` : "background-image:linear-gradient(135deg,var(--accent2),var(--accent1))";
      const lock = isOpen(v) ? "" : `<div class="lock">🔒 ${need(v)} ${esc((C.ads && C.ads.lockedLabel) || "Ads")}</div>`;
      return `<div class="vid" onclick="__open('${esc(v.id)}')">
        <div class="thumb" style="${bg}">
          ${lock}
          <div class="play">▶</div>
          <div class="dur">${esc(v.dur || "00:00")}</div>
        </div>
        <div class="info">
          <div class="title">${esc(v.title)}</div>
          <div class="meta">
            <span>👁 ${Number(v.views || 0).toLocaleString("bn-BD")} ভিউ</span>
            <span class="lk ${liked[v.id] ? "on" : ""}" onclick="event.stopPropagation();__like('${esc(v.id)}')">${liked[v.id] ? "♥" : "♡"} ${Number(v.likes || 0).toLocaleString("bn-BD")}</span>
          </div>
        </div>
      </div>`;
    }).join("");

    list.innerHTML = html || `<div class="empty">${esc(C.emptyText || "কোনো ভিডিও পাওয়া যায়নি")}</div>`;
  }

  window.__like = id => {
    const v = byId(id);
    if (!v || liked[id]) return;
    liked[id] = 1;
    lsSet("liked", liked);
    v.likes = (+v.likes || 0) + 1;
    stat(id, "like");
    renderList();
  };

  const show = h => {
    $("box").innerHTML = h;
    $("modal").classList.add("show");
  };
  window.__close = () => $("modal").classList.remove("show");

  window.__open = id => {
    const v = byId(id);
    if (!v) return;
    isOpen(v) ? play(v) : ask(v);
  };

  function ask(v) {
    const a = C.ads || {};
    const text = (a.unlockText || "আরও {n}টি বিজ্ঞাপন দেখলে ভিডিওটি চালু হবে।").replace("{n}", need(v));
    show(`<h3>${esc(a.unlockTitle || "🔒 ভিডিও আনলক করুন")}</h3>
      <p style="color:var(--mute);margin:12px 0">${esc(text)}</p>
      <button class="btn" onclick="__ad('${esc(v.id)}')">${esc(a.watchButton || "বিজ্ঞাপন দেখুন")}</button>
      <button class="btn ghost" onclick="__close()">${esc(a.cancelButton || "বাতিল")}</button>`);
  }

  function showAd() {
    return new Promise(res => {
      const a = C.ads || {};
      if (a.provider === "adsgram" && window.Adsgram) {
        window.Adsgram.init({ blockId: a.blockId }).show().then(() => res(true)).catch(() => res(false));
        return;
      }
      let s = +a.demoSeconds || 5;
      show(`<h3>বিজ্ঞাপন চলছে...</h3>
        <p style="color:var(--mute);font-size:13px">বিজ্ঞাপন শেষ হলে ভিডিও আনলক হবে</p>
        <p style="font-size:48px;font-weight:700;color:var(--accent1);margin:16px 0" id="cd">${s}</p>
        <p class="mute" style="font-size:12px">কাউন্টডাউন পর্যন্ত অপেক্ষা করুন...</p>`);
      const t = setInterval(() => {
        s--;
        const el = $("cd");
        if (el) el.textContent = s;
        if (s <= 0) {
          clearInterval(t);
          res(true);
        }
      }, 1000);
    });
  }

  window.__ad = async id => {
    const v = byId(id);
    if (!v) return;
    const watched = await showAd();
    if (!watched) {
      ask(v);
      return;
    }
    progress[id] = (progress[id] || 0) + 1;
    if (need(v) <= 0) {
      unlocked[id] = true;
      lsSet("unl", unlocked);
      renderList();
      play(v);
    } else {
      renderList();
      ask(v);
    }
  };

  window.__fs = () => {
    const el = document.getElementById("active-video");
    if (!el) return;
    try {
      if (el.requestFullscreen) el.requestFullscreen();
      else if (el.webkitEnterFullscreen) el.webkitEnterFullscreen();
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    } catch (e) {}
  };

  function play(v) {
    const media = safeUrl(v.src)
      ? `<div style="position:relative;width:100%;background:#000;border-radius:16px;overflow:hidden;margin:10px 0">
           <video id="active-video" src="${esc(v.src)}" controls autoplay playsinline webkit-playsinline style="width:100%;max-height:72vh;display:block"></video>
         </div>
         <button class="btn" onclick="__fs()" style="margin-bottom:8px">📱 ফুল স্ক্রিন করুন (Fullscreen)</button>`
      : '<p style="color:var(--mute);padding:20px">এই ভিডিওর ফাইল এখনো সার্ভারে যোগ করা হয়নি। অ্যাডমিন প্যানেল থেকে ফাইল আপলোড করুন।</p>';
    show(`<div style="display:flex;justify-content:space-between;align-items:center"><h3 style="font-size:15px;margin:0;text-align:left;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(v.title)}</h3><span style="font-size:11px;color:var(--mute);margin-left:8px">${esc(v.cat || "")}</span></div>${media}<button class="btn ghost" onclick="__close()">বন্ধ করুন</button>`);
    v.views = (+v.views || 0) + 1;
    stat(v.id, "view");
    renderList();
  }

  renderNav();
  renderTab();
})();
