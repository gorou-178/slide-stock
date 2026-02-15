import { test as base } from "@playwright/test";

/**
 * カスタムフィクスチャの拡張ポイント。
 * 認証済みユーザーやテストデータのセットアップなど、
 * 共通の前処理をここに追加していく。
 */
export const test = base.extend({});
export { expect } from "@playwright/test";
