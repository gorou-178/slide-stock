import { describe, it, expect } from "vitest";
import { detectProvider, ProviderError } from "./provider";

// provider-spec.md セクション6 テストケース一覧

describe("detectProvider", () => {
  // ============================================================
  // 6.1 SpeakerDeck
  // ============================================================
  describe("SpeakerDeck", () => {
    describe("正常系", () => {
      it("S1: 標準的な公開URL", () => {
        const result = detectProvider("https://speakerdeck.com/user/slide");
        expect(result.provider).toBe("speakerdeck");
        expect(result.canonicalUrl).toBe("https://speakerdeck.com/user/slide");
      });

      it("S2: http スキーム → https に正規化", () => {
        const result = detectProvider("http://speakerdeck.com/user/slide");
        expect(result.provider).toBe("speakerdeck");
        expect(result.canonicalUrl).toBe("https://speakerdeck.com/user/slide");
      });

      it("S3: www. プレフィックス → 除去", () => {
        const result = detectProvider("https://www.speakerdeck.com/user/slide");
        expect(result.provider).toBe("speakerdeck");
        expect(result.canonicalUrl).toBe("https://speakerdeck.com/user/slide");
      });

      it("S4: 末尾スラッシュ → 除去", () => {
        const result = detectProvider("https://speakerdeck.com/user/slide/");
        expect(result.provider).toBe("speakerdeck");
        expect(result.canonicalUrl).toBe("https://speakerdeck.com/user/slide");
      });

      it("S5: ハイフン・数字を含む username/slug", () => {
        const result = detectProvider(
          "https://speakerdeck.com/user-name/my-slide-2024",
        );
        expect(result.provider).toBe("speakerdeck");
        expect(result.canonicalUrl).toBe(
          "https://speakerdeck.com/user-name/my-slide-2024",
        );
      });

      it("クエリパラメータ除去", () => {
        const result = detectProvider(
          "https://speakerdeck.com/jnunemaker/atom?slide=3",
        );
        expect(result.provider).toBe("speakerdeck");
        expect(result.canonicalUrl).toBe(
          "https://speakerdeck.com/jnunemaker/atom",
        );
      });
    });

    describe("異常系", () => {
      it("S6: ユーザープロフィールページ（slug なし）→ INVALID_FORMAT", () => {
        expect(() => detectProvider("https://speakerdeck.com/user")).toThrow(
          ProviderError,
        );
        try {
          detectProvider("https://speakerdeck.com/user");
        } catch (e) {
          expect((e as ProviderError).code).toBe("INVALID_FORMAT");
        }
      });

      it("S7: player URL（embed URL）→ UNSUPPORTED_URL_TYPE", () => {
        expect(() =>
          detectProvider("https://speakerdeck.com/player/abc123def456"),
        ).toThrow(ProviderError);
        try {
          detectProvider("https://speakerdeck.com/player/abc123def456");
        } catch (e) {
          expect((e as ProviderError).code).toBe("UNSUPPORTED_URL_TYPE");
        }
      });

      it("S8: カテゴリページ → INVALID_FORMAT", () => {
        expect(() =>
          detectProvider("https://speakerdeck.com/c/technology"),
        ).toThrow(ProviderError);
        try {
          detectProvider("https://speakerdeck.com/c/technology");
        } catch (e) {
          expect((e as ProviderError).code).toBe("INVALID_FORMAT");
        }
      });

      it("S9: 機能ページ → INVALID_FORMAT", () => {
        expect(() =>
          detectProvider("https://speakerdeck.com/features/pro"),
        ).toThrow(ProviderError);
        try {
          detectProvider("https://speakerdeck.com/features/pro");
        } catch (e) {
          expect((e as ProviderError).code).toBe("INVALID_FORMAT");
        }
      });
    });
  });

  // ============================================================
  // 6.2 Docswell
  // ============================================================
  describe("Docswell", () => {
    describe("正常系", () => {
      it("D1: title_slug 付きの標準URL → slug 除去", () => {
        const result = detectProvider(
          "https://www.docswell.com/s/takai/59VDWM-Recap-Windows-Server-2025",
        );
        expect(result.provider).toBe("docswell");
        expect(result.canonicalUrl).toBe(
          "https://www.docswell.com/s/takai/59VDWM",
        );
      });

      it("D2: www. なし → www. を付与", () => {
        const result = detectProvider(
          "https://docswell.com/s/takai/59VDWM-Recap-Windows-Server-2025",
        );
        expect(result.provider).toBe("docswell");
        expect(result.canonicalUrl).toBe(
          "https://www.docswell.com/s/takai/59VDWM",
        );
      });

      it("D3: title_slug なしの短縮URL", () => {
        const result = detectProvider(
          "https://www.docswell.com/s/takai/59VDWM",
        );
        expect(result.provider).toBe("docswell");
        expect(result.canonicalUrl).toBe(
          "https://www.docswell.com/s/takai/59VDWM",
        );
      });

      it("D4: http + www. なし + 末尾スラッシュ → 正規化", () => {
        const result = detectProvider(
          "http://docswell.com/s/takai/59VDWM/",
        );
        expect(result.provider).toBe("docswell");
        expect(result.canonicalUrl).toBe(
          "https://www.docswell.com/s/takai/59VDWM",
        );
      });

      it("D5: アンダースコア含む username + 日付 slug", () => {
        const result = detectProvider(
          "https://www.docswell.com/s/kdk_wakaba/ZXE6GM-2024-12-06-154613",
        );
        expect(result.provider).toBe("docswell");
        expect(result.canonicalUrl).toBe(
          "https://www.docswell.com/s/kdk_wakaba/ZXE6GM",
        );
      });
    });

    describe("異常系", () => {
      it("D6: embed URL → UNSUPPORTED_URL_TYPE", () => {
        expect(() =>
          detectProvider("https://www.docswell.com/slide/59VDWM/embed"),
        ).toThrow(ProviderError);
        try {
          detectProvider("https://www.docswell.com/slide/59VDWM/embed");
        } catch (e) {
          expect((e as ProviderError).code).toBe("UNSUPPORTED_URL_TYPE");
        }
      });

      it("D7: ユーザープロフィールページ → INVALID_FORMAT", () => {
        expect(() =>
          detectProvider("https://www.docswell.com/user/takai"),
        ).toThrow(ProviderError);
        try {
          detectProvider("https://www.docswell.com/user/takai");
        } catch (e) {
          expect((e as ProviderError).code).toBe("INVALID_FORMAT");
        }
      });

      it("D8: slideId が6文字未満 → INVALID_FORMAT", () => {
        expect(() =>
          detectProvider("https://www.docswell.com/s/takai/abc"),
        ).toThrow(ProviderError);
        try {
          detectProvider("https://www.docswell.com/s/takai/abc");
        } catch (e) {
          expect((e as ProviderError).code).toBe("INVALID_FORMAT");
        }
      });

      it("D9: slideId が小文字（大文字+数字のみ許可）→ INVALID_FORMAT", () => {
        expect(() =>
          detectProvider("https://www.docswell.com/s/takai/abcdef-test"),
        ).toThrow(ProviderError);
        try {
          detectProvider("https://www.docswell.com/s/takai/abcdef-test");
        } catch (e) {
          expect((e as ProviderError).code).toBe("INVALID_FORMAT");
        }
      });
    });
  });

  // ============================================================
  // 6.3 Google Slides
  // ============================================================
  describe("Google Slides", () => {
    const presentationId =
      "1EAYk18WDjIG-zp_0vLm3CsfQh_i8eXc67Jo2O9C6Vuc";
    const expectedCanonical = `https://docs.google.com/presentation/d/${presentationId}`;

    describe("正常系", () => {
      it("G1: /edit suffix", () => {
        const result = detectProvider(
          `https://docs.google.com/presentation/d/${presentationId}/edit`,
        );
        expect(result.provider).toBe("google_slides");
        expect(result.canonicalUrl).toBe(expectedCanonical);
      });

      it("G2: /edit?usp=sharing クエリパラメータ除去", () => {
        const result = detectProvider(
          `https://docs.google.com/presentation/d/${presentationId}/edit?usp=sharing`,
        );
        expect(result.provider).toBe("google_slides");
        expect(result.canonicalUrl).toBe(expectedCanonical);
      });

      it("G3: /edit#slide=id.p3 フラグメント除去", () => {
        const result = detectProvider(
          `https://docs.google.com/presentation/d/${presentationId}/edit#slide=id.p3`,
        );
        expect(result.provider).toBe("google_slides");
        expect(result.canonicalUrl).toBe(expectedCanonical);
      });

      it("G4: /preview suffix", () => {
        const result = detectProvider(
          `https://docs.google.com/presentation/d/${presentationId}/preview`,
        );
        expect(result.provider).toBe("google_slides");
        expect(result.canonicalUrl).toBe(expectedCanonical);
      });

      it("G5: /embed?start=true クエリパラメータ除去", () => {
        const result = detectProvider(
          `https://docs.google.com/presentation/d/${presentationId}/embed?start=true`,
        );
        expect(result.provider).toBe("google_slides");
        expect(result.canonicalUrl).toBe(expectedCanonical);
      });

      it("G6: suffix なし（ID のみ）", () => {
        const result = detectProvider(
          `https://docs.google.com/presentation/d/${presentationId}`,
        );
        expect(result.provider).toBe("google_slides");
        expect(result.canonicalUrl).toBe(expectedCanonical);
      });
    });

    describe("異常系", () => {
      it("G7: Published URL（/d/e/2PACX-...）→ UNSUPPORTED_URL_TYPE", () => {
        expect(() =>
          detectProvider(
            "https://docs.google.com/presentation/d/e/2PACX-abc123/pub",
          ),
        ).toThrow(ProviderError);
        try {
          detectProvider(
            "https://docs.google.com/presentation/d/e/2PACX-abc123/pub",
          );
        } catch (e) {
          expect((e as ProviderError).code).toBe("UNSUPPORTED_URL_TYPE");
        }
      });

      it("G8: Google Spreadsheets → UNSUPPORTED_PROVIDER", () => {
        expect(() =>
          detectProvider(
            "https://docs.google.com/spreadsheets/d/1abc123456789012345678901/edit",
          ),
        ).toThrow(ProviderError);
        try {
          detectProvider(
            "https://docs.google.com/spreadsheets/d/1abc123456789012345678901/edit",
          );
        } catch (e) {
          expect((e as ProviderError).code).toBe("UNSUPPORTED_PROVIDER");
        }
      });

      it("G9: Google Docs → UNSUPPORTED_PROVIDER", () => {
        expect(() =>
          detectProvider(
            "https://docs.google.com/document/d/1abc123456789012345678901/edit",
          ),
        ).toThrow(ProviderError);
        try {
          detectProvider(
            "https://docs.google.com/document/d/1abc123456789012345678901/edit",
          );
        } catch (e) {
          expect((e as ProviderError).code).toBe("UNSUPPORTED_PROVIDER");
        }
      });

      it("G10: presentationId が短すぎる → INVALID_FORMAT", () => {
        expect(() =>
          detectProvider(
            "https://docs.google.com/presentation/d/short",
          ),
        ).toThrow(ProviderError);
        try {
          detectProvider(
            "https://docs.google.com/presentation/d/short",
          );
        } catch (e) {
          expect((e as ProviderError).code).toBe("INVALID_FORMAT");
        }
      });
    });
  });

  // ============================================================
  // 6.4 共通異常系
  // ============================================================
  describe("共通異常系", () => {
    it("C1: URL でない文字列 → INVALID_URL", () => {
      expect(() => detectProvider("not-a-url")).toThrow(ProviderError);
      try {
        detectProvider("not-a-url");
      } catch (e) {
        expect((e as ProviderError).code).toBe("INVALID_URL");
      }
    });

    it("C2: ftp スキーム → UNSUPPORTED_SCHEME", () => {
      expect(() =>
        detectProvider("ftp://speakerdeck.com/user/slide"),
      ).toThrow(ProviderError);
      try {
        detectProvider("ftp://speakerdeck.com/user/slide");
      } catch (e) {
        expect((e as ProviderError).code).toBe("UNSUPPORTED_SCHEME");
      }
    });

    it("C3: 未対応ドメイン → UNSUPPORTED_PROVIDER", () => {
      expect(() =>
        detectProvider("https://example.com/slides"),
      ).toThrow(ProviderError);
      try {
        detectProvider("https://example.com/slides");
      } catch (e) {
        expect((e as ProviderError).code).toBe("UNSUPPORTED_PROVIDER");
      }
    });

    it("C4: SlideShare（未対応）→ UNSUPPORTED_PROVIDER", () => {
      expect(() =>
        detectProvider("https://slideshare.net/user/slide"),
      ).toThrow(ProviderError);
      try {
        detectProvider("https://slideshare.net/user/slide");
      } catch (e) {
        expect((e as ProviderError).code).toBe("UNSUPPORTED_PROVIDER");
      }
    });

    it("C5: 空文字列 → INVALID_URL", () => {
      expect(() => detectProvider("")).toThrow(ProviderError);
      try {
        detectProvider("");
      } catch (e) {
        expect((e as ProviderError).code).toBe("INVALID_URL");
      }
    });

    it("C6: 空白のみ → INVALID_URL", () => {
      expect(() => detectProvider("   ")).toThrow(ProviderError);
      try {
        detectProvider("   ");
      } catch (e) {
        expect((e as ProviderError).code).toBe("INVALID_URL");
      }
    });
  });
});
