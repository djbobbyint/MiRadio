/* ==========================================================
   MiRadio — shared site behaviour + home page
   ========================================================== */
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  const ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l10.6-6.86a1 1 0 0 0 0-1.7L9.52 4.29A1 1 0 0 0 8 5.14Z"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
  window.MiIcons = { ICON_PLAY, ICON_PAUSE };

  // Form messages are delivered by FormSubmit (https://formsubmit.co). The code is the
  // private alias FormSubmit issued for the owner's inbox, so the real address stays hidden.
  window.MI_FORM_ENDPOINT = "https://formsubmit.co/ajax/9919f49038c51b3447900ba445516d23";

  window.miSendForm = function (data) {
    return fetch(window.MI_FORM_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(Object.assign({ _template: "table", Page: location.href }, data)),
    })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then((res) => {
        if (!res.ok || String(res.d.success) !== "true") throw new Error(res.d.message || "Send failed");
        return res.d;
      });
  };

  /* ---------- Mobile nav ---------- */
  const toggle = $(".menu-toggle");
  const links = $(".nav-links");
  if (toggle && links) {
    toggle.addEventListener("click", () => {
      const open = links.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open);
    });
    $$("a", links).forEach((a) => a.addEventListener("click", () => links.classList.remove("open")));
  }

  /* ---------- Footer year ---------- */
  $$(".year").forEach((el) => (el.textContent = new Date().getFullYear()));

  /* ---------- Reveal on scroll ---------- */
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    $$(".reveal").forEach((el) => io.observe(el));
  } else {
    $$(".reveal").forEach((el) => el.classList.add("in"));
  }

  /* ---------- Toast ---------- */
  window.miToast = function (msg) {
    let t = $(".toast");
    if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove("show"), 3000);
  };

  /* ---------- Pricing toggle ---------- */
  const billBtns = $$(".billing-toggle button");
  billBtns.forEach((b) =>
    b.addEventListener("click", () => {
      billBtns.forEach((x) => x.classList.toggle("on", x === b));
      const yearly = b.dataset.bill === "yearly";
      $$(".price[data-monthly]").forEach((p) => {
        const m = Number(p.dataset.monthly);
        const val = yearly ? Math.round(m * 0.8) : m;
        p.innerHTML = `$${val}<small>/mo</small>`;
      });
      $$(".plan .per").forEach((p) => {
        if (p.dataset.free) return;
        p.textContent = yearly ? "billed yearly — save 20%" : "billed monthly";
      });
    })
  );

  /* ---------- Directory teaser (home) ---------- */
  const teaser = $("#teaser-search");
  if (teaser) {
    teaser.addEventListener("submit", (e) => {
      e.preventDefault();
      const q = $("input", teaser).value.trim();
      location.href = "listen.html" + (q ? "?q=" + encodeURIComponent(q) : "");
    });
  }

  /* ---------- Hero demo player ---------- */
  const demo = $("#demo-phone");
  if (demo && window.Radio) {
    const audio = new Audio();
    audio.preload = "none";
    const btn = $(".big-play", demo);
    const nameEl = $(".st-name", demo);
    const metaEl = $(".st-meta", demo);
    const art = $(".art", demo);
    const hint = $(".hint", demo);
    let stations = [];
    let idx = 0;

    function show(s) {
      nameEl.textContent = s.name.trim();
      metaEl.textContent = [Radio.tags(s, 1), s.country].filter(Boolean).join(" · ") || "Live internet radio";
      if (s.favicon && s.favicon.startsWith("https://")) {
        const img = new Image();
        img.alt = "";
        img.onload = () => { art.innerHTML = ""; art.appendChild(img); };
        img.src = s.favicon;
      }
    }

    Radio.top(12).then((list) => {
      stations = list;
      if (stations.length) show(stations[0]);
    }).catch(() => {});

    function setState(state) {
      demo.classList.toggle("playing", state === "playing");
      btn.innerHTML = state === "playing" ? ICON_PAUSE : state === "loading" ? '<div class="spinner"></div>' : ICON_PLAY;
      btn.setAttribute("aria-label", state === "playing" ? "Pause" : "Play");
      hint.textContent = state === "playing" ? "Live now — tap to pause" : state === "loading" ? "Tuning in…" : "Tap for sound";
    }

    function tryPlay() {
      if (!stations.length) { hint.textContent = "Directory unavailable right now"; return; }
      const s = stations[idx];
      show(s);
      audio.src = Radio.streamUrl(s);
      setState("loading");
      audio.play().then(() => Radio.click(s.stationuuid)).catch(() => {
        // Try the next popular station if this stream refuses to play.
        idx = (idx + 1) % stations.length;
        if (idx !== 0) tryPlay(); else setState("idle");
      });
    }

    audio.addEventListener("playing", () => setState("playing"));
    audio.addEventListener("error", () => {
      if (!audio.src) return;
      idx = (idx + 1) % stations.length;
      if (idx !== 0) tryPlay(); else setState("idle");
    });

    btn.addEventListener("click", () => {
      if (!audio.paused) { audio.pause(); audio.removeAttribute("src"); audio.load(); setState("idle"); return; }
      tryPlay();
    });
  }

  /* ---------- Start-your-station wizard ---------- */
  const modal = $("#start-modal");
  if (!modal) return;

  const state = { name: "", genre: "", plan: "free", email: "" };
  const steps = $$(".wiz-step", modal);
  const bars = $$(".progress i", modal);
  let step = 0;

  function go(n) {
    step = n;
    steps.forEach((s, i) => (s.hidden = i !== n));
    bars.forEach((b, i) => b.classList.toggle("on", i <= n));
    const focusable = $("input, button.on, button", steps[n]);
    if (focusable) setTimeout(() => focusable.focus(), 50);
  }

  function open(prefill) {
    if (prefill) state.name = prefill;
    $("#wiz-name").value = state.name;
    modal.classList.add("open");
    document.body.style.overflow = "hidden";
    go(0);
  }
  function close() {
    modal.classList.remove("open");
    document.body.style.overflow = "";
  }

  $$("[data-start]").forEach((el) =>
    el.addEventListener("click", (e) => {
      e.preventDefault();
      if (el.dataset.plan) state.plan = el.dataset.plan;
      open();
    })
  );
  $$(".start-form").forEach((f) =>
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      open($("input", f).value.trim());
    })
  );
  $(".modal-close", modal).addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && modal.classList.contains("open")) close(); });

  function err(id, show) { $(id).classList.toggle("show", show); }

  // Step 1: name
  $("#wiz-next-1").addEventListener("click", () => {
    state.name = $("#wiz-name").value.trim();
    const bad = state.name.length < 2;
    err("#err-name", bad);
    if (!bad) go(1);
  });
  $("#wiz-name").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#wiz-next-1").click(); });

  // Step 2: genre
  $$(".genre-pick button", modal).forEach((b) =>
    b.addEventListener("click", () => {
      $$(".genre-pick button", modal).forEach((x) => x.classList.toggle("on", x === b));
      state.genre = b.textContent;
      err("#err-genre", false);
    })
  );
  $("#wiz-back-2").addEventListener("click", () => go(0));
  $("#wiz-next-2").addEventListener("click", () => {
    if (!state.genre) return err("#err-genre", true);
    $$('.plan-pick input', modal).forEach((r) => (r.checked = r.value === state.plan));
    go(2);
  });

  // Step 3: plan + email
  $("#wiz-back-3").addEventListener("click", () => go(1));
  $("#wiz-next-3").addEventListener("click", () => {
    const btn = $("#wiz-next-3");
    if (btn.disabled) return;
    state.person = $("#wiz-person").value.trim();
    state.email = $("#wiz-email").value.trim();
    const picked = $('.plan-pick input:checked', modal);
    state.plan = picked ? picked.value : "free";
    const badPerson = state.person.length < 2;
    const badEmail = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email);
    err("#err-person", badPerson);
    err("#err-email", badEmail);
    err("#err-send", false);
    if (badPerson || badEmail) return;

    const slug = state.name.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").slice(0, 40) || "my-station";
    const planName = state.plan[0].toUpperCase() + state.plan.slice(1);

    btn.disabled = true;
    btn.textContent = "Creating…";
    miSendForm({
      _subject: "New MiRadio sign-up: " + state.name,
      _replyto: state.email,
      "Station name": state.name,
      Genre: state.genre,
      Plan: planName,
      Name: state.person,
      Email: state.email,
      "Requested address": "miradio.fm/" + slug,
    })
      .then(() => {
        $("#done-name").textContent = state.name;
        $("#done-genre").textContent = state.genre + " · " + planName + " plan";
        $("#done-url").textContent = "miradio.fm/" + slug;
        $("#done-logo").textContent = window.Radio ? Radio.initials(state.name) : state.name[0];
        $("#done-email").textContent = state.email;
        try { localStorage.setItem("miradio_station", JSON.stringify(state)); } catch (e) {}
        go(3);
      })
      .catch(() => err("#err-send", true))
      .finally(() => {
        btn.disabled = false;
        btn.textContent = "Create my station";
      });
  });
  $("#wiz-done").addEventListener("click", close);
})();
