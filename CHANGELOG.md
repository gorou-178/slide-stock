# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to a 4-digit version format: `MAJOR.MINOR.PATCH.MICRO`.

## [0.0.2.0] - 2026-05-02

### Added
- Self-hosted Geist (Variable, ~68 KB) and Geist Mono (Variable, ~70 KB) fonts under `public/fonts/` with `font-display: swap`, covering Latin / digits / symbols / code at any weight from 100 to 900.
- Self-hosted IBM Plex Sans JP (Regular + Bold, ~37 KB each) subset to ASCII + kana + CJK punctuation via `unicode-range`, with kanji falling back to OS Japanese fonts (Hiragino → Yu Gothic → Noto Sans JP) — total typography payload ~210 KB, within the 300 KB budget set in `ui-spec.md` §8.2.1.
- `<link rel="preload">` hints for Geist Variable and IBM Plex Sans JP Regular in `BaseLayout.astro` so above-the-fold typography ships in the critical path with no FOUT on first paint.
- `--font-family-display`, `--font-family-body`, and `--font-family-mono` CSS custom properties in `global.css` so future components can opt into display vs body vs mono stacks without re-listing the fallback chain.

### Changed
- `--font-family` in `global.css` now leads with `Geist`, `IBM Plex Sans JP`, and the OS Japanese fallback chain, replacing the previous `-apple-system` system stack to match the typography spec finalized in `ui-spec.md` §8.2.
- `tasks/design-review-2026-04-30.md` marks task T-B (font self-hosting) as ✅ 完了 with an implementation note explaining why IBM Plex Sans JP ships as Regular + Bold subsets instead of a Variable build (no Variable build exists; full-CJK subsets exceed budget by 10x).
- `docs/ui-spec.md` §8.2.1 documents the actual delivered subset strategy and per-file sizes so the spec matches what is shipped.



### Added
- Design review notes (`tasks/design-review-2026-04-30.md`) capturing the 12 follow-up tasks (T-A through T-L) from the `/plan-design-review` session, including blocker tasks (sync-model spec rewrite, Geist + IBM Plex Sans JP font self-hosting, hero/screenshot creation, `/privacy` and `/terms` pages) and nice-to-have polish (inline confirm, return_to handling, empty-state copy, mobile card wrapping, toast notifications, memo save feedback).
- `gstack` section in `AGENTS.md` listing the skills available to the project (`/plan-ceo-review`, `/plan-eng-review`, `/review`, `/ship`, `/qa`, `/careful`, `/freeze`) and routing all browser automation through `/browse`.
- Skill routing rules in `CLAUDE.md` so future Claude Code sessions auto-invoke the right skill for each request type (bugs → `/investigate`, ship → `/ship`, etc.).
- Language preference section in `CLAUDE.md` clarifying that user-facing output is Japanese while code, commit messages, CHANGELOG, and PR text stay in English.
- Initial `VERSION` and `CHANGELOG.md` files (4-digit format) to align the project with the gstack ship workflow.

### Changed
- `docs/ui-spec.md` substantially expanded (+225 lines): refreshed typography spec to Geist + IBM Plex Sans JP, refreshed color palette to Teal + Orange + provider brand colors, locked the sync oEmbed model into §5.3.1/§5.3.3/§5.4.1/§6.3/§7.3/§7.4, added paste-time client-side provider detection, documented unsaved-changes protection for the memo editor, and made `/` route a static landing page with no auth check.
- `docs/landing-spec.md` substantially expanded (+311 lines): two-column hero with real `/stocks` screenshot per §3.1, single-column zigzag story for the usage steps per §3.3, footer with `/privacy` `/terms` GitHub + version per §7.
- `docs/oembed-spec.md` and `docs/stock-api-spec.md` carry a top banner declaring the sync model is canonical (no Cloudflare Queues for MVP, no `pending`/`failed` status, exponential-backoff retry within the request, 502/504 with DB rollback on failure). The bodies of these two specs still describe the legacy queue model and are flagged as `TODO` for full rewrite (tracked as task T-A in `tasks/design-review-2026-04-30.md`).

### Removed
- `.context/`, `.gstack/` added to `.gitignore` to keep local retro snapshots and gstack state files out of the repo.
