/* ==========================================================
   MiRadio Listen — directory + player
   ========================================================== */
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const { ICON_PLAY, ICON_PAUSE } = window.MiIcons;
  const PAGE = 48;

  const grid = $("#grid");
  const moreBtn = $("#more");
  const title = $("#result-title");
  const count = $("#result-count");
  const q = $("#q");
  const countrySel = $("#country");
  const sortSel = $("#sort");

  const filters = { name: "", tag: "", country: "", order: "clickcount" };
  let offset = 0;
  let shown = [];
  let reqId = 0;

  /* ---------- Favourites (stored in this browser only) ---------- */
  const FAV_KEY = "miradio_favs";
  function loadFavs() { try { return JSON.parse(localStorage.getItem(FAV_KEY)) || []; } catch (e) { return []; } }
  function saveFavs(f) { try { localStorage.setItem(FAV_KEY, JSON.stringify(f)); } catch (e) {} }
  let favs = loadFavs();

  /* ---------- Rendering ---------- */
  function esc(s) { return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  function thumbHtml(s) {
    const img = s.favicon && s.favicon.startsWith("https://")
      ? `<img src="${esc(s.favicon)}" alt="" loading="lazy" onerror="this.remove()">` : "";
    return `${esc(Radio.initials(s.name))}${img}`;
  }

  function card(s) {
    const el = document.createElement("article");
    el.className = "station";
    el.dataset.uuid = s.stationuuid;
    const meta = [Radio.tags(s, 2), s.countrycode].filter(Boolean).join(" · ") || "Live radio";
    const fav = favs.includes(s.stationuuid);
    el.innerHTML = `
      <div class="thumb" style="background:${Radio.color(s.name)}">${thumbHtml(s)}</div>
      <div class="info">
        <div class="name" title="${esc(s.name)}">${esc(s.name.trim())}</div>
        <div class="meta">${esc(meta)}${s.bitrate ? " · " + s.bitrate + "k" : ""}</div>
      </div>
      <button class="fav ${fav ? "on" : ""}" aria-label="${fav ? "Remove from" : "Add to"} favourites">${fav ? "♥" : "♡"}</button>
      <button class="play" aria-label="Play ${esc(s.name)}">${ICON_PLAY}</button>`;
    $(".play", el).addEventListener("click", () => playStation(s));
    $(".fav", el).addEventListener("click", (e) => toggleFav(s, e.currentTarget));
    return el;
  }

  function skeletons(n = 12) {
    grid.innerHTML = Array.from({ length: n }, () => '<div class="skeleton"></div>').join("");
  }

  function render(list, append) {
    if (!append) grid.innerHTML = "";
    if (!append && !list.length) {
      grid.innerHTML = `<div class="empty">${filters.tag === "__fav" ? "No favourites yet. Tap ♡ on any station to save it here." : "No stations found. Try another search or genre."}</div>`;
    }
    list.forEach((s) => grid.appendChild(card(s)));
    markCurrent();
    count.textContent = shown.length ? `${shown.length} station${shown.length === 1 ? "" : "s"}` : "";
  }

  function toggleFav(s, btn) {
    const i = favs.indexOf(s.stationuuid);
    if (i >= 0) favs.splice(i, 1); else favs.push(s.stationuuid);
    saveFavs(favs);
    const on = i < 0;
    btn.classList.toggle("on", on);
    btn.textContent = on ? "♥" : "♡";
    btn.setAttribute("aria-label", (on ? "Remove from" : "Add to") + " favourites");
    miToast(on ? "Saved to favourites" : "Removed from favourites");
    if (!on && filters.tag === "__fav") btn.closest(".station").remove();
  }

  /* ---------- Loading ---------- */
  async function load(append = false) {
    const id = ++reqId;
    if (!append) { offset = 0; shown = []; skeletons(); }
    moreBtn.hidden = true;
    try {
      let list;
      if (filters.tag === "__fav") {
        list = await Radio.byUuids(favs);
      } else if (!filters.name && !filters.tag && !filters.country && filters.order === "clickcount" && !append) {
        list = await Radio.top(PAGE);
      } else {
        list = await Radio.search({ ...filters, limit: PAGE, offset });
      }
      if (id !== reqId) return;
      offset += PAGE * 2;
      const known = new Set(shown.map((s) => s.stationuuid));
      list = list.filter((s) => !known.has(s.stationuuid));
      shown = shown.concat(list);
      render(list, append);
      moreBtn.hidden = filters.tag === "__fav" || list.length < PAGE / 2;
    } catch (e) {
      if (id !== reqId) return;
      grid.innerHTML = `<div class="empty">Couldn't reach the station directory. Check your connection and <a href="#" class="accent" id="retry">try again</a>.</div>`;
      $("#retry").addEventListener("click", (ev) => { ev.preventDefault(); load(); });
    }
  }

  function updateTitle() {
    const chip = $(`#genres .chip[data-tag="${CSS.escape(filters.tag)}"]`);
    let t = filters.name ? `Results for “${filters.name}”` : chip ? chip.textContent.replace("♥ ", "") : filters.tag || "Top stations";
    if (filters.country && filters.tag !== "__fav") {
      const opt = countrySel.selectedOptions[0];
      t += " · " + (opt ? opt.textContent.replace(/\s*\(\d+\)$/, "") : filters.country);
    }
    title.textContent = t;
  }

  function setTag(tag) {
    filters.tag = tag;
    $$("#genres .chip").forEach((c) => c.classList.toggle("active", c.dataset.tag === tag));
  }

  $$("#genres .chip").forEach((c) =>
    c.addEventListener("click", () => {
      setTag(c.dataset.tag);
      if (c.dataset.tag === "__fav") { filters.name = ""; q.value = ""; }
      updateTitle();
      load();
    })
  );

  $("#search-form").addEventListener("submit", (e) => {
    e.preventDefault();
    filters.name = q.value.trim();
    if (filters.tag === "__fav") setTag("");
    updateTitle();
    load();
  });
  countrySel.addEventListener("change", () => { filters.country = countrySel.value; if (filters.tag === "__fav") setTag(""); updateTitle(); load(); });
  sortSel.addEventListener("change", () => { filters.order = sortSel.value; if (filters.tag === "__fav") setTag(""); load(); });
  moreBtn.addEventListener("click", () => load(true));

  Radio.countries().then((list) => {
    let names = null;
    try { names = new Intl.DisplayNames([navigator.language || "en"], { type: "region" }); } catch (e) {}
    list
      .filter((c) => c.iso_3166_1 && c.stationcount > 20)
      .slice(0, 120)
      .map((c) => {
        let label = c.name;
        try { if (names) label = names.of(c.iso_3166_1.toUpperCase()) || c.name; } catch (e) {}
        return { code: c.iso_3166_1.toUpperCase(), label, n: c.stationcount };
      })
      .sort((a, b) => a.label.localeCompare(b.label))
      .forEach((c) => {
        const o = document.createElement("option");
        o.value = c.code;
        o.textContent = `${c.label} (${c.n})`;
        countrySel.appendChild(o);
      });
    if (filters.country) countrySel.value = filters.country;
  }).catch(() => {});

  /* ---------- Player ---------- */
  const audio = new Audio();
  audio.preload = "none";
  const player = $("#player");
  const pThumb = $("#p-thumb");
  const pName = $("#p-name");
  const pStatus = $("#p-status");
  const pToggle = $("#p-toggle");
  const vol = $("#volume");
  let current = null;

  try { const v = localStorage.getItem("miradio_vol"); if (v !== null) vol.value = v; } catch (e) {}
  audio.volume = Number(vol.value);
  vol.addEventListener("input", () => {
    audio.volume = Number(vol.value);
    try { localStorage.setItem("miradio_vol", vol.value); } catch (e) {}
  });

  function setPlayerState(state) {
    player.classList.toggle("playing", state === "playing");
    pToggle.innerHTML = state === "playing" ? ICON_PAUSE : state === "loading" ? '<div class="spinner"></div>' : ICON_PLAY;
    pToggle.setAttribute("aria-label", state === "playing" ? "Pause" : "Play");
    pStatus.textContent = { playing: "Playing now", loading: "Connecting…", paused: "Paused", error: "Station unavailable, try another" }[state];
    markCurrent();
  }

  function markCurrent() {
    $$(".station").forEach((el) => {
      const isCur = current && el.dataset.uuid === current.stationuuid;
      el.classList.toggle("current", !!isCur);
      const btn = $(".play", el);
      const playing = isCur && !audio.paused;
      btn.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
    });
  }

  function playStation(s) {
    if (current && current.stationuuid === s.stationuuid) {
      if (!audio.paused) { audio.pause(); return; }
    } else {
      current = s;
      audio.src = Radio.streamUrl(s);
      pName.textContent = s.name.trim();
      pThumb.style.background = Radio.color(s.name);
      pThumb.innerHTML = thumbHtml(s);
      document.title = `▶ ${s.name.trim()} — MiRadio Listen`;
      Radio.click(s.stationuuid);
      if ("mediaSession" in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: s.name.trim(), artist: "MiRadio Listen",
          artwork: s.favicon && s.favicon.startsWith("https://") ? [{ src: s.favicon }] : [],
        });
      }
    }
    player.classList.add("show");
    setPlayerState("loading");
    audio.play().catch((err) => { if (err.name !== "AbortError") setPlayerState("error"); });
  }

  pToggle.addEventListener("click", () => {
    if (!current) return;
    if (audio.paused) {
      setPlayerState("loading");
      // Reload the live stream so playback resumes at the live edge.
      audio.src = Radio.streamUrl(current);
      audio.play().catch(() => setPlayerState("error"));
    } else audio.pause();
  });

  audio.addEventListener("playing", () => setPlayerState("playing"));
  audio.addEventListener("waiting", () => { if (current) pStatus.textContent = "Buffering…"; });
  audio.addEventListener("pause", () => setPlayerState("paused"));
  audio.addEventListener("error", () => { if (current) setPlayerState("error"); });

  /* ---------- Initial state from URL ---------- */
  const params = new URLSearchParams(location.search);
  if (params.get("q")) { filters.name = params.get("q"); q.value = filters.name; }
  if (params.get("tag")) {
    const t = params.get("tag");
    if ($(`#genres .chip[data-tag="${CSS.escape(t)}"]`)) setTag(t); else filters.tag = t;
  }
  if (params.get("country")) filters.country = params.get("country").toUpperCase();
  updateTitle();
  load();
})();
