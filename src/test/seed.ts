/**
 * テスト用シードデータ定義
 *
 * ユニットテスト・E2E テストで共通利用するテストデータ。
 * docs/database.md のスキーマに準拠。
 */

// ---------- Users ----------

export interface TestUser {
  id: string;
  google_sub: string;
  email: string;
  name: string;
  created_at: string;
}

export const TEST_USERS: readonly TestUser[] = [
  {
    id: "test-user-1",
    google_sub: "google-sub-test-001",
    email: "user1@example.com",
    name: "Test User 1",
    created_at: "2025-01-01T00:00:00.000Z",
  },
  {
    id: "test-user-2",
    google_sub: "google-sub-test-002",
    email: "user2@example.com",
    name: "Test User 2",
    created_at: "2025-01-02T00:00:00.000Z",
  },
  {
    id: "test-user-3",
    google_sub: "google-sub-test-003",
    email: "user3@example.com",
    name: "Test User 3",
    created_at: "2025-01-03T00:00:00.000Z",
  },
] as const;

/** デフォルトテストユーザー（テストで最もよく使うユーザー） */
export const DEFAULT_TEST_USER = TEST_USERS[0];

// ---------- Stocks ----------

export interface TestStock {
  id: string;
  user_id: string;
  original_url: string;
  canonical_url: string;
  provider: "speakerdeck" | "docswell" | "google_slides";
  title: string | null;
  author_name: string | null;
  thumbnail_url: string | null;
  embed_url: string | null;
  status: "pending" | "ready" | "failed";
  created_at: string;
  updated_at: string;
}

export const TEST_STOCKS: readonly TestStock[] = [
  {
    id: "stock-speakerdeck-001",
    user_id: "test-user-1",
    original_url: "https://speakerdeck.com/testuser/example-slide",
    canonical_url: "https://speakerdeck.com/testuser/example-slide",
    provider: "speakerdeck",
    title: "Example SpeakerDeck Slide",
    author_name: "testuser",
    thumbnail_url: "https://speakerdeck.com/rails/active_storage/representations/example.jpg",
    embed_url: "https://speakerdeck.com/player/abc123",
    status: "ready",
    created_at: "2025-01-10T00:00:00.000Z",
    updated_at: "2025-01-10T00:01:00.000Z",
  },
  {
    id: "stock-docswell-001",
    user_id: "test-user-1",
    original_url: "https://www.docswell.com/s/testuser/example-slide",
    canonical_url: "https://www.docswell.com/s/testuser/example-slide",
    provider: "docswell",
    title: "Example Docswell Slide",
    author_name: "testuser",
    thumbnail_url: "https://www.docswell.com/slides/example/thumbnail.jpg",
    embed_url: "https://www.docswell.com/slide/example/embedded",
    status: "ready",
    created_at: "2025-01-11T00:00:00.000Z",
    updated_at: "2025-01-11T00:01:00.000Z",
  },
  {
    id: "stock-google-slides-001",
    user_id: "test-user-1",
    original_url: "https://docs.google.com/presentation/d/1abc123/edit",
    canonical_url: "https://docs.google.com/presentation/d/1abc123",
    provider: "google_slides",
    title: "Example Google Slides",
    author_name: null,
    thumbnail_url: null,
    embed_url: "https://docs.google.com/presentation/d/1abc123/embed",
    status: "ready",
    created_at: "2025-01-12T00:00:00.000Z",
    updated_at: "2025-01-12T00:01:00.000Z",
  },
] as const;

// ---------- Memos ----------

export interface TestMemo {
  id: string;
  stock_id: string;
  user_id: string;
  memo_text: string;
  created_at: string;
  updated_at: string;
}

export const TEST_MEMOS: readonly TestMemo[] = [
  {
    id: "memo-001",
    stock_id: "stock-speakerdeck-001",
    user_id: "test-user-1",
    memo_text: "SpeakerDeck のスライドに関するメモです。",
    created_at: "2025-01-10T01:00:00.000Z",
    updated_at: "2025-01-10T01:00:00.000Z",
  },
  {
    id: "memo-002",
    stock_id: "stock-docswell-001",
    user_id: "test-user-1",
    memo_text: "Docswell のスライドに関するメモです。",
    created_at: "2025-01-11T01:00:00.000Z",
    updated_at: "2025-01-11T01:00:00.000Z",
  },
] as const;
