/* ==========================================================
   MiRadio — station dashboard (owners) + sign-ups (admins)
   ========================================================== */
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const db = window.miDb;
  const views = ["loading", "offline", "login", "reset", "app"];
  const STATUS = {
    pending: { label: "Pending review", note: "We're reviewing your station. We'll email you as soon as it's approved." },
    approved: { label: "Approved", note: "Your station is approved. We'll email you the steps to upload music and go live." },
    live: { label: "Live", note: "You're on air! Listeners can tune in now." },
    paused: { label: "Paused", note: "Your station is paused. Contact us if you'd like to bring it back on air." },
  };
  const GENRES = ["Pop", "Hip-Hop", "Rock", "Latin", "Afrobeats", "Jazz", "Gospel", "Talk", "Electronic", "Country", "Reggae", "Variety"];

  let user = null;
  let isAdmin = false;
  let allRows = [];

  function show(name) {
    views.forEach((v) => ($("#view-" + v).hidden = v !== name));
    $("#signout").hidden = name !== "app";
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : ""; }
  function fmtDate(iso) {
    try { return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); } catch (e) { return iso; }
  }
  function setErr(id, msg) {
    const el = $(id);
    el.innerHTML = msg || "";
    el.classList.toggle("show", !!msg);
  }

  if (!db) { show("offline"); return; }

  /* ---------- Streaming server (AzuraCast via Supabase function) ---------- */
  async function stream(action, extra) {
    const { data, error } = await db.functions.invoke("azuracast", { body: Object.assign({ action }, extra) });
    if (error) {
      let msg = error.message || "Request failed";
      try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (e) {}
      if (/Failed to send|not found|404/i.test(msg)) msg = "The streaming server isn't connected yet.";
      throw new Error(msg);
    }
    if (data && data.error) throw new Error(data.error);
    return data || {};
  }

  /* ---------- Auth ---------- */
  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#login-email").value.trim();
    const password = $("#login-password").value;
    if (!email || !password) return setErr("#login-err", "Enter your email and password.");
    const btn = $("#login-form button[type=submit]");
    btn.disabled = true; btn.textContent = "Logging in…";
    const { error } = await db.auth.signInWithPassword({ email, password });
    btn.disabled = false; btn.textContent = "Log in";
    if (error) {
      const msg = /confirm/i.test(error.message)
        ? "Please confirm your email first. Check your inbox (and spam) for the link we sent."
        : /invalid/i.test(error.message) ? "Wrong email or password." : esc(error.message);
      return setErr("#login-err", msg);
    }
    setErr("#login-err", "");
  });

  $("#forgot").addEventListener("click", async (e) => {
    e.preventDefault();
    const email = $("#login-email").value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setErr("#login-err", "Type your email above first, then click “Forgot password?”.");
    const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: new URL("dashboard.html", location.href).href });
    if (error) return setErr("#login-err", esc(error.message));
    setErr("#login-err", "");
    miToast("Password reset link sent. Check your email.");
  });

  $("#reset-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const pw = $("#new-password").value;
    if (pw.length < 8) return setErr("#reset-err", "Use at least 8 characters.");
    const { error } = await db.auth.updateUser({ password: pw });
    if (error) return setErr("#reset-err", esc(error.message));
    miToast("Password updated.");
    load();
  });

  $("#signout").addEventListener("click", async () => {
    await db.auth.signOut();
  });

  let recovering = false;
  db.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") { recovering = true; show("reset"); return; }
    if (recovering && event !== "SIGNED_OUT") return;
    const newUser = session ? session.user : null;
    if ((newUser && newUser.id) === (user && user.id) && event !== "SIGNED_OUT" && event !== "INITIAL_SESSION") return;
    user = newUser;
    // Defer so we don't call the API from inside the auth callback.
    setTimeout(() => (user ? load() : show("login")), 0);
  });

  /* ---------- Load data ---------- */
  async function load() {
    recovering = false;
    show("loading");
    const meta = user.user_metadata || {};
    const first = (meta.owner_name || "").split(" ")[0];
    $("#hello").textContent = first ? `Welcome, ${first}` : "Welcome back";
    $("#who").textContent = user.email;

    const adminRes = await db.rpc("is_admin");
    isAdmin = !adminRes.error && adminRes.data === true;

    const { data, error } = await db.from("stations").select("*").order("created_at", { ascending: false });
    show("app");
    if (error) {
      $("#my-stations").innerHTML = `<div class="contact-card"><p class="muted" style="margin:0">Couldn't load your station: ${esc(error.message)}</p></div>`;
      return;
    }
    renderMine(data.filter((r) => r.owner_id === user.id));
    $("#admin-block").hidden = !isAdmin;
    if (isAdmin) { allRows = data; renderAdmin(); }
  }

  /* ---------- Owner view ---------- */
  function renderMine(rows) {
    const box = $("#my-stations");
    if (!rows.length) {
      box.innerHTML = `<div class="contact-card"><p class="muted">You don't have a station yet.</p><a class="btn btn-primary" href="index.html?start=1">Start a station</a></div>`;
      $("#my-stations-block").hidden = isAdmin; // admins without a station just see the list
      return;
    }
    $("#my-stations-block").hidden = false;
    box.innerHTML = "";
    rows.forEach((r) => box.appendChild(stationCard(r)));
  }

  function kv(label, value, secret) {
    if (value == null || value === "") return "";
    const shown = secret ? "••••••••" : esc(value);
    return `<div class="kv"><span>${esc(label)}</span><code ${secret ? `data-value="${esc(value)}" data-hidden="1"` : ""}>${shown}</code>${
      secret ? '<button type="button" class="link-btn" data-reveal>Show</button>' : ""
    }<button type="button" class="link-btn" data-copy="${esc(value)}">Copy</button></div>`;
  }

  function streamPanel(r) {
    const player = r.player_url || "";
    let host = "", base = "";
    try { const u = new URL(r.stream_url); host = u.hostname; base = u.origin; } catch (e) {}
    try { if (player) base = new URL(player).origin; } catch (e) {}
    const embed = player ? `<iframe src="${player}/embed" frameborder="0" allowtransparency="true" style="width:100%;min-height:150px;border:0;"></iframe>` : "";
    return `
      <div class="ms-stream">
        <div class="ms-col">
          <h4>Listen</h4>
          <audio controls preload="none" src="${esc(r.stream_url)}"></audio>
          ${kv("Stream link", r.stream_url)}
          ${kv("Public page", player)}
          ${embed ? kv("Website player (paste into any site)", embed) : ""}
        </div>
        <div class="ms-col">
          <h4>Go live</h4>
          ${player ? `<a class="btn btn-primary btn-sm" href="${esc(player)}/dj" target="_blank" rel="noopener">🎙 Broadcast from your browser</a>` : ""}
          <p class="muted small" style="margin:12px 0 8px">Or connect OBS, BUTT, Mixxx or VirtualDJ with these settings:</p>
          ${kv("Server", host)}
          ${kv("Port", r.dj_port)}
          ${kv("Mount", "/")}
          ${kv("Username", r.dj_username)}
          ${kv("Password", r.dj_password, true)}
        </div>
        <div class="ms-col">
          <h4>Music &amp; schedule</h4>
          <p class="muted small" style="margin:0 0 12px">Upload songs, build playlists and set your AutoDJ schedule in the control panel.</p>
          ${base ? `<a class="btn btn-ghost btn-sm" href="${esc(base)}/login" target="_blank" rel="noopener">Open control panel</a>` : ""}
          ${r.panel_password ? kv("Login email", r.email) + kv("Temporary password", r.panel_password, true) +
            '<p class="muted small" style="margin:8px 0 0">Change this password after your first login.</p>' : ""}
        </div>
      </div>`;
  }

  function stationCard(r) {
    const st = STATUS[r.status] || STATUS.pending;
    const el = document.createElement("div");
    el.className = "my-station";
    el.innerHTML = `
      <div class="ms-top">
        <div class="ms-logo" style="background:${Radio.color(r.station_name)}">${esc(Radio.initials(r.station_name))}</div>
        <div class="ms-info">
          <h3>${esc(r.station_name)}</h3>
          <div class="muted">${esc(r.genre || "No genre")} · ${esc(cap(r.plan))} plan · since ${esc(fmtDate(r.created_at))}</div>
          <code>miradio.fm/${esc(r.slug || "")}</code>
        </div>
        <span class="status-pill s-${esc(r.status)}">${esc(st.label)}</span>
      </div>
      <p class="ms-note">${esc(st.note)}</p>
      <div class="ms-grid">
        <form class="ms-edit">
          <h4>Station details</h4>
          <div class="field">
            <label>Station name</label>
            <input name="station_name" maxlength="60" value="${esc(r.station_name)}" />
          </div>
          <div class="field">
            <label>Genre</label>
            <select name="genre">${GENRES.map((g) => `<option${g === r.genre ? " selected" : ""}>${g}</option>`).join("")}</select>
          </div>
          <button class="btn btn-primary btn-sm" type="submit">Save changes</button>
        </form>
        <div class="ms-steps">
          <h4>Getting on air</h4>
          <ol>
            <li class="done">Create your account</li>
            <li class="${r.status !== "pending" ? "done" : ""}">Station approved by MiRadio</li>
            <li class="${r.stream_url ? "done" : ""}">Your stream is set up</li>
            <li class="${r.status === "live" ? "done" : ""}">Upload music &amp; go live</li>
          </ol>
          <p class="muted" style="font-size:.85rem;margin:0">Questions? <a class="accent" href="contact.html">Contact us</a>.</p>
        </div>
      </div>
      ${r.stream_url ? streamPanel(r) : ""}`;
    el.querySelectorAll("[data-copy]").forEach((b) =>
      b.addEventListener("click", () => {
        const v = b.dataset.copy;
        (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(
          () => miToast("Copied"),
          () => prompt("Copy this:", v)
        );
      })
    );
    el.querySelectorAll("[data-reveal]").forEach((b) =>
      b.addEventListener("click", () => {
        const t = b.previousElementSibling;
        const hidden = t.dataset.hidden !== "0";
        t.textContent = hidden ? t.dataset.value : "••••••••";
        t.dataset.hidden = hidden ? "0" : "1";
        b.textContent = hidden ? "Hide" : "Show";
      })
    );
    $(".ms-edit", el).addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.currentTarget;
      const name = f.station_name.value.trim();
      if (name.length < 2) return miToast("Station name needs at least 2 characters.");
      const btn = $("button", f);
      btn.disabled = true;
      const { error } = await db.from("stations").update({ station_name: name, genre: f.genre.value }).eq("id", r.id);
      btn.disabled = false;
      if (error) return miToast("Couldn't save: " + error.message);
      miToast("Saved.");
      load();
    });
    return el;
  }

  /* ---------- Admin view ---------- */
  function renderAdmin() {
    const counts = { total: allRows.length, pending: 0, approved: 0, live: 0 };
    allRows.forEach((r) => { if (counts[r.status] !== undefined) counts[r.status]++; });
    $("#adm-stats").innerHTML = [
      ["Total sign-ups", counts.total], ["Pending", counts.pending], ["Approved", counts.approved], ["Live", counts.live],
    ].map(([l, n]) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`).join("");

    const q = $("#adm-search").value.trim().toLowerCase();
    const f = $("#adm-filter").value;
    const rows = allRows.filter((r) =>
      (!f || r.status === f) &&
      (!q || [r.station_name, r.owner_name, r.email, r.slug, r.genre].join(" ").toLowerCase().includes(q))
    );
    const body = $("#adm-rows");
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="8" class="muted" style="text-align:center;padding:30px">${allRows.length ? "No sign-ups match." : "No sign-ups yet. They'll appear here as people join."}</td></tr>`;
      return;
    }
    body.innerHTML = "";
    rows.forEach((r) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${esc(fmtDate(r.created_at))}</td>
        <td><b>${esc(r.station_name)}</b><div class="muted small">miradio.fm/${esc(r.slug || "")}</div></td>
        <td>${esc(r.owner_name || "—")}<div class="small"><a class="accent" href="mailto:${esc(r.email)}">${esc(r.email)}</a></div></td>
        <td>${esc(cap(r.plan))}</td>
        <td>${esc(r.genre || "—")}</td>
        <td>${r.stream_url
          ? `<a class="accent small" href="${esc(r.player_url || r.stream_url)}" target="_blank" rel="noopener">✓ Ready</a>`
          : '<button class="btn btn-ghost btn-sm mk-stream">Create stream</button>'}</td>
        <td><select class="status-select s-${esc(r.status)}" aria-label="Status for ${esc(r.station_name)}">
          ${Object.keys(STATUS).map((s) => `<option value="${s}"${s === r.status ? " selected" : ""}>${cap(s)}</option>`).join("")}
        </select></td>
        <td><button class="icon-btn" title="Delete sign-up" aria-label="Delete ${esc(r.station_name)}">🗑</button></td>`;
      const sel = $("select", tr);
      sel.addEventListener("change", async () => {
        const prev = r.status;
        const next = sel.value;
        sel.disabled = true;
        const { error } = await db.from("stations").update({ status: next }).eq("id", r.id);
        sel.disabled = false;
        if (error) { sel.value = prev; return miToast("Couldn't update: " + error.message); }
        r.status = next;
        sel.className = "status-select s-" + r.status;
        miToast(`${r.station_name} → ${cap(r.status)}`);
        renderAdmin();
        // Keep the streaming server in step with the status.
        try {
          if ((next === "approved" || next === "live") && !r.azuracast_id) {
            await provision(r);
          } else if (r.azuracast_id && (next === "paused") !== (prev === "paused")) {
            await stream("set_enabled", { station_id: r.id, enabled: next !== "paused" });
            miToast(next === "paused" ? "Stream switched off." : "Stream switched back on.");
          }
        } catch (e) {
          miToast("Streaming server: " + e.message);
        }
      });
      const mk = $(".mk-stream", tr);
      if (mk) mk.addEventListener("click", async () => {
        try { await provision(r, mk); } catch (e) { miToast("Couldn't create stream: " + e.message); }
      });
      $(".icon-btn", tr).addEventListener("click", async () => {
        if (!confirm(`Delete the sign-up for “${r.station_name}”? This can't be undone.`)) return;
        const { error } = await db.from("stations").delete().eq("id", r.id);
        if (error) return miToast("Couldn't delete: " + error.message);
        allRows = allRows.filter((x) => x.id !== r.id);
        miToast("Deleted.");
        renderAdmin();
      });
      body.appendChild(tr);
    });
  }

  async function provision(r, btn) {
    if (btn) { btn.disabled = true; btn.textContent = "Creating…"; }
    miToast(`Creating the stream for ${r.station_name}…`);
    try {
      const res = await stream("provision", { station_id: r.id });
      if (res.warnings && res.warnings.length) {
        console.warn("AzuraCast warnings:", res.warnings);
        miToast("Stream created, with notes: " + res.warnings.join(" · "));
      } else {
        miToast(`Stream ready for ${r.station_name}.`);
      }
      await load();
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "Create stream"; }
    }
  }

  $("#adm-search").addEventListener("input", renderAdmin);
  $("#adm-filter").addEventListener("change", renderAdmin);
  $("#adm-refresh").addEventListener("click", load);
  $("#adm-csv").addEventListener("click", () => {
    const cols = ["created_at", "station_name", "slug", "owner_name", "email", "plan", "genre", "status"];
    const cell = (v) => {
      let s = String(v == null ? "" : v);
      if (/^[=+\-@]/.test(s)) s = "'" + s; // stop spreadsheet formula injection
      return '"' + s.replace(/"/g, '""') + '"';
    };
    const csv = [cols.join(",")].concat(allRows.map((r) => cols.map((c) => cell(r[c])).join(","))).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "miradio-signups-" + new Date().toISOString().slice(0, 10) + ".csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
})();
