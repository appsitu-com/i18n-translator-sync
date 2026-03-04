## Feature ROADMAP

[x] = Completed | [W] = Work in progress | [ ] Not started

- [x] **Translate on Save** *as you save* source file it is instantly translated into a file for each target language.
  - [x] Markdown & MDX files
  - [x] JSON & YAML files
  - [x] TypeScript files (`export default { ... }` pattern)
  - [ ] Can convert translated JSON to a JavaScript or TypeScript file.
- [x] **Back translation** from each target file back to a new file in the source language. This allow you to:
  - Check which source text was likely mistranslated by an AI engine - even when you can't read the target language.
  - View back translations in your application for any target language.
  - Revise & save source text file with alternative words or phrases and instantly re-check the new back translation for all target languages.
- [x] **Translation folder mirroring**
  - When a source folder is configured, changes to files in that folder are mirrored in all the target translation folders.
  - This ensures that files you create, rename or delete in the source folder are likewise created, renamed or deleted in all the target folders.
  - New or updated files are re-translated and then back translated in to all target folders.
- [x] **Multiple Translation Engines**
  - [x] Copy (no translation)
  - [x] Azure
  - [x] Google
  - [x] DeepL
  - [x] Gemini LLM
  - [ ] Open Router LLMs
  - DeepL supports AI translation of English text to US and UK English.
  - Open Router supports almost *any* LLM models via a single API router service.
  - The "Copy" engine is useful when you wish to keep the source file/folder separate from target files/folders and just make a copy when the source and target are the same language.

- [W] **Contextual Translation** (DeepL, Gemini and OpenRouter). Status: *Experimental*. *Current implementation is likely to be revised*.
  - Problem: Translations of short strings common in user interfaces (like button labels) are often poorly translated by AI engines
  - Solution: Configure contextual information for keys in JSON and YAML files that provides contextual information included in prompts to LLM & DeepL APIs.

- [W] **Translation memory** (TM). We use a database of past translations that allows:
  - Faster & cheaper translations as only *new* or *changed* strings (JSON/YAML) or paragraphs (Markdown/MDX) are retranslated.
  - Ensures translations remain stable as AI engines tend to randomly alter results when retranslating.
  - [W] Automatic purging of unused past translations.
  - [W] Exported/imported to CSV files. CSV exports should be committed to GIT to preserve stable translations and reduce AI costs.

- [W] **VS Code commands**:
  - [x] **Translator: Start or Restart** - Activates the Translate on Save service. 1st time it creates an initial `translator.json` file for your API keys that's excluded from GIT.
  - [x] **Translator: Stop** - Deactivates the "translate on save" feature.

  - [ ] **Translator: Retranslate** - Manually retranslate without activating the Translate on Save service.
  - [ ] **Translator: Push to MateCat** - Exports the local TM database and pushes it to a MateCat project.
  - [ ] **Translator: Pull from MateCat** - Pulls the MateCat project revisions and imports these into the local TM database.

- [W] Configure and test GitHub Actions.

- [W] *Export & Push* your local TM database to a CAT service (like MateCat) and later *Pull & Import* the revisions back into you local project.
- [ ] Integrate [MateCat.com](https://matecat.com) translation service.

## To Fix

- [ ] Use withRetry() function on all API engines and move the parameters into `TranslatorConfigBase`

## MateCat integration - Work in progress

We plan to integrate this extension with an online Computer Aided Translation (CAT) service and the most likely candidate is MateCat.com
You'll be able to then treat your AI translations as _draft_ to be be reviewed and revised by a human translation team.

MateCat is an open source platform you can run in house for free or use their *free* cloud service for 200+ languages and dialects.
You can invite your own translators & reviewers or outsource to their professional translators.
MateCat has it's own leading edge AI tools and access to an 8 million phrase public TM dictionary used by big tech software companies.
You can maintain & backup your own private translation memory (TM) dictionary in MateCat or contribute to the public TM.
You can reuse your public or private translation memory to maintain consistent terminology and translation of terms across your future corporate projects.
