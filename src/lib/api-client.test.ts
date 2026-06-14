import { describe, it, expect } from "vitest";
import { ApiError, formatCreateStockError } from "./api-client";

/**
 * ui-spec.md §7.4 のエラー表示マッピングが SSOT であることを担保するテスト。
 * spec の表が更新されたら本テストも追従する。
 */
describe("formatCreateStockError (ui-spec.md §7.4)", () => {
  it("URL バリデーションエラーは API の error メッセージをそのまま表示", () => {
    const apiMessage = "URL 形式が不正です";
    for (const code of [
      "INVALID_REQUEST",
      "INVALID_URL",
      "UNSUPPORTED_PROVIDER",
      "INVALID_FORMAT",
      "UNSUPPORTED_URL_TYPE",
    ]) {
      expect(
        formatCreateStockError(new ApiError(400, code, apiMessage)),
      ).toBe(apiMessage);
    }
  });

  it("UPSTREAM_NOT_FOUND / UPSTREAM_FORBIDDEN は『スライドが見つかりません』表示", () => {
    const expected =
      "スライドが見つかりません。URL が正しいか、スライドが公開されているか確認してください。";
    expect(
      formatCreateStockError(
        new ApiError(400, "UPSTREAM_NOT_FOUND", "サーバー側メッセージ"),
      ),
    ).toBe(expected);
    expect(
      formatCreateStockError(
        new ApiError(400, "UPSTREAM_FORBIDDEN", "サーバー側メッセージ"),
      ),
    ).toBe(expected);
  });

  it("DUPLICATE_STOCK は『このスライドは既にストック済みです』", () => {
    expect(
      formatCreateStockError(
        new ApiError(409, "DUPLICATE_STOCK", "サーバー側メッセージ"),
      ),
    ).toBe("このスライドは既にストック済みです");
  });

  it("UPSTREAM_FAILURE / UPSTREAM_INVALID_RESPONSE / UPSTREAM_TIMEOUT は『プロバイダから応答がありません』表示", () => {
    const expected =
      "プロバイダから応答がありません。時間をおいて再度お試しください。";
    for (const code of [
      "UPSTREAM_FAILURE",
      "UPSTREAM_INVALID_RESPONSE",
      "UPSTREAM_TIMEOUT",
    ]) {
      expect(
        formatCreateStockError(new ApiError(502, code, "サーバー側メッセージ")),
      ).toBe(expected);
    }
  });

  it("CLIENT_TIMEOUT は『タイムアウトしました』", () => {
    expect(
      formatCreateStockError(new ApiError(0, "CLIENT_TIMEOUT", "")),
    ).toBe("タイムアウトしました。もう一度お試しください。");
  });

  it("NETWORK_ERROR は『サーバーに接続できません』", () => {
    expect(formatCreateStockError(new ApiError(0, "NETWORK_ERROR", ""))).toBe(
      "サーバーに接続できません。ネットワーク接続を確認してください。",
    );
  });

  it("INTERNAL_ERROR は『エラーが発生しました』", () => {
    expect(
      formatCreateStockError(
        new ApiError(500, "INTERNAL_ERROR", "サーバー側メッセージ"),
      ),
    ).toBe("エラーが発生しました。しばらくしてからやり直してください。");
  });

  it("未知の code は API の message を使う（フォールバック）", () => {
    expect(
      formatCreateStockError(
        new ApiError(418, "UNKNOWN_FUTURE_CODE", "未来のエラー"),
      ),
    ).toBe("未来のエラー");
  });

  it("未知の code で message も空なら汎用メッセージ", () => {
    expect(
      formatCreateStockError(new ApiError(418, "UNKNOWN_FUTURE_CODE", "")),
    ).toBe("エラーが発生しました");
  });
});
