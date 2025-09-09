## Options for CAT integration - GPT answers

Great brief — you’re already set up for a low-cost, high-control workflow. Here’s a concise shortlist that matches your needs (software UI + docs in JSON/Markdown, VS Code plugin, SQLite/CSV cache, volunteer/pro teams).

# Least-cost CAT/TMS options (my short list)

**1) Weblate (open-source, ideal for software; free if OSS, or self-host for \$0)**

* Designed for software; handles JSON (i18next etc.) and **Markdown** out of the box, plus review checks, translation memory (TM), glossary, and Git pull/push built in. ([Weblate][1])
* **Hosted “Libre” plan is gratis** for public/open-source projects; otherwise you can **self-host free** and keep everything private. ([Weblate][2])
* Has a clean REST API and a CLI (`wlc`) for automations (fits your VS Code push/pull model). ([Weblate][3])

**2) Tolgee (open-source, dev-friendly; cloud free tier or self-host free)**

* Built for app localization with in-context translation; strong JSON support and a robust REST API. ([Tolgee][4])
* **Self-host is free** (advanced features require a license); **cloud Free plan** exists (limits by keys/seats/MT credits). Also free Business plan for OSS on cloud. ([Tolgee][5], [Tolgee][6])

**3) MateCat (free CAT in the browser; great for volunteer post-editing)**

* 100% free web CAT by Translated; integrates **MyMemory** TM and can use your TM/glossary; has APIs (you’ve already started on push/pull). ([Matecat][7], [Weblate][8])

**4) POEditor (simple + inexpensive for small private projects)**

* Clear API and automations; pricing scales by string count; **free plan available** (limits apply). Good when you want a quick cloud workflow without self-hosting. ([POEditor][9])

**5) Crowdin / Transifex (powerful cloud, free if open-source)**

* Both run generous **open-source programs** (free for public repos), with mature APIs and Git integrations. Best if your project is public and you prefer a polished hosted experience. ([Crowdin Docs][10], [transifex.com][11])

*(I’m deliberately not pushing pricier enterprise tools like Phrase/Lokalise/Smartling; you can always graduate later.)*

---

# “Fixed translations” / reference termbanks (to pre-seed and prevent drift)

These are the big, **non-MT** resources software teams use to keep UI terms stable across products:

* **Microsoft Terminology** — downloadable TBX (multilingual termbase) replacing the old Language Portal; ideal for standard UI terms (“Save”, “Cancel”, etc.). Import into your glossary/TB. ([Microsoft Learn][12])
* **Unicode CLDR** — the de-facto standard dataset for *localized names of languages/regions, units, calendars, etc.* Use this to prefill standard names and formatting in code & docs (not a general TM, but essential). ([cldr.unicode.org][13], [Microsoft Learn][14])
* **OPUS parallel corpora** — huge open corpora including **GNOME/KDE/Ubuntu UI strings**; good for building your own TMX or seeding your memory for software phrasing. ([Smartcat][15], [POEditor][16])
* **MyMemory** — massive public TM with a **free API**; useful as a cheap “suggestions” backfill beneath your cache.

---

# Recommended stack by scenario

* **Private, \$0 infra, software-centric** → **Self-host Weblate** (or Tolgee) + your SQLite/CSV as the canonical TM. You keep data, reviewers work in the browser, Git sync for JSON/MD. ([Weblate][2], [Weblate][1])
* **Public/OSS with volunteers** → **Hosted Weblate Libre** (gratis) or **Crowdin/Transifex OSS** (gratis). Let the community translate in a familiar UI; keep your VS Code plugin for batch machine-drafts and cache. ([Weblate][2], [Crowdin Docs][10], [transifex.com][11])
* **Quick, low-friction post-editing sprints** → **MateCat** projects linked to your CSV/TMX; volunteers edit in browser; integrate via its API for push/pull. ([Matecat][7], [Weblate][8])
* **Small private projects, minimal ops** → **POEditor** (free tier to start, API for automation). ([POEditor][9])

---

# How I’d wire this into your current flow (minimal effort)

1. **Keep your SQLite→CSV cache as source of truth for TM.**
   Export your cache to **TMX** (and glossary to **TBX**) so any CAT can import it. (All options above accept TMX/TBX via UI or API.)
2. **Use XLIFF as the exchange format** for JSON/Markdown segments.

   * For Markdown especially, run through **Okapi Framework** (or Translate Toolkit’s `markdown2po`) to protect inline code and links, so translators see clean segments and you avoid drift.
3. **API automation from your VS Code plugin**

   * **Weblate/Tolgee**: create/update components via REST (`/api/...`), upload XLIFF/JSON, trigger MT suggestions, fetch reviewed translations back to JSON. ([Weblate][3], [Tolgee][17])
   * **MateCat**: push jobs + pre-seed with TMX; later pull target XLIFF for merge. ([Weblate][8])
   * **POEditor**: use API to upsert terms, upload source, trigger MT, and export JSON; simple when you want lightweight cloud. ([POEditor][9])
4. **Guardrails to prevent drift & MT churn**

   * Lock strings that match glossary/TBX terms; enable ICU-aware checks (plurals/select) in the TMS; pre-fill **CLDR** names via code, not translators. ([cldr.unicode.org][13])

---

## My bottom line (for you)

* If you want **\$0 recurring and full control**: **Self-host Weblate** (or Tolgee) and keep your current SQLite/CSV cache + XLIFF round-trip. That gives you professional review workflow, Git sync, and API automation without vendor lock-in. ([Weblate][2], [Weblate][3])
* If you want **zero ops** and you’re okay being **public**: **Hosted Weblate Libre** or **Crowdin/Transifex OSS** is the smoothest path. ([Weblate][2], [Crowdin Docs][10], [transifex.com][11])
* For **ad-hoc volunteer bursts**: spin up **MateCat** jobs using your TMX; it’s free and fast. ([Matecat][7])

If you tell me which way you’re leaning (self-hosted Weblate vs Tolgee vs MateCat/POEditor), I’ll sketch the exact push/pull endpoints and the JSON/Markdown→XLIFF transform you can drop straight into your VS Code plugin.

[1]: https://docs.weblate.org/ "Weblate 5.13 documentation"
[2]: https://weblate.org/en/hosting/ "Weblate Pricing"
[3]: https://docs.weblate.org/en/latest/api.html "Weblate’s REST API - Weblate 5.13.1 documentation"
[4]: https://docs.tolgee.io/ "Painless localization | Tolgee"
[5]: https://docs.tolgee.io/platform/self_hosting/licensing "Licensing - Tolgee"
[6]: https://tolgee.io/pricing "Pricing - Tolgee"
[7]: https://www.matecat.com/api/docs "API - Matecat"
[8]: https://weblate.org/en/hosting/ "Weblate Pricing"
[9]: https://poeditor.com/kb/machine-translation-api "Machine translation API - POEditor localization platform"
[10]: https://support.crowdin.com/developer/api/ "API | Crowdin Docs"
[11]: https://www.transifex.com/pricing "Pricing - Transifex"
[12]: https://learn.microsoft.com/en-us/globalization/reference/microsoft-terminology "Microsoft Terminology - Globalization | Microsoft Learn"
[13]: https://cldr.unicode.org/ "Common Locale Data Repository - Unicode CLDR Project"
[14]: https://learn.microsoft.com/en-us/globalization/reference/cldr "Common Locale Data Repository (CLDR) - Globalization"
[15]: https://www.smartcat.com/smartwords/ "Free CAT Translator | Powered by AI Agents - Smartcat"
[16]: https://poeditor.com/kb/poeditor-api-limits "POEditor API rates and limitations"
[17]: https://docs.tolgee.io/api/import "Import | Tolgee - docs.tolgee.io"


## My Memory API


* **Docs (specs & endpoints)**: search (`/get`), contribute (`/set`), TMX import (`/v2/tmx/import`), subjects, etc. ([MyMemory][1])
* **API key**: generate or rotate your key here (needed for private memories). ([MyMemory][2])
* **Usage limits**: daily character caps and how to get whitelisted; RapidAPI plans are also linked. ([MyMemory][3])

Quick start (copy-paste):

```bash
# Lookup (MT on by default). Use your contact email with `de=` to raise limits.
curl 'https://api.mymemory.translated.net/get?q=Hello%20World!&langpair=en|it&de=you@example.com'

# Contribute a translation unit to your private TM (requires key)
curl 'https://api.mymemory.translated.net/set?seg=Hello%20World!&tra=Ciao%20Mondo!&langpair=en|it&key=YOUR_KEY&de=you@example.com'

# Import a TMX (multipart upload)
curl -F 'tmx=@/path/to/file.tmx' -F 'private=1' -F 'key=YOUR_KEY' \
  'https://api.mymemory.translated.net/v2/tmx/import'
```

Tip: always include `de=you@example.com` (contact email) and your end-user `ip` when calling from tools to stay within the higher free limits. ([MyMemory][1])

[1]: https://mymemory.translated.net/doc/spec.php "MyMemory API technical specifications"
[2]: https://mymemory.translated.net/doc/keygen.php?utm_source=chatgpt.com "MyMemory: API key generator"
[3]: https://mymemory.translated.net/doc/usagelimits.php "MyMemory Usage Limits Specifications"
