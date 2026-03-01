export type Provider = "speakerdeck" | "docswell" | "google_slides";

export interface DetectResult {
  provider: Provider;
  canonicalUrl: string;
}

export type ProviderErrorCode =
  | "INVALID_URL"
  | "UNSUPPORTED_SCHEME"
  | "UNSUPPORTED_PROVIDER"
  | "INVALID_FORMAT"
  | "UNSUPPORTED_URL_TYPE";

export class ProviderError extends Error {
  constructor(
    public readonly code: ProviderErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

// provider-spec.md セクション 2.2, 3.2, 4.2

const SPEAKERDECK_SLIDE_RE =
  /^\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)\/?$/;
const SPEAKERDECK_PLAYER_RE = /^\/player\//;
const SPEAKERDECK_RESERVED_PATHS = new Set([
  "c", "features", "signin", "join", "search",
]);

const DOCSWELL_SLIDE_RE =
  /^\/s\/([A-Za-z0-9_]+)\/([A-Z0-9]{6})(-[A-Za-z0-9_-]+)?\/?$/;
const DOCSWELL_EMBED_RE = /^\/slide\//;

const GOOGLE_SLIDES_RE =
  /^\/presentation\/d\/([a-zA-Z0-9_-]{25,})(?:\/[a-z]*)?\/?$/;
const GOOGLE_SLIDES_PUBLISHED_RE =
  /^\/presentation\/d\/e\//;

export function detectProvider(input: string): DetectResult {
  const trimmed = input.trim();

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new ProviderError(
      "INVALID_URL",
      "入力された文字列は有効な URL ではありません",
    );
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ProviderError(
      "UNSUPPORTED_SCHEME",
      "http または https の URL を入力してください",
    );
  }

  const hostname = parsed.hostname.replace(/^www\./, "");
  const pathname = parsed.pathname;

  // --- SpeakerDeck ---
  if (hostname === "speakerdeck.com") {
    if (SPEAKERDECK_PLAYER_RE.test(pathname)) {
      throw new ProviderError(
        "UNSUPPORTED_URL_TYPE",
        "この URL は登録できません。スライドの公開ページの URL を入力してください",
      );
    }
    const match = pathname.match(SPEAKERDECK_SLIDE_RE);
    if (!match || SPEAKERDECK_RESERVED_PATHS.has(match[1])) {
      throw new ProviderError(
        "INVALID_FORMAT",
        "URL の形式が正しくありません。スライドの公開 URL を入力してください",
      );
    }
    const [, username, slug] = match;
    return {
      provider: "speakerdeck",
      canonicalUrl: `https://speakerdeck.com/${username}/${slug}`,
    };
  }

  // --- Docswell ---
  if (hostname === "docswell.com") {
    if (DOCSWELL_EMBED_RE.test(pathname)) {
      throw new ProviderError(
        "UNSUPPORTED_URL_TYPE",
        "この URL は登録できません。スライドの公開ページの URL を入力してください",
      );
    }
    const match = pathname.match(DOCSWELL_SLIDE_RE);
    if (!match) {
      throw new ProviderError(
        "INVALID_FORMAT",
        "URL の形式が正しくありません。スライドの公開 URL を入力してください",
      );
    }
    const [, username, slideId] = match;
    return {
      provider: "docswell",
      canonicalUrl: `https://www.docswell.com/s/${username}/${slideId}`,
    };
  }

  // --- Google Slides ---
  if (hostname === "docs.google.com") {
    if (GOOGLE_SLIDES_PUBLISHED_RE.test(pathname)) {
      throw new ProviderError(
        "UNSUPPORTED_URL_TYPE",
        "この URL は登録できません。スライドの公開ページの URL を入力してください",
      );
    }
    if (!pathname.startsWith("/presentation/")) {
      throw new ProviderError(
        "UNSUPPORTED_PROVIDER",
        "対応していないサービスの URL です。SpeakerDeck / Docswell / Google Slides の URL を入力してください",
      );
    }
    const match = pathname.match(GOOGLE_SLIDES_RE);
    if (!match) {
      throw new ProviderError(
        "INVALID_FORMAT",
        "URL の形式が正しくありません。スライドの公開 URL を入力してください",
      );
    }
    const [, presentationId] = match;
    return {
      provider: "google_slides",
      canonicalUrl: `https://docs.google.com/presentation/d/${presentationId}`,
    };
  }

  throw new ProviderError(
    "UNSUPPORTED_PROVIDER",
    "対応していないサービスの URL です。SpeakerDeck / Docswell / Google Slides の URL を入力してください",
  );
}
