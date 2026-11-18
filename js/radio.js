/* ==========================================================
   MiRadio — station data via the free, community-run
   Radio Browser API (https://www.radio-browser.info)
   ========================================================== */
(function () {
  const MIRRORS = [
    "https://de1.api.radio-browser.info",
    "https://nl1.api.radio-browser.info",
    "https://at1.api.radio-browser.info",
    "https://de2.api.radio-browser.info",
  ];
  let active = 0;

  async function request(path, params) {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    let lastErr;
    for (let i = 0; i < MIRRORS.length; i++) {
      const idx = (active + i) % MIRRORS.length;
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 8000);
        const res = await fetch(MIRRORS[idx] + path + qs, { signal: ctrl.signal });
        clearTimeout(timer);
        if (!res.ok) throw new Error("HTTP " + res.status);
        active = idx;
        return await res.json();
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error("Radio directory unavailable");
  }

  // On an https page browsers block http audio, so keep only https streams then.
  const needHttps = location.protocol === "https:";

  function clean(list) {
    const seen = new Set();
    return (list || []).filter((s) => {
      const url = s.url_resolved || s.url;
      if (!url) return false;
      if (needHttps && !url.startsWith("https://")) return false;
      const key = (s.name || "").trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  const Radio = {
    async search({ name = "", tag = "", country = "", limit = 48, offset = 0, order = "clickcount" } = {}) {
      const params = { limit: limit * 2, offset, order, reverse: "true", hidebroken: "true" };
      if (name) params.name = name;
      if (tag) { params.tag = tag; params.tagExact = "false"; }
      if (country) params.countrycode = country;
      const data = await request("/json/stations/search", params);
      return clean(data).slice(0, limit);
    },
    async top(limit = 24) {
      const data = await request("/json/stations/topclick/" + limit * 2, { hidebroken: "true" });
      return clean(data).slice(0, limit);
    },
    async byUuids(uuids) {
      if (!uuids.length) return [];
      const data = await request("/json/stations/byuuid", { uuids: uuids.join(",") });
      return data || [];
    },
    async countries() {
      return request("/json/countries", { order: "stationcount", reverse: "true", hidebroken: "true" });
    },
    // Lets the directory know a station was played (keeps popularity rankings useful).
    click(uuid) {
      request("/json/url/" + encodeURIComponent(uuid)).catch(() => {});
    },
    streamUrl(s) { return s.url_resolved || s.url; },
    initials(name) {
      return (name || "?").replace(/[^\p{L}\p{N} ]/gu, "").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "♪";
    },
    color(name) {
      let h = 0;
      for (const ch of name || "") h = (h * 31 + ch.charCodeAt(0)) % 360;
      return `linear-gradient(135deg, hsl(${h} 75% 55%), hsl(${(h + 40) % 360} 80% 45%))`;
    },
    tags(s, n = 2) {
      return (s.tags || "").split(",").map((t) => t.trim()).filter(Boolean).slice(0, n).join(" · ");
    },
  };

  window.Radio = Radio;
})();
