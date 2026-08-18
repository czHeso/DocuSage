/**
 * Text extraction from HTML.
 *
 * Hand-written rather than pulling in a parser. What is needed here is narrow:
 * the visible text of a saved page, with block boundaries preserved so that
 * chunking has something to split on. A full DOM parser would do that too, and
 * would add a dependency and a tree walk for a job three regular expressions
 * do adequately.
 *
 * It is not a general-purpose HTML-to-text converter and does not try to be.
 * Malformed markup produces slightly worse text, never an exception.
 */

/** Elements whose content is markup or code, never prose. */
const NON_CONTENT_ELEMENTS = ["script", "style", "noscript", "template", "svg", "head"];

/** Elements that end a line of text. Everything else is treated as inline. */
const BLOCK_ELEMENTS = [
  "address", "article", "aside", "blockquote", "br", "dd", "div", "dl", "dt",
  "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4",
  "h5", "h6", "header", "hr", "li", "main", "nav", "ol", "p", "pre", "section",
  "table", "tbody", "td", "tfoot", "th", "thead", "tr", "ul",
];

/**
 * Named character references, built rather than listed.
 *
 * Almost every accented entity in HTML is named as its base letter plus the
 * name of its diacritic — `aacute` is a + acute, `scaron` is s + caron,
 * `uring` is u + ring. Composing the letter with the matching combining mark
 * and normalising produces exactly the right character, which covers the whole
 * Latin-1 and Latin-2 range without a hundred lines of table.
 *
 * That range is not optional here. Czech pages are full of &scaron;, &ecaron;
 * and &uring;, and leaving them undecoded breaks the words they appear in for
 * every kind of search.
 */
const COMBINING_MARKS: Record<string, string> = {
  acute: "\u0301",
  grave: "\u0300",
  circ: "\u0302",
  tilde: "\u0303",
  uml: "\u0308",
  ring: "\u030a",
  cedil: "\u0327",
  caron: "\u030c",
  breve: "\u0306",
  macr: "\u0304",
  dblac: "\u030b",
  ogon: "\u0328",
};

/** Entities whose names are not letter-plus-diacritic. */
const LITERAL_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ensp: " ",
  emsp: " ",
  thinsp: " ",
  shy: "",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  minus: "−",
  laquo: "«",
  raquo: "»",
  bdquo: "„",
  ldquo: "\u201c",
  rdquo: "\u201d",
  lsquo: "\u2018",
  rsquo: "\u2019",
  sbquo: "‚",
  bull: "•",
  middot: "·",
  copy: "©",
  reg: "®",
  trade: "™",
  deg: "°",
  euro: "€",
  pound: "£",
  yen: "¥",
  cent: "¢",
  sect: "§",
  para: "¶",
  dagger: "†",
  permil: "‰",
  times: "×",
  divide: "÷",
  plusmn: "±",
  frac12: "½",
  frac14: "¼",
  frac34: "¾",
  sup2: "²",
  sup3: "³",
  szlig: "ß",
  aelig: "æ",
  AElig: "Æ",
  oslash: "ø",
  Oslash: "Ø",
  aring: "å",
  Aring: "Å",
  eth: "ð",
  ETH: "Ð",
  thorn: "þ",
  THORN: "Þ",
  iexcl: "¡",
  iquest: "¿",
};

const NAMED_ENTITIES: Record<string, string> = buildNamedEntities();

function buildNamedEntities(): Record<string, string> {
  const entities: Record<string, string> = { ...LITERAL_ENTITIES };

  const letters = "abcdefghijklmnopqrstuvwxyz";

  for (const letter of letters) {
    for (const [suffix, mark] of Object.entries(COMBINING_MARKS)) {
      for (const base of [letter, letter.toUpperCase()]) {
        const composed = (base + mark).normalize("NFC");
        // Only a combination that collapses into one character is a real
        // entity; "qacute" composes to two characters and does not exist.
        if (composed.length !== 1) continue;

        const name = base + suffix;
        // A literal entry wins: `aring` is the letter, not a + ring, and
        // happens to be the same character - but `deg` and friends must not be
        // overwritten by an accident of naming.
        if (!(name in entities)) entities[name] = composed;
      }
    }
  }

  return entities;
}

export interface ExtractedHtml {
  text: string;
  /** The document title, when the page has one. */
  title: string | null;
}

export function extractTextFromHtml(html: string): ExtractedHtml {
  const title = readTitle(html);

  let text = html;

  for (const element of NON_CONTENT_ELEMENTS) {
    // [\s\S] rather than . so the match crosses newlines, a lazy quantifier so
    // two script blocks do not swallow everything between them, and the `|$`
    // alternative so an unclosed one takes its contents with it. A page saved
    // from the web routinely has an unclosed script at the end, and without
    // that alternative its source ends up in the document text.
    text = text.replace(
      new RegExp(`<${element}\\b[^>]*>[\\s\\S]*?(?:</${element}>|$)`, "gi"),
      " ",
    );
    // A self-closing variant, or a stray closing tag, leaves a tag behind.
    text = text.replace(new RegExp(`</?${element}\\b[^>]*/?>`, "gi"), " ");
  }

  text = text.replace(/<!--[\s\S]*?-->/g, " ");

  // Block boundaries become newlines before the remaining tags are dropped;
  // otherwise two paragraphs run into one another as a single word.
  text = text.replace(new RegExp(`</?(?:${BLOCK_ELEMENTS.join("|")})\\b[^>]*>`, "gi"), "\n");

  text = text.replace(/<[^>]+>/g, " ");
  text = decodeEntities(text);

  return { text: normalizeWhitespace(text), title };
}

function readTitle(html: string): string | null {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return null;

  const title = normalizeWhitespace(decodeEntities(match[1])).replace(/\n+/g, " ");
  return title || null;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, digits) => safeCodePoint(parseInt(digits, 10)))
    .replace(/&([a-z]+);/gi, (whole, name) => NAMED_ENTITIES[name.toLowerCase()] ?? whole);
}

/** An out-of-range or malformed reference is left as a space, not thrown over. */
function safeCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return " ";
  try {
    return String.fromCodePoint(code);
  } catch {
    return " ";
  }
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    // Non-breaking spaces read as text but break word matching in search.
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
