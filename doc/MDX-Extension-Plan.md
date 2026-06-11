# MDX component extensions



## Recommended Architecture

### Core Translator

Your existing translator remains responsible for:

* Parsing Markdown / MDX
* Detecting translatable text
* Translation Memory lookup
* Calling translation engines
* Writing translated MDX

The core should expose extension hooks.

Example:

```typescript
export interface TranslationExtension {
  id: string

  beforeTranslate?(
    document: MdxDocument,
    context: TranslationContext
  ): Promise<void>

  afterTranslate?(
    document: MdxDocument,
    context: TranslationContext
  ): Promise<void>

  processNode?(
    node: MdxNode,
    context: TranslationContext
  ): Promise<void>
}
```

---

## MDX Component Strategy

Suppose source contains:

```mdx
<BibleVerse
  reference="John 3:16"
/>
```

The translator should:

1. Leave component structure intact.
2. Translate only translatable props.

Example:

```mdx
<Video
  title="The Good Shepherd"
  description="Jesus cares for his followers"
/>
```

becomes:

```mdx
<Video
  title="El Buen Pastor"
  description="Jesús cuida a sus seguidores"
/>
```

while:

```mdx
<BibleVerse reference="John 3:16" />
```

remains unchanged.

This requires an MDX AST parser such as:

```typescript
remark
remark-mdx
unist
mdast
```

rather than regex.

---

## Extension Registration

Allow projects to define extensions.

Example:

```json
{
  "i18nTranslatorSync": {
    "extensions": [
      "./translator-extensions/bible.js",
      "./translator-extensions/video.js"
    ]
  }
}
```

or:

```yaml
extensions:
  - bible
  - video
```

---

## Cloud Extension APIs

A powerful approach is to allow extensions to run remotely.

Example configuration:

```json
{
  "id": "bible",
  "endpoint": "https://api.example.com/mdx/bible"
}
```

The plugin sends:

```json
{
  "language": "es",
  "node": {
    "type": "BibleVerse",
    "reference": "John 3:16"
  }
}
```

The service returns:

```json
{
  "replacement": {
    "type": "BibleVerse",
    "reference": "Juan 3:16"
  }
}
```

or:

```json
{
  "mdx": "<BibleVerse reference=\"Juan 3:16\" />"
}
```

This lets ministries add their own cloud processors without updating the extension.

---

## Content Enrichment Phase

I would separate:

### Phase 1

Translation

```text
English MDX
   ↓
Translated MDX
```

### Phase 2

Enrichment

```text
Translated MDX
   ↓
Bible lookup
Video lookup
Attribution insertion
Footnotes
Cross references
```

This prevents enrichment logic from affecting translation quality.

Pipeline:

```text
Source MDX
   ↓
Translation
   ↓
Translated MDX
   ↓
Extension Pipeline
   ↓
Final MDX
```

---

## Bible Example

Author writes:

```mdx
{{verse:john-3-16}}
```

Extension resolves:

```mdx
<BibleVerse
  reference="Juan 3:16"
  translation="RVR1960"
/>
```

or:

```mdx
> Porque de tal manera amó Dios al mundo...
```

depending on project settings.

---

## Video Example

Author writes:

```mdx
{{video:shepherd-lesson}}
```

Extension queries your API:

```http
GET /videos/shepherd-lesson?lang=es
```

Returns:

```json
{
  "youtubeId": "...",
  "title": "...",
  "description": "..."
}
```

Generated MDX:

```mdx
<Video
  youtubeId="..."
  title="..."
/>
```

---

## Attribution Example

Extension:

```mdx
<Attribution
  source="Bible API"
  licence="CC BY-SA"
/>
```

or

```mdx
<TranslationCredits
  translator="AppSitu AI"
  reviewedBy="..."
/>
```

added automatically.

---

## What I Would Build

Given your existing translation-memory architecture, I would implement:

### 1. AST-based MDX processing

Using:

* `remark`
* `remark-mdx`
* `unist-util-visit`

### 2. Extension hooks

```typescript
beforeTranslate()
translateNode()
afterTranslate()
```

### 3. Local or Remote Extensions

```typescript
type Extension =
  | LocalExtension
  | RemoteExtension
```

### 4. Project-specific configuration

```yaml
mdx:
  extensions:
    - bible
    - video
    - attribution
```

### 5. Cloud APIs

Your VSCode extension becomes a generic orchestrator.

Individual ministries or organizations can create:

* Bible extension service
* Video extension service
* Sermon extension service
* Quiz extension service
* Courseware extension service

without needing to publish a new VSCode extension.

This scales much better than hard-coding Bible and video functionality into the translator itself and fits well with your existing AppSitu translation-memory and multi-engine architecture.
