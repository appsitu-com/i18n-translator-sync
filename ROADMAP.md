## Feature ROADMAP

- [x] JSON file translation (JSON files)
  - [ ] JSONC files
- [ ] Markdown file translation
  - [ ] MD files
  - [ ] MDX files
- [x] Back translation (option)
- [ ] Watcher to sync/translate source => target language folders
  - [x] Translate new/update files on save
  - [ ] Rename/delete matching files
- [ ] Translation cache
- [ ] Translation engines
  - [ ] Copy
  - [x] Google
  - [x] Azure
  - [x] DeepL (Free & Paid)
  - [ ] Gemini
  - [ ] OpenAI
  - [ ] MyMemory
- [ ] Language pair engine selection
  - [x] Default & Override rules
    - [ ] Language rules per Workspace
  - [x] `en-US` => `en-GB` support via DeepL
- [ ] Translation Context
  - [ ] DeepL
  - [ ] OpenAI

## To Fix

- [ ] Use withRetry() function on all API engines and move the parameters into `TranslatorConfigBase`
