# MateCAT.com integration plan

## GOAL

Our local translation memory (TM) database records all AI translations with a status: `initial` and origin: `ai`.
We will integrate the local TM with MateCAT so that we can employ human translators to review and where needed update the AI draft translations.

We will try to keep the option to integrate other CAT tools for translation review that support TMX and XLIFF files in the future
With this in mind we will aim to keep our settings and terminology platform neutral where possible.

Our Human translator will either see just the new texts that need translation OR all translations for a given file sorted by textPos so they full document content.
In either case we preserve the translation status of each text string between our local TM and MateCAT so the human translators knows which new text strings required translation, review or approval.
We export XLIFF files to MateCAT that record become a job for a human translator.
We exclude back translations from this external review process as we're only interested in improving forward translations.

We're assuming MateCAT will export the draft AI translations from our local TM.
To do this we prepare an XLIFF files per source file per target language.

To assist the human translator, we upload a TMX file for a given target language based on records in our local TM database.
By default we only include local TM records in the TMX having status = `final` or `reviewed` but this is configurable.

Our workflow is as follows:

### Command: `Review Push`:
- Count the number of translations requiring human review
- Display the translation count and confirm Push action if count > 0
- Display message that there are no translations requiring review if count == 0
- For each review target language:
  - Generate a TMX file based on a filtered list from all translations for this target local from our local TM database
  - Generate an XLIFF file per source file for each source file referenced in our local TM.
    - Contains ALL translations from the source file file so the translator has the full context but
  - Create a new project via API and upload the generated files.
  - Record pending project IDs

Options
- XLIFF files can be configured to either have ALL

### Command: `Review Pull`:
- Check job status of pending projects
- Show projects ready to download and confirm with VSCode user
- Get download URLs for updated XLIFF files
- Download XLIFF files
- Import changes from XLIFF into our local TM database
- Retranslate all files that should now use the updated TM records.
- Close pending project if all their downloads are merged into local TM.

### Command: `Review status`
- Check job status of pending projects
- Show project status to VSCode user

### Translation ranking

Our current AI only translations use an exact match (same textPos) and fallback lookup that also tracks AI engine.
Now that we depend on another source of translation information (human translation), we need to consider how we will rank these lookups so that human translation take precedence over AI translations.
The new `origin` field now identifies `ai` translations but it should also record human and TM origins and exploit this for lookup ranking.
This change may also affect how we purge translations.

## XLIFF translation status

The XLIFF 2.0 standard uses these standard status values.

- `initial` - indicates the segment is in its initial state.
- `translated` - indicates the segment has been translated.
- `reviewed` - indicates the segment has been reviewed.
- `final` - indicates the segment is finalized and ready to be used.

## Solution

The `matecat.json` configuration file is used for default form-data parameters for `POST /api/v1/new` project creation requests.
MateCAT endpoint base URL and HTTP methods are defined in code (not configurable). Authentication uses `MATECAT_API_KEY` loaded from `translator.env`.
The `reviewer.targetLocales.include` and `reviewer.targetLocales.exclude` rules can filter the subset of target languages to be reviewed.

`.translator/review/$locale/upload/` = XLIFF and TMX files to uploaded to MateCAT
`.translator/review/$locale/download/` = XLIFF files downloaded from MateCAT

### MateCAT APIs

| Endpoint | Purpose |
| --- | --- |
| `POST /api/v1/new` | Create a review project and upload XLIFF/TMX files |
| `GET /api/v3/projects/{id_project}/{password}/analysis/status` | Check project analysis/review status |
| `GET /api/v3/projects/{id_project}/{password}/urls` | Retrieve project file download URLs |
| `GET {xliff_download_url}` | Download reviewed XLIFF files |
