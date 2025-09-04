// Markdown/MDX extractor with single slots[] and optional frontmatter key translations

export type MarkdownExtraction = {
  kind: 'markdown';
  segments: string[];                 // [ front-matter values..., body blocks... ]
  contexts?: (string | null)[];
  rebuild(translated: string[]): string;
};

const SLOT_RE = /<div class="notranslate" data-slot-id="(\d+)"><\/div>/g;
const SLOT_TOKEN = (id: number) => `<div class="notranslate" data-slot-id="${id}"></div>`;

const FMSEG_RE = /__FMSEG_(\d+)__/g;
const FMSEG_TOKEN = (i: number) => `__FMSEG_${i}__`;

export function extractMarkdownOrMDX(input: string, frontmatterKeys?: string[]): MarkdownExtraction {
  let text = input;
  const slots: string[] = [];
  const frontKeys = new Set((frontmatterKeys ?? []).map(k => k.trim()).filter(Boolean));
  const frontSegments: string[] = [];

  const putSlot = (original: string) => {
    const id = slots.length;
    slots.push(original);
    return SLOT_TOKEN(id);
  };

  // ---- 1) Front matter (--- or +++) with optional key extraction ----
  // Capture delimiter and content so we can modify content then slot the whole block.
  const fmMatch = /^(---|\+\+\+)\s*\n([\s\S]*?)\n\1\s*(\r?\n)?/.exec(text);
  if (fmMatch) {
    const [full, delim, content] = fmMatch;
    // Parse simple YAML key: value pairs (single-line scalars). Multiline/arrays left intact.
    const lines = content.split(/\r?\n/);
    let fmSegIndex = 0;
    const newLines = lines.map(line => {
      if (!frontKeys.size) return line;
      // key: value
      const m = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
      if (!m) return line;
      const key = m[1];
      let val = m[2];

      if (!frontKeys.has(key)) return line;

      // Handle quoted scalars "..." or '...'
      const q = /^"([\s\S]*)"$/.exec(val) || /^'([\s\S]*)'$/.exec(val);
      if (q) {
        const inner = q[1];
        const segIdx = frontSegments.length;
        frontSegments.push(inner);
        return `${key}: ${val[0]}${FMSEG_TOKEN(segIdx)}${val[val.length - 1]}`;
      }

      // Ignore block/folded scalars and complex values (start with | or > or [ or { )
      if (/^\s*[>|[{]/.test(val)) return line;

      // Treat remainder of line as scalar
      const segIdx = frontSegments.length;
      frontSegments.push(val);
      return `${key}: ${FMSEG_TOKEN(segIdx)}`;
    });

    const modifiedFrontMatter = `${delim}\n${newLines.join('\n')}\n${delim}\n`;
    // Replace the original front matter with a slot containing the modified one
    text = modifiedFrontMatter + text.slice(full.length);
    // Now slot the entire modified front matter so translators don't touch anything except tokens
    text = text.replace(modifiedFrontMatter, putSlot(modifiedFrontMatter));
  }

  // ---- 2) Slot all non-translatable constructs in the body ----

  // Fenced code blocks
  text = text.replace(
    /(^|\n)(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\2(\n|$)/g,
    m => (m.startsWith('\n') ? '\n' : '') + putSlot(m.trimStart()) + (m.endsWith('\n') ? '\n' : '')
  );

  // MDX/HTML blocks and inline tags
  text = text.replace(
    /<([A-Za-z][A-Za-z0-9:_-]*)(\s[^<>]*?)?(\/?)>([\s\S]*?)(<\/\1>)?/g,
    m => putSlot(m)
  );

  // Inline code spans
  text = text.replace(/`[^`\n]+`/g, m => putSlot(m));

  // Link & image destinations: keep label/alt translatable; slot the (url "title")
  text = text.replace(
    /(!?\[[^\]]*\])\(\s*([^()\s][^)]*?)\s*\)/g,
    (_m, label, dest) => `${label}(${putSlot(dest)})`
  );

  // Autolinks
  text = text.replace(/<([a-z]+:[^>\s]+)>/gi, m => putSlot(m));

  // ---- 3) Split body into paragraph blocks (2+ newlines) ----
  const bodyBlocks: string[] = [];
  const delims: string[] = [];
  {
    const parts = text.split(/\n{2,}/);
    const re = /\n{2,}/g;
    let m: RegExpExecArray | null;
    let lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      bodyBlocks.push(text.slice(lastIndex, m.index));
      delims.push(m[0]);
      lastIndex = re.lastIndex;
    }
    bodyBlocks.push(text.slice(lastIndex));
  }

  // Final segments = [ front matter values..., body blocks... ]
  const segments = frontSegments.concat(bodyBlocks);

  // ---- 4) Rebuild ----
  const restoreSlots = (s: string) =>
    s.replace(SLOT_RE, (_m, idStr) => slots[Number(idStr)] ?? '');

  const rebuild = (translated: string[]): string => {
    const frontCount = frontSegments.length;
    const expected = frontCount + bodyBlocks.length;
    if (translated.length !== expected) {
      throw new Error(`Segment count mismatch: expected ${expected}, got ${translated.length}`);
    }

    // 4a) Rebuild body with original delimiters from the tail of translated array
    const bodyTranslated = translated.slice(frontCount);
    let bodyOut = '';
    for (let i = 0; i < bodyTranslated.length; i++) {
      if (i) bodyOut += delims[i - 1];
      bodyOut += bodyTranslated[i];
    }

    // 4b) Restore slots (brings back the front-matter block with FM tokens & all non-translatable parts)
    bodyOut = restoreSlots(bodyOut);

    // 4c) Substitute FM tokens with translated front matter values (in order)
    const fmValues = translated.slice(0, frontCount);
    let fmIdx = 0;
    bodyOut = bodyOut.replace(FMSEG_RE, (_m, idxStr) => {
      const idx = Number(idxStr);
      return fmValues[idx] ?? '';
    });

    return bodyOut;
  };

  return { kind: 'markdown', segments, rebuild };
}

