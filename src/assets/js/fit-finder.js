/* VacScope — robot vacuum fit finder. Runs entirely in the browser.
   Needs window.__DB__ (db.js) and window.__FF__ (config inlined by build.py). */
(function () {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function money(v) { return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function num(v) { return v.toLocaleString("en-US"); }

  function init() {
    var root = document.querySelector("[data-ff]");
    var DB = window.__DB__, CFG = window.__FF__;
    if (!root || !DB || !CFG) return;
    var form = root.querySelector("[data-ff-form]");
    var clear = root.querySelector("[data-ff-clear]"), clearOut = root.querySelector("[data-ff-clear-out]");
    var skip = root.querySelector("[data-ff-clear-skip]");
    var budget = root.querySelector("[data-ff-budget]"), budgetOut = root.querySelector("[data-ff-budget-out]");
    var list = root.querySelector("[data-ff-list]"), summary = root.querySelector("[data-ff-summary]");
    var viz = root.querySelector("[data-ff-viz]");
    var focus = (new URLSearchParams(location.search).get("ids") || "").split(",").filter(Boolean);
    var MARGIN = 0.2;

    function val(name) { var el = form.querySelector('input[name="' + name + '"]:checked'); return el ? el.value : ""; }
    function isMop(s) { return s.mop_type && !/^None/.test(s.mop_type); }
    function mopHandlesRugs(s) { return (s.mop_lift_mm && s.mop_lift_mm >= 10) || /detach|left at base|lifts over carpet/i.test(s.mop_type || ""); }
    function basicPad(s) { return /^Pad|^Detachable pad/i.test(s.mop_type || ""); }

    function evaluate(p, a) {
      var s = p.specs, checks = [];
      function add(st, t) { checks.push({ st: st, t: t }); }
      // 1. height
      if (a.clear != null) {
        if (s.height_in == null) add("warn", "Robot height not published — measure before buying");
        else if (s.height_in + MARGIN <= a.clear) add("ok", "Fits under: " + s.height_in + " in vs your " + a.clear.toFixed(2) + " in");
        else if (s.height_in <= a.clear) add("warn", "Very tight: " + s.height_in + " in vs your " + a.clear.toFixed(2) + " in — may wedge");
        else add("no", "Too tall: " + s.height_in + " in vs your " + a.clear.toFixed(2) + " in clearance");
      }
      // 2. thresholds
      if (a.climb > 0) {
        if (s.climb_in == null) add("warn", "Climbing height not published (most robots manage about 0.8 in)");
        else if (s.climb_in >= a.climb) add("ok", "Climbs " + s.climb_in + " in thresholds");
        else add("no", "Climbs " + s.climb_in + " in; you need " + a.climb + " in");
      }
      // 3. coverage
      if (s.runtime_min == null) add("warn", "Runtime not published");
      else {
        var cov = s.runtime_min * CFG.sqftPerMin;
        if (cov >= a.size) add("ok", "About " + num(Math.round(cov / 50) * 50) + " ft² per charge");
        else add("warn", "About " + num(Math.round(cov / 50) * 50) + " ft² per charge — recharges and resumes");
      }
      // 4. pets
      if (a.pets !== "none") {
        if (s.anti_tangle) add("ok", "Anti-tangle brushes");
        else add(a.pets === "heavy" ? "warn" : "warn", "No anti-tangle brush listed — expect to cut hair off the brush");
      }
      // 5. mopping
      if (a.mop !== "no") {
        if (!isMop(s)) add("no", "Vacuum only — doesn't mop");
        else if (a.mop === "rugs") {
          if (mopHandlesRugs(s)) add("ok", "Mop " + (s.mop_lift_mm ? "lifts " + s.mop_lift_mm + " mm" : "lifts or detaches") + " for rugs");
          else add("warn", "Mop doesn't lift — you'll set no-mop zones on rugs");
        } else {
          if (basicPad(s)) add("warn", "Basic pad mop — fine for dust, not sticky messes");
          else add("ok", "Scrubbing mop: " + s.mop_type.split(" (")[0].toLowerCase());
        }
      }
      // 6. dock
      if (a.dock === "empty") {
        if (s.self_empty) add("ok", "Self-emptying" + (s.dock_days ? " (up to " + s.dock_days + " days)" : ""));
        else add("no", "No self-emptying dock");
      } else if (a.dock === "full") {
        var needsWash = a.mop !== "no" && isMop(s);
        if (!s.self_empty) add("no", "No self-emptying dock");
        else if (needsWash && !s.mop_wash) add("warn", "Self-empties, but you wash the mop by hand");
        else if (s.mop_wash) add("ok", "Dock empties, washes" + (s.hot_air_dry ? " and dries" : "") + " the mops");
        else add("ok", "Self-emptying" + (s.dock_days ? " (up to " + s.dock_days + " days)" : ""));
      }
      // 7. budget
      if (p.price != null && p.price > a.budget) add("no", "Over budget: " + money(p.price));
      var st = checks.some(function (c) { return c.st === "no"; }) ? "no" : checks.some(function (c) { return c.st === "warn"; }) ? "warn" : "ok";
      return { p: p, st: st, checks: checks };
    }

    function drawViz(a, results) {
      if (a.clear == null) { viz.innerHTML = ""; viz.hidden = true; return; }
      viz.hidden = false;
      var rs = results.filter(function (r) { return r.p.specs.height_in != null; })
        .sort(function (x, y) { return x.p.specs.height_in - y.p.specs.height_in; });
      var W = 640, H = 170, base = 140, pxIn = 22, bw = Math.min(34, (W - 40) / rs.length - 6);
      var y = function (inch) { return base - inch * pxIn; };
      var svg = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Robot heights compared with your furniture clearance">';
      svg += '<rect x="0" y="' + (y(a.clear) - 26) + '" width="' + W + '" height="26" rx="6" class="ff-sofa"/>';
      svg += '<line x1="0" x2="' + W + '" y1="' + y(a.clear) + '" y2="' + y(a.clear) + '" class="ff-line"/>';
      svg += '<text x="8" y="' + (y(a.clear) - 9) + '" class="ff-sofa-t">Your furniture · ' + a.clear.toFixed(2) + ' in clearance</text>';
      svg += '<line x1="0" x2="' + W + '" y1="' + base + '" y2="' + base + '" class="ff-floor"/>';
      rs.forEach(function (r, i) {
        var h = r.p.specs.height_in, x = 24 + i * (bw + 6);
        var cls = h + MARGIN <= a.clear ? "ok" : h <= a.clear ? "warn" : "no";
        svg += '<g class="ff-bar ff-bar--' + cls + '"><title>' + esc(r.p.name) + " — " + h + ' in</title><rect x="' + x + '" y="' + y(h) + '" width="' + bw + '" height="' + (h * pxIn) + '" rx="4"/>' +
          '<text x="' + (x + bw / 2) + '" y="' + (base + 16) + '" text-anchor="middle">' + h.toFixed(2).replace(/0$/, "") + "</text></g>";
      });
      svg += "</svg>";
      viz.innerHTML = svg + '<p class="ff-viz__cap">Each bar is one robot, drawn to scale (height in inches). Green fits with margin, amber is tight, red won\'t fit.</p>';
    }

    function render() {
      var a = {
        clear: skip.checked ? null : parseFloat(clear.value),
        climb: parseFloat(val("climb")) || 0,
        size: parseFloat(val("size")) || 0,
        pets: val("pets"), mop: val("mop"), dock: val("dock"),
        budget: parseFloat(budget.value)
      };
      clear.disabled = skip.checked;
      clearOut.textContent = skip.checked ? "—" : a.clear.toFixed(2) + " in";
      budgetOut.textContent = a.budget >= parseFloat(budget.max) ? "Any price" : "Up to $" + num(a.budget);
      if (a.budget >= parseFloat(budget.max)) a.budget = Infinity;
      var results = DB.products.map(function (p) { return evaluate(p, a); });
      var rank = { ok: 0, warn: 1, no: 2 };
      results.sort(function (x, y) {
        var fx = focus.indexOf(x.p.id) > -1 ? 0 : 1, fy = focus.indexOf(y.p.id) > -1 ? 0 : 1;
        return fx - fy || rank[x.st] - rank[y.st] || y.p.score - x.p.score;
      });
      var nOk = results.filter(function (r) { return r.st === "ok"; }).length;
      var nWarn = results.filter(function (r) { return r.st === "warn"; }).length;
      summary.innerHTML = "<b>" + nOk + "</b> great fit" + (nOk === 1 ? "" : "s") + " · <b>" + nWarn + "</b> with caveats · <b>" + (results.length - nOk - nWarn) + "</b> not a fit";
      var labels = { ok: "Great fit", warn: "Fits, with caveats", no: "Not a fit" };
      list.innerHTML = results.map(function (r) {
        var p = r.p;
        return '<article class="ff-card ff-card--' + r.st + (focus.indexOf(p.id) > -1 ? " is-focus" : "") + '">' +
          '<a class="ff-card__img" href="' + esc(p.url) + '"><img src="' + esc(p.img) + '" alt="" loading="lazy"></a>' +
          '<div class="ff-card__body"><div class="ff-card__top"><span class="ff-status">' + labels[r.st] + '</span><span class="score-pill" title="Editor score">' + p.score + "</span></div>" +
          '<h3><a href="' + esc(p.url) + '">' + esc(p.name) + "</a></h3>" +
          '<ul class="ff-checks">' + r.checks.map(function (c) { return '<li class="is-' + c.st + '">' + esc(c.t) + "</li>"; }).join("") + "</ul>" +
          '<div class="ff-card__actions">' + (p.price != null ? '<span class="ff-price">' + money(p.price) + "</span>" : "") +
          '<a class="btn btn--amazon btn--xs" href="' + esc(p.aff) + '" target="_blank" rel="sponsored nofollow noopener">View on Amazon<svg class="ico"><use href="#i-ext"/></svg></a>' +
          '<a class="btn btn--ghost btn--xs" href="' + esc(p.url) + '">Review</a></div></div></article>';
      }).join("") + '<p class="note note--muted">Prices from Amazon.com as of ' + esc(DB.products[0].priceDate) + ". Specs are manufacturer claims; see each review for sources.</p>";
      drawViz(a, results);
    }

    form.addEventListener("input", render);
    form.addEventListener("change", render);
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
