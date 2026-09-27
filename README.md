# VacScope — robot vacuum comparison site (Amazon.com affiliate)

Part of SpecVersus: https://robotvacuums.specversus.com (sister of scooters.specversus.com).
Static, data-driven site. Every page is generated from the data files.

```
data/products.json   ← robot database (generated first by tools/make_products.py; edit directly afterwards)
data/site.json       ← brand, categories, buying guides, fit-finder settings
data/matchups.json   ← head-to-head pages (/vs/)
data/raw/*.md        ← raw notes captured from each Amazon listing
tools/build.py       ← generator: python3 tools/build.py → dist/
src/assets/          ← CSS, JS (comparator, fit finder, compare tray), favicon, _headers
netlify.toml         ← Netlify build settings (Netlify runs the build on every push)
```

## Rules the data follows
- `affiliate_url` is the Amazon affiliate link exactly as given (tag `microtools0f-20`).
- Missing specs are `null` and display as "—". Nothing is estimated; conflicting sources are noted in `specs_extra`.
- Scores: suction and low_profile are formula-based (see /how-we-rate/); the rest are editorial.
- Fit finder (/fit-finder/) runs in the browser: height + 0.2 in margin, single-threshold climbing, coverage = runtime × 7 ft²/min.
