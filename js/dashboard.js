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
            <li class="${r.status === "live" ? "done" : ""}">Upload music &amp; go live</li>
          </ol>
          <p class="muted" style="font-size:.85rem;margin:0">Questions? <a class="accent" href="contact.html">Contact us</a>.</p>
        </div>
      </div>`;
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
      body.innerHTML = `<tr><td colspan="7" class="muted" style="text-align:center;padding:30px">${allRows.length ? "No sign-ups match." : "No sign-ups yet. They'll appear here as people join."}</td></tr>`;
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
        <td><select class="status-select s-${esc(r.status)}" aria-label="Status for ${esc(r.station_name)}">
          ${Object.keys(STATUS).map((s) => `<option value="${s}"${s === r.status ? " selected" : ""}>${cap(s)}</option>`).join("")}
        </select></td>
        <td><button class="icon-btn" title="Delete sign-up" aria-label="Delete ${esc(r.station_name)}">🗑</button></td>`;
      const sel = $("select", tr);
      sel.addEventListener("change", async () => {
        const prev = r.status;
        sel.disabled = true;
        const { error } = await db.from("stations").update({ status: sel.value }).eq("id", r.id);
        sel.disabled = false;
        if (error) { sel.value = prev; return miToast("Couldn't update: " + error.message); }
        r.status = sel.value;
        sel.className = "status-select s-" + r.status;
        miToast(`${r.station_name} → ${cap(r.status)}`);
        renderAdmin();
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
