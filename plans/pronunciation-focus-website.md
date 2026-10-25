# Blueprint: Pronunciation Focus — a filtered YouTube study site

**Objective:** Build a website that indexes a curated list of YouTube channels, filters their videos down to pronunciation lessons tagged by sound, and lets a learner practise with a distraction-free player, shadow-and-record, and progress tracking.

**Created:** 2026-10-24 · **Status:** Ready · **Steps:** 8 · **Mode:** git + branch/PR (no `gh` CLI, see Workflow)

---

## Decisions already made (do not re-open)

| Topic | Decision |
|---|---|
| Content source | A **curated list of channels** chosen by the owner, stored in `data/channels.json`. Learners cannot add channels in v1. |
| v1 features | (1) filter & tag videos by sound, (2) shadow & record practice, (3) progress tracking. |
| Out of v1 | Learner-pasted channels, accounts/login, a backend, automatic pronunciation scoring, captions/transcripts. |
| Hosting | New standalone repo `trungnv184/pronunciation-focus`, served on GitHub Pages at `https://trungnv184.github.io/pronunciation-focus/`. |
| Local path | `~/Documents/CodeSpace/R&D/pronunciation-focus/` (quote the path in shells: it contains `&`). |
| Stack | Vite 6 + React 19 + TypeScript 5.9 + `react-router-dom` 7 **HashRouter**, `base: "./"`. The exact config is inlined in Step 1, so there is nothing to copy from elsewhere. |
| Dependencies | **Every v1 dependency is installed in Step 1** (list in Step 1). Later steps do not edit `package.json` or `package-lock.json`. |
| Styling | Plain CSS. Step 1 owns the global `src/styles/tokens.css` (colours, spacing, fonts, light/dark) and `src/styles/base.css`. Each feature uses CSS Modules (`*.module.css`) inside its own folder. |
| Audience | Vietnamese learners of English. UI copy is bilingual: Vietnamese first, English second. |

## Architecture in one picture

```
data/channels.json ──┐
data/overrides.json ─┤   GitHub Actions (weekly cron + manual)
src/data/taxonomy.ts ┘──► scripts/ingest.ts ──YouTube Data API v3 (key in secret)──►
                                         public/data/videos.json  (committed)
                                                    │
                        static site (GitHub Pages)  ▼
   BrowsePage (filter by sound) ──► PlayerPage (IFrame API, A–B loop, speed)
                                         ├── PracticePanel (MediaRecorder, IndexedDB)
                                         └── VideoActions  (progress, localStorage)
```

- **No server.** The YouTube API key exists **only** in the GitHub Actions secret `YT_API_KEY`. It must never be in the repo, in `.env` files that get committed, or in the client bundle.
- **Data is static JSON** that CI regenerates weekly. The weekly refresh also meets the YouTube API Services policy of refreshing stored API data at least every 30 days.
- **Tagging is rule-based**: keyword/regex matching on title + description, plus manual overrides. No ML in v1.

## Prerequisites (owner provides before or during Step 2/3)

1. **Channel list:** 3–8 pronunciation channels as `@handle` values (for example `@rachelsenglish`, `@EnglishwithLucy`, `@pronunciationwithemma`, a Vietnamese-language channel). Step 2 uses placeholders if none are given yet.
2. **YouTube Data API v3 key** (needed by Step 3 for live data): Google Cloud Console → enable "YouTube Data API v3" → create an API key → restrict it to that API. Add it as repo secret `YT_API_KEY` in GitHub → Settings → Secrets → Actions.
3. SSH push access to `github.com` as `trungnv184` (already works for `system-design`).

## Workflow rules (every step)

- **Branch per step:** `step-N-<slug>` from the latest `main`. One PR per step.
- **No `gh` CLI on this machine.** Push over SSH (`git push -u origin step-N-<slug>`) and open the PR either through the GitHub MCP tool `create_pull_request` or from the link `git push` prints. Merge with squash.
- **CI must be green** (`.github/workflows/ci.yml`, created in Step 1) before merging.
- **Shared files are frozen for parallel steps.** In waves 3 and 4, do not edit `package.json`, `package-lock.json`, `src/App.tsx`, `src/main.tsx`, `src/styles/*`, `tsconfig*.json`, `vite.config.ts` or `.github/workflows/*` (Step 3 adds only `refresh-data.yml`). If a dependency is truly missing, stop and land it first as a tiny separate PR to `main`, then rebase.
- **Invariants checked after every step:**
  - `npm run typecheck && npm test && npm run build` all pass.
  - `npm run validate` passes (from Step 2 onward).
  - No API key committed or bundled: `git grep -nE "AIza[0-9A-Za-z_-]{35}"` and `grep -rE "AIza[0-9A-Za-z_-]{35}" dist/` both find nothing.
  - The site works under a sub-path: `rm -rf /tmp/pf && mkdir -p /tmp/pf && cp -r dist /tmp/pf/pronunciation-focus && npx serve /tmp/pf -l 4173`, then load `http://localhost:4173/pronunciation-focus/` and a deep link `.../#/watch/<id>`.
- **Rollback:** every step is a single squashed PR. Revert it with `git revert <sha>` on `main`, and the deploy workflow republishes.
- **Owner-facing actions** (creating the GitHub repo, adding secrets, enabling Pages) need the owner's go-ahead. Ask before doing them.

## Dependency graph

```
1 Scaffold + CI + Pages
└─ 2 Data contract, taxonomy, seed data
   ├─ 3 Ingestion script + scheduled refresh ──────────────────────┐
   ├─ 4 Browse & filter UI ───────────────┐                        │
   └─ 5 Focus player page ──┬─────────────┤                        │
                            ├─ 6 Shadow & record (needs 5) ────────┤
                            └─ 7 Progress tracking (needs 4 + 5) ──┤
                                                                   └─ 8 Polish & launch (needs 3–7)
```

| Wave | Steps | Can run in parallel? | Why it's safe |
|---|---|---|---|
| 1 | 1 | — | Foundation |
| 2 | 2 | — | Defines the data contract everyone imports |
| 3 | 3, 4, 5 | **Yes** | Separate files: `scripts/` vs `src/features/browse/` vs `src/features/player/`. Routes, page stubs, all dependencies and global styles already exist from Step 1. |
| 4 | 6, 7 | **Yes** | Step 5 leaves two stub components, `PracticePanel` (owned by 6) and `VideoActions` (owned by 7). Step 7 also edits browse files, and no other wave-4 step touches those. |
| 5 | 8 | — | Integration and launch |

## Model tier per step

| Step | Tier | Reason |
|---|---|---|
| 1 | default | Mechanical scaffold copied from a known-good setup |
| 2 | **strongest** | Data contract + Vietnamese-learner taxonomy shape everything downstream |
| 3 | **strongest** | External API, quota, pagination, policy, secrets |
| 4 | default | Standard filter UI |
| 5 | default | IFrame API wrapper |
| 6 | **strongest** | MediaRecorder/IndexedDB cross-browser quirks (Safari/iOS) |
| 7 | default | Local storage + derived stats |
| 8 | default | Polish, copy, launch checks |

---

## Step 1 — Scaffold repo, CI, and Pages deploy (walking skeleton)

**Branch:** `step-1-scaffold` (for the very first push, commit straight to `main`, then use branches from Step 2 on) · **Depends on:** none · **Tier:** default

### Context brief
You are creating a new project at `~/Documents/CodeSpace/R&D/pronunciation-focus/`. The folder already exists and holds only `plans/`. It is a static Vite + React + TypeScript site published to GitHub Pages from repo `trungnv184/pronunciation-focus`, at the sub-path `/pronunciation-focus/`. Write every file by hand from the contents below. **Do not run `npm create vite`**: the folder isn't empty, so it prompts interactively and will hang. Node 22 and npm 10 are installed. There is no `gh` CLI. Pushing works over SSH as `trungnv184`. This step also installs **every dependency v1 needs** and sets up the global styles, so later parallel steps never touch `package.json`, the lockfile or global CSS.

### Tasks
1. Install dependencies (these pins are known to work together):
   ```bash
   npm init -y
   npm i react@^19 react-dom@^19 react-router-dom@^7 zod@^3 idb-keyval@^6
   npm i -D vite@^6 @vitejs/plugin-react@^4 typescript@~5.9 @types/react@^19 @types/react-dom@^19 \
     @types/node@^22 @types/youtube vitest@^3 jsdom @testing-library/react @testing-library/jest-dom \
     @testing-library/user-event fake-indexeddb tsx serve
   ```
   Set `"type": "module"` and `"private": true` in `package.json`. `zod` is a runtime dependency because the client parses the index with it. Stay on zod 3; the v4 API is different.
2. `package.json` scripts: `"dev": "vite"`, `"build": "tsc -b && vite build"`, `"preview": "vite preview"`, `"typecheck": "tsc -b"`, `"test": "vitest run"`, `"validate": "node -e \"process.exit(0)\""` (Step 2 replaces this).
3. TypeScript project layout (`noEmit` everywhere, so `tsc -b` only type-checks):
   - `tsconfig.json`: `{ "files": [], "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }] }`
   - `tsconfig.app.json`:
     - `compilerOptions`: `composite: true`, `noEmit: true`, `target: "ES2022"`, `lib: ["ES2022","DOM","DOM.Iterable"]`, `module: "ESNext"`, `moduleResolution: "bundler"`, `jsx: "react-jsx"`, `strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true`, `skipLibCheck: true`, `isolatedModules: true`, `types: ["vite/client", "youtube", "@testing-library/jest-dom"]`
     - `include: ["src"]`
   - `tsconfig.node.json`:
     - `compilerOptions`: the same strict options, plus `composite: true`, `noEmit: true`, `lib: ["ES2022"]`, `types: ["node"]`
     - `include: ["vite.config.ts", "scripts"]`
     - This type-checks `scripts/` (Steps 2 and 3), which may import from `src/data/*`.
4. `vite.config.ts`:
   ```ts
   import { defineConfig } from "vitest/config";
   import react from "@vitejs/plugin-react";

   export default defineConfig({
     base: "./",
     plugins: [react()],
     test: { environment: "jsdom", setupFiles: ["./src/test/setup.ts"], globals: false },
   });
   ```
   Create `src/test/setup.ts` with `import "@testing-library/jest-dom/vitest";`.
5. `index.html` with `<html lang="vi">`, `<div id="root">` and `<script type="module" src="/src/main.tsx">`. `src/main.tsx`:
   ```tsx
   import { StrictMode } from "react";
   import { createRoot } from "react-dom/client";
   import { HashRouter } from "react-router-dom";
   import App from "./App";
   import "./styles/tokens.css";
   import "./styles/base.css";

   createRoot(document.getElementById("root")!).render(
     <StrictMode><HashRouter><App /></HashRouter></StrictMode>,
   );
   ```
6. `src/styles/tokens.css`: colour, spacing, radius and font tokens on `:root`, with a dark set under `@media (prefers-color-scheme: dark)`. `src/styles/base.css`: reset, body, focus ring, `.visually-hidden`. Global CSS lives only in these two files.
7. `src/App.tsx`: a layout with a header ("Luyện phát âm · Pronunciation Focus") and nav links (Videos, Tiến độ / Progress). Routes:
   - `/` → `src/features/browse/BrowsePage.tsx`
   - `/watch/:videoId` → `src/features/player/PlayerPage.tsx`
   - `/progress` → `src/features/progress/ProgressPage.tsx`
   - `/about` → `src/features/about/AboutPage.tsx`
   - `*` → `src/components/NotFound.tsx`

   Each page is a stub with a heading. **No later step edits `App.tsx`.**
8. `.github/workflows/ci.yml`:
   ```yaml
   name: CI
   on:
     pull_request:
     push:
       branches: [main]
   jobs:
     check:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with: { node-version: 22, cache: npm }
         - run: npm ci
         - run: npm run typecheck
         - run: npm test
         - run: npm run validate
         - run: npm run build
   ```
9. `.github/workflows/deploy.yml`:
   ```yaml
   name: Deploy to GitHub Pages
   on:
     push:
       branches: [main]
     workflow_dispatch:
     workflow_call:
   permissions:
     contents: write
   concurrency:
     group: pages
     cancel-in-progress: true
   jobs:
     deploy:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
           with: { ref: main }   # always build the latest main, even when called after a bot commit
         - uses: actions/setup-node@v4
           with: { node-version: 22, cache: npm }
         - run: npm ci
         - run: npm run validate
         - run: npm run build
         # Pages serves the gh-pages branch; .nojekyll stops Jekyll from dropping underscore-prefixed assets.
         - run: touch dist/.nojekyll
         - uses: peaceiris/actions-gh-pages@v4
           with:
             github_token: ${{ secrets.GITHUB_TOKEN }}
             publish_dir: ./dist
   ```
10. `.gitignore`: `node_modules`, `dist`, `.env*`, `*.local`, `lh.json`.
11. `README.md`: what the project is, how to run it, a link to `plans/`.
12. Smoke test `src/App.test.tsx`: render `<MemoryRouter><App /></MemoryRouter>` and expect the site name.
13. **Owner go-ahead needed:** create the public repo `trungnv184/pronunciation-focus` (GitHub MCP `create_repository`, or on github.com). Then `git init -b main`, commit, `git remote add origin git@github.com:trungnv184/pronunciation-focus.git`, `git push -u origin main`.
14. **Owner go-ahead needed:** once the first deploy run has created the `gh-pages` branch, set the source to that branch in repo Settings → Pages.

### Verification
```bash
cd "$HOME/Documents/CodeSpace/R&D/pronunciation-focus"
npm run typecheck && npm test && npm run build
rm -rf /tmp/pf && mkdir -p /tmp/pf && cp -r dist /tmp/pf/pronunciation-focus && npx serve /tmp/pf -l 4173
# open http://localhost:4173/pronunciation-focus/ and click every nav link, then load .../#/watch/test
```
After the push, wait for the Deploy workflow and then load `https://trungnv184.github.io/pronunciation-focus/` and `.../#/watch/test`.

### Exit criteria
- [ ] The live Pages URL shows the header, and all stub routes work through hash links.
- [x] CI and Deploy are both green on `main`.
- [x] `package.json` already lists every dependency used in Steps 2–8.

---

## Step 2 — Data contract, pronunciation taxonomy, seed data

**Branch:** `step-2-data-contract` · **Depends on:** 1 · **Tier:** strongest

### Context brief
The site (Vite + React + TS, HashRouter, at `~/Documents/CodeSpace/R&D/pronunciation-focus/`) shows YouTube videos from a curated list of channels, filtered to pronunciation lessons and tagged by the sound they teach. This step defines the **data contract** that the ingestion script (Step 3), browse UI (Step 4), player (Step 5) and progress (Step 7) all import. Treat it as an API: name things carefully. Learners are **Vietnamese speakers learning English**, so the taxonomy must cover their typical problems: dropped final consonants, `-s`/`-ed` endings, /θ ð/, /ʃ/ vs /s/, /r/ vs /l/ vs /n/, /tʃ dʒ ʒ/, short vs long vowels, /æ/ vs /e/, schwa, consonant clusters, word stress, sentence stress, linking, and intonation (Vietnamese is tonal, so English intonation needs its own focus). The real video data (`public/data/videos.json`) will be generated by Step 3. This step commits a small **hand-made seed** so UI work can start now.

### Tasks
1. `src/data/schema.ts` (zod, with types exported via `z.infer`):
   - `Channel`: `{ handle: string /* "@x" */, id?: string, title: string, lang: "en" | "vi", allPronunciation: boolean, note?: string }`.
   - `Video`: `{ id, channelId?, channelTitle, title, description? /* truncated to 500 chars */, publishedAt? /* ISO */, durationSec, thumbnail /* url */, tags: TagId[], isShort: boolean }`.
     - `isShort` means `durationSec <= 180`, because Shorts can run up to 3 minutes. The API has no Shorts flag, so treat this as a duration heuristic.
     - `channelId`, `description` and `publishedAt` are optional because the hand-made seed can't get them without an API key.
     - Add a zod `superRefine` so they are **required when `source === "youtube-api"`**.
   - `VideoIndex`: `{ generatedAt: string, source: "youtube-api" | "seed", channels: Channel[], videos: Video[] }`.
   - Sort, filter and progress code must tolerate missing `publishedAt`: sort those videos last.
2. `src/data/taxonomy.ts`: `TAG_GROUPS` (`endings`, `consonants`, `vowels`, `stress`, `rhythm-intonation`, `foundations`) and `TAGS: Tag[]`, with `Tag = { id, group, labelVi, labelEn, ipa?, keywords: RegExp[] }`. Cover at least: `final-consonants`, `s-es-endings`, `ed-endings`, `th-sounds`, `s-sh`, `r-l`, `ch-j-zh`, `v-w` (rare for VN, keep it low-priority), `consonant-clusters`, `short-long-vowels`, `ae-e`, `schwa`, `diphthongs`, `word-stress`, `sentence-stress`, `linking-connected-speech`, `reductions`, `intonation`, `ipa-basics`, `minimal-pairs`. Keywords must handle both English and Vietnamese titles (for example `/âm cuối|ending sounds?|final consonants?/i`).
3. `src/data/text.ts`:
   - `normalize(s)`: NFC first, then a `fold` for search.
   - `fold(s)`: NFD, strip combining marks, map `đ`/`Đ` → `d`, lowercase. NFD alone does not decompose `đ`, so the explicit mapping is needed.
   - Steps 2 and 4 both use this module.
4. `src/data/tagger.ts`:
   - Signatures: `tagVideo(input: { title: string; description?: string }, channel: Channel): TagId[]` and `isPronunciationVideo(input: { title: string; description?: string; tags: TagId[] }, channel: Channel): boolean`.
   - A video counts as pronunciation if `channel.allPronunciation` is true, if any tag matches, or if it matches `/pronunciation|pronounce|accent|IPA|phonetic|phát âm/i`.
   - Match on `normalize(title)` first.
   - Description matches count only if the keyword appears **at least twice**, which filters out sponsor and footer noise. Count them with `[...text.matchAll(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"))].length`. Never reuse a `/g` regex with `.test()`, because `lastIndex` makes it stateful.
5. `data/channels.json`: the owner's list, or 3 clearly marked placeholders if it isn't given yet. `data/overrides.json`: `{ "include": [videoId], "exclude": [videoId], "addTags": { videoId: [TagId] }, "removeTags": { ... } }`, starting empty.
6. `public/data/videos.json` seed with `source: "seed"` and 10–15 **real** pronunciation videos covering at least 6 tags.
   - Check each ID exists using `curl -s "https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=<ID>&format=json"`. **HTTP 200 only proves the video exists.** An unlisted, age-restricted or region-blocked video can still return 200, while 401 usually means embedding is disabled.
   - Take `title`, `author_name` (→ `channelTitle`) and `thumbnail_url` from oEmbed.
   - Fill `durationSec` by hand from the YouTube page. Leave `channelId`, `description` and `publishedAt` out.
   - Confirm each video actually plays in the embed during Step 5's manual check, and swap out any that don't.
7. `src/test/fixtures/videoIndex.ts`: a fixed `VideoIndex` of about 12 videos for **all UI tests in Steps 4–7**. Tests must never read `public/data/videos.json`, because Step 3 replaces it weekly with live data.
8. `scripts/validate-data.ts` (run with `tsx`): parses `public/data/videos.json`, `data/channels.json` and `data/overrides.json` with the zod schemas. Fails on unknown tag IDs or duplicate video IDs. Set `"validate": "tsx scripts/validate-data.ts"`.
9. `src/data/loadIndex.ts`: `fetch("./data/videos.json")` (relative, so it works under the Pages sub-path), parse with zod, cache in a module variable. Export a `useVideoIndex()` hook returning `{ status: "loading" | "ready" | "error", index?, error? }`.
10. Tests:
    - `tagger.test.ts`: at least 20 title cases (English and Vietnamese). Include positives, negatives such as "My morning routine vlog" → not pronunciation, decomposed-Unicode input, and `đ`.
    - `text.test.ts`: `fold("Đồng âm") === "dong am"`.
    - `schema.test.ts`: the seed parses, and an API-sourced video without `channelId` fails.

### Verification
```bash
npm run validate && npm test && npm run typecheck && npm run build
for id in $(node -e 'require("./public/data/videos.json").videos.forEach(v=>console.log(v.id))'); do
  curl -s -o /dev/null -w "%{http_code} $id\n" "https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=$id&format=json"; done   # all 200
```

### Exit criteria
- [x] Schema, taxonomy, tagger, loader and seed are merged. `npm run validate` is part of CI.
- [x] Every seed video ID returns 200 from oEmbed.
- [x] All tagger tests pass.

---

## Step 3 — Ingestion script and scheduled refresh

**Branch:** `step-3-ingest` · **Depends on:** 2 · **Parallel with:** 4, 5 · **Tier:** strongest

### Context brief
The site reads a static `public/data/videos.json` that matches `VideoIndex` in `src/data/schema.ts`. Tags come from `tagVideo` / `isPronunciationVideo` in `src/data/tagger.ts`. Channels are listed in `data/channels.json` (`@handle` values) and manual fixes in `data/overrides.json`. This step writes the script that builds `videos.json` from the **YouTube Data API v3**, plus a GitHub Actions workflow that runs it weekly and commits the result. The API key is a **repo secret `YT_API_KEY`**. It is read from `process.env` in CI only and must never be written to any file, log line, URL or the client bundle. The default quota is 10,000 units per day, and every call used here costs 1 unit. `@types/node` and `tsx` are already installed, and `tsconfig.node.json` type-checks `scripts/`. Do not touch `src/features/**`, because Steps 4 and 5 are editing those in parallel. Do not touch `package.json` beyond adding the `ingest` script line; that one-line change is allowed.

### Tasks
1. `scripts/youtube.ts`: a small client.
   - Send the key in the **`X-Goog-Api-Key` header**, never as a `key=` query parameter, so request URLs can be logged safely.
   - Retry with exponential backoff on 5xx and 429.
   - On 403 with `reason: "quotaExceeded"`, throw a typed `QuotaError`.
   - Error messages may include the URL and status, never headers.
2. `scripts/ingest.ts` (run with `tsx`), with flags `--out <path>` (default `public/data/videos.json`), `--previous <path>` (default: same as `--out`), `--dry-run`, and `--fixture <dir>`. The fixture flag replaces the HTTP client with files on disk.
   1. For each channel, call `channels?part=snippet,contentDetails&forHandle=<handle without @>` → channel `id`, `title`, and the uploads playlist `contentDetails.relatedPlaylists.uploads`. **If any handle returns no `items`, fail the whole run**, naming the handle.
   2. Page through `playlistItems?part=contentDetails&playlistId=<uploads>&maxResults=50&pageToken=…`. Cap at `MAX_VIDEOS_PER_CHANNEL = 500` (configurable).
   3. Batch the IDs 50 at a time into `videos?part=snippet,contentDetails,status&id=…`. Keep a video only if **all** of these hold:
      - `status.embeddable === true`
      - `status.privacyStatus === "public"`
      - `snippet.liveBroadcastContent === "none"`
      - duration is not `P0D`
      - `contentDetails.contentRating?.ytRating !== "ytAgeRestricted"`
      - it plays in Vietnam: `regionRestriction.blocked` doesn't include `"VN"`, and if `regionRestriction.allowed` is set, it includes `"VN"`

      Parse the ISO-8601 duration into seconds with a tested `parseIsoDuration`. Prefer the `medium` thumbnail.
   4. Apply `isPronunciationVideo` and `tagVideo` from `src/data/tagger.ts`, then the overrides: `exclude` wins over everything, then `include`, `addTags`, `removeTags`.
   5. Sort newest first and truncate descriptions to 500 chars. Validate with the zod `VideoIndex` schema (`source: "youtube-api"`).
   6. **Partial-index guard.** Keep the old file and exit non-zero if any of these happen:
      - validation fails
      - any channel ends with 0 kept videos
      - the total kept count drops by more than 30% compared with `--previous`

      `--allow-drop` overrides the 30% rule for intentional channel removals.
   7. **Write only if something meaningful changed.** Compare against `--previous` with `generatedAt` ignored. If nothing differs, print "no changes" and leave the file untouched, so the weekly run doesn't commit noise. Always write atomically: write a temp file, then rename it.
   8. Log counts per channel (fetched / playable / kept). Never log headers or the environment.
3. `scripts/__fixtures__/`: small recorded JSON responses for 2 channels and 2 pages. Include a mix of embeddable, non-embeddable, age-restricted, VN-blocked, live/upcoming and non-pronunciation videos, plus one unknown handle used for the failure test. Record response bodies only, never request headers.
4. `scripts/ingest.test.ts`, which runs against the fixtures and writes **only to a temp dir** (`fs.mkdtemp`):
   - filtering, overrides, `parseIsoDuration`, and sorting
   - "keep old file" on an unknown handle, on quota errors, and on a >30% drop
   - no file written when only `generatedAt` would change
   - no file under `scripts/__fixtures__/` matches `/AIza[0-9A-Za-z_-]{35}/`
5. Add `"ingest": "tsx scripts/ingest.ts"` to `package.json` scripts. This is the only edit allowed in that file.
6. `.github/workflows/refresh-data.yml`. This exact design is required: GitHub doesn't let a push made with `GITHUB_TOKEN` trigger the deploy, so this workflow calls it directly.
   ```yaml
   name: Refresh video data
   on:
     schedule: [{ cron: "0 2 * * 1" }]   # Monday 09:00 Vietnam time
     workflow_dispatch:
   permissions:
     contents: write
   jobs:
     refresh:
       runs-on: ubuntu-latest
       outputs:
         changed: ${{ steps.commit.outputs.changed }}
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with: { node-version: 22, cache: npm }
         - run: npm ci
         - run: npm run ingest
           env: { YT_API_KEY: "${{ secrets.YT_API_KEY }}" }
         - run: npm run validate
         - id: commit
           run: |
             if git diff --quiet -- public/data/videos.json; then echo "changed=false" >> "$GITHUB_OUTPUT"; exit 0; fi
             git config user.name "github-actions[bot]"
             git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
             git add public/data/videos.json
             git commit -m "chore(data): refresh video index"
             git pull --rebase origin main
             git push origin HEAD:main
             echo "changed=true" >> "$GITHUB_OUTPUT"
     deploy:
       needs: refresh
       if: needs.refresh.outputs.changed == 'true'
       uses: ./.github/workflows/deploy.yml   # checks out ref: main, so it picks up the bot commit
   ```
   - `main` must not require PRs for `github-actions[bot]`. Note this in the README.
   - Failed scheduled runs email the repo owner by default; keep that notification on.
   - GitHub disables scheduled workflows in public repos after 60 days with no repo activity. The README must say to re-enable it from the Actions tab if that happens.
7. **Owner go-ahead needed:** confirm `YT_API_KEY` is set, then trigger `refresh-data` once by hand.

### Verification
```bash
npm test -- scripts && npm run typecheck
read -s YT_API_KEY && export YT_API_KEY && npm run ingest -- --dry-run; unset YT_API_KEY   # optional local check; keeps the key out of shell history
git grep -nE "AIza[0-9A-Za-z_-]{35}" ; echo "exit=$? (1 means clean)"
```
After merging: the manual `refresh-data` run is green, its `deploy` job ran, `videos.json` on `main` has `source: "youtube-api"`, and the live site shows the new videos.

### Exit criteria
- The live index comes from the API. It contains only public, embeddable, non-age-restricted pronunciation videos that play in Vietnam, and it refreshes weekly.
- A bad handle or an API failure never replaces a good index.
- The ingest fixture tests pass in CI without any key.
- No key appears anywhere in the repo, the fixtures or the logs.

---

## Step 4 — Browse and filter UI

**Branch:** `step-4-browse` · **Depends on:** 2 · **Parallel with:** 3, 5 · **Tier:** default

### Context brief
`useVideoIndex()` in `src/data/loadIndex.ts` returns the `VideoIndex` (see `src/data/schema.ts`). Each `Video` has `tags: TagId[]`, and `src/data/taxonomy.ts` defines `TAG_GROUPS` and `TAGS` with Vietnamese and English labels. Build the home page (`src/features/browse/BrowsePage.tsx`, already a stub at route `/`) so a learner can narrow the list to the sounds they want to work on. Clicking a video goes to `#/watch/:videoId` (Step 5 builds that page). Only edit files under `src/features/browse/`, and style them with `*.module.css` next to the components. Global tokens are in `src/styles/tokens.css`; read them but don't edit them. Do not edit `src/features/player/`, `scripts/`, `package.json` or `App.tsx`. Every dependency is already installed, including `@testing-library/user-event`. Tests use `src/test/fixtures/videoIndex.ts`, never `public/data/videos.json`.

### Tasks
1. `src/features/browse/filters.ts` (pure, tested): `type Filters = { tags: TagId[]; channels: string[]; duration: "any" | "short" | "medium" | "long"; q: string; sort: "newest" | "shortest"; hideShorts: boolean }`. Function `applyFilters(videos, filters)`:
   - Tags: **AND across groups, OR within a group**.
   - Duration buckets: `<5 min`, `5–15 min`, `>15 min`.
   - `q`: diacritic-insensitive title search using `fold` from `src/data/text.ts`, so "phat am" matches "phát âm" and "dong" matches "đồng".
   - Sort "newest" puts videos without `publishedAt` (seed data) last.
   - Also export `filtersToSearchParams` / `searchParamsToFilters`.
2. Filters sync to the URL query inside the hash (`#/?tags=th-sounds,ed-endings&dur=short`), so filtered views can be shared and bookmarked.
3. UI: a sidebar (a bottom sheet on mobile) with tag chips grouped by `TAG_GROUPS` (Vietnamese label plus small English and IPA, with per-tag counts for the current result set), channel checkboxes, a duration segmented control, search, sort, and a "hide Shorts" toggle. Add a "Clear all" button and a result count.
4. Video grid: thumbnail (`loading="lazy"`), title, channel, duration, and up to 3 tag pills. The card is a `<Link>` to `/watch/:id`. Reserve a slot in the card for a "done" badge with a prop `done?: boolean`. Step 7 will wire it up, so default it to false.
5. Loading skeleton, error state with retry, and an empty state that suggests removing the last filter.
6. Tests: `filters.test.ts` (logic and URL round-trip) and a component test (choosing a chip narrows the grid).

### Verification
```bash
npm test && npm run typecheck && npm run build && npm run preview
```
Manual: pick "th-sounds" plus "short", reload the page and confirm the filters stay. Search "am cuoi" and confirm it finds "âm cuối". Check at 375px width with no horizontal scroll.

### Exit criteria
- Filtering, search, sort and URL sync work against the seed data, and the tests pass.
- Usable on mobile; every control can be reached and used by keyboard.

---

## Step 5 — Focus player page

**Branch:** `step-5-player` · **Depends on:** 2 · **Parallel with:** 3, 4 · **Tier:** default

### Context brief
Route `#/watch/:videoId` (stub at `src/features/player/PlayerPage.tsx`) plays one video in a **distraction-free** way: no recommendations wall, no comments, no autoplay into the next video. It loads the video's metadata from `useVideoIndex()` (`src/data/loadIndex.ts`). This step also creates **two stub components that later steps fill in**: `src/features/player/PracticePanel.tsx` (Step 6, shadow & record) and `src/features/player/VideoActions.tsx` (Step 7, progress). Give both stable props now so Steps 6 and 7 can work in parallel without conflicts. Only edit `src/features/player/`, styled with `*.module.css`. Do not edit `package.json`, `App.tsx` or global styles; `@types/youtube` is already installed. Tests use `src/test/fixtures/videoIndex.ts`.

**The IFrame API can't make YouTube fully distraction-free.** `rel: 0` only limits the end-screen suggestions to the same channel, the "More videos" panel on pause can't be turned off, and `modestbranding` has done nothing since 2023. So this step reduces distractions by owning the controls and replacing the end screen; it does not remove YouTube's UI.

### Tasks
1. `src/features/player/useYouTubePlayer.ts`:
   - Loads `https://www.youtube.com/iframe_api` once, using a module-level promise that resolves on `window.onYouTubeIframeAPIReady`.
   - Creates `new YT.Player(el, { videoId, playerVars: { rel: 0, playsinline: 1, iv_load_policy: 3, disablekb: 1 } })`.
   - Optionally tries `host: "https://www.youtube-nocookie.com"`. That option is undocumented, so keep it only if playback and events work, and fall back without it.
   - Exposes `{ ready, play, pause, seekTo, getCurrentTime, setRate, availableRates, state }`, and destroys the player on unmount or when the video changes.
2. Segment loop:
   - "Set A" / "Set B" buttons capture the current time.
   - A loop toggle polls (`requestAnimationFrame` or a 200 ms interval) and seeks back to A once the time passes B.
   - ±1 s nudge buttons.
   - Keyboard shortcuts (`Space` play/pause, `A`, `B`, `L` loop, `[`/`]` speed), shown on the page:
     - Listen for `keydown` on `document`. Ignore events whose target is an `input`, `textarea`, `select`, `button` or `[contenteditable]`, so `Space` on a focused button doesn't fire twice.
     - Once the learner clicks inside the cross-origin iframe, the page **can't receive keys**. On every player state change, move focus to the controls container (`tabIndex={-1}`) and show the hint "Nhấn ra ngoài video để dùng phím tắt · Click outside the video to use shortcuts".
3. Speed control limited to `getAvailablePlaybackRates()`, with 0.5 / 0.75 / 1 shown first.
4. When the video ends, show an overlay ("Luyện lại đoạn này?" — practise this part again / Back to list / next video **with the same tag** from the index) instead of YouTube's end screen.
5. The layout shows the title, channel, and tag pills that link back to `/?tags=<tag>`.
6. Stubs with fixed contracts:
   - `PracticePanel` props: `{ videoId: string; segment: { start: number; end: number } | null; player: PlayerControls }`. For now it renders a "Coming soon" card.
   - `VideoActions` props: `{ videoId: string; tags: TagId[] }`. For now it renders nothing.
   - Export `PlayerControls` (the type returned by the hook) from `useYouTubePlayer.ts`.
7. Unknown `videoId` → a friendly not-found page with a link home.
8. Tests: the loop logic as a pure function (`shouldLoop(t, a, b)`), and the page rendering with the YT API mocked.

### Verification
```bash
npm test && npm run typecheck && npm run build && npm run preview
```
Manual, using a seed video: set A at 0:10 and B at 0:15, loop at 0.75x for 3 cycles. Let the video end and confirm the custom overlay shows. Deep-link reload works on the preview build. Open **every** seed video and replace any that won't play in the embed (Step 2's oEmbed check can't catch those).

### Exit criteria
- [x] The A–B loop and speed control work. Keyboard shortcuts work whenever focus is outside the iframe, and the hint explains this.
- [x] Nothing autoplays after the video ends; our overlay replaces the end screen.
- [x] Every seed video plays in the embed.
- [x] The `PracticePanel` and `VideoActions` stubs with the props above are merged.

---

## Step 6 — Shadow and record practice

**Branch:** `step-6-shadowing` · **Depends on:** 5 · **Parallel with:** 7 · **Tier:** strongest

### Context brief
On the player page (`src/features/player/PlayerPage.tsx`) the learner sets an A–B segment on a YouTube clip. This step fills in the stub `src/features/player/PracticePanel.tsx` (props: `{ videoId, segment, player: PlayerControls }`) so the learner can **shadow**: listen to the segment, record themselves repeating it, then compare. Browsers **cannot capture the YouTube iframe's audio** (it is cross-origin), so the comparison is **sequential**: the model clip, then the learner's recording. Recording uses `getUserMedia` + `MediaRecorder`, which needs HTTPS (GitHub Pages and localhost are both fine). Recordings stay on the device in IndexedDB and are never uploaded. Only edit `PracticePanel.tsx` and new files under `src/features/practice/`. Do not edit `VideoActions.tsx` (Step 7 owns it) or `package.json`: `idb-keyval` and `fake-indexeddb` are already installed.

**iOS/Safari pitfalls:**
- On iOS, an open mic track switches the device's audio session to play-and-record, which makes YouTube playback quiet or routes it to the earpiece. **Stop all mic tracks before Listen and Compare**, and only open the mic for the Record phase.
- Safari has a history of bugs storing `Blob`s in IndexedDB. **Store `{ data: ArrayBuffer, mimeType }`** and rebuild the `Blob` when playing back.

### Tasks
1. `src/features/practice/useRecorder.ts`: asks for mic permission on the first click (not on page load). Picks a MIME type with `MediaRecorder.isTypeSupported`: `audio/webm;codecs=opus`, falling back to `audio/mp4` for Safari/iOS, then to the browser default. States: `idle | requesting | recording | stopped | denied | unsupported`. Auto-stop at `segmentLength × 2 + 2 s`, maxed at 30 s. Stop the tracks on unmount.
2. Flow buttons: **Listen** (plays the A–B segment once through `player`), **Record** (with a 3-2-1 countdown, and an optional "play the segment first, then record" mode), **Compare** (model segment → short pause → learner recording), and **Try again**.
3. Store the last 3 attempts per `(videoId, start, end)` in IndexedDB using `idb-keyval`, keyed as `rec:<videoId>:<start>-<end>:<timestamp>`. Each value is `{ data: ArrayBuffer, mimeType, createdAt, rating? }`. List them with their dates, with play and delete actions. Add a "Delete all recordings" button in the panel.
4. Optional self-rating per attempt (😕 / 🙂 / 😀) saved with the attempt. Step 7 can read it later, but don't depend on it.
5. A small waveform or level meter while recording (`AnalyserNode`) to confirm the mic works. Keep it lightweight.
6. Error copy in Vietnamese and English for: permission denied (with instructions to re-enable), no mic, an unsupported browser, and an insecure context.
7. With no segment set, show a hint telling the learner to set A–B first.
8. Tests: unit tests for MIME selection and the state machine (mock `MediaRecorder` and `getUserMedia`), and IndexedDB storage tests with `fake-indexeddb`.

### Verification
```bash
npm test && npm run typecheck && npm run build && npm run preview
```
Manual:
- **Chrome desktop:** record → compare → reload → the attempt is still listed → delete it.
- **Safari (macOS, and iOS if possible):** recording and playback work, and the YouTube volume is normal after a recording.
- **Mic denied:** the helpful error shows.

### Exit criteria
- The shadowing loop works in Chrome and Safari. Recordings survive a reload and can be deleted.
- No network requests carry audio (check the DevTools Network tab).

---

## Step 7 — Progress tracking

**Branch:** `step-7-progress` · **Depends on:** 4, 5 · **Parallel with:** 6 · **Tier:** default

### Context brief
Learners should see which videos and sounds they have worked on. There are no accounts, so everything lives in `localStorage`. This step fills in the stub `src/features/player/VideoActions.tsx` (props `{ videoId, tags }`), wires the `done` prop on browse cards (Step 4's grid card in `src/features/browse/` already has `done?: boolean`), and builds `src/features/progress/ProgressPage.tsx` (route `/progress`, currently a stub). Tags and groups come from `src/data/taxonomy.ts`. Do not edit `PlayerPage.tsx`, `PracticePanel.tsx` or `src/features/practice/`, which Step 6 may be editing in parallel. Do not edit `package.json`. Step 4 is already merged, so editing `src/features/browse/` (including `filters.ts`) is allowed. Tests use `src/test/fixtures/videoIndex.ts`.

### Tasks
1. `src/features/progress/store.ts`: a versioned key `pf:progress:v1` holding `{ videos: Record<videoId, { status: "started" | "done"; updatedAt: string }>, activity: string[] /* ISO dates, unique per day */ }`. Wrap every access in try/catch (private mode can throw) and fall back to memory. Add a `useProgress()` hook using `useSyncExternalStore`, which also listens for `storage` events so other tabs stay in sync.
2. Writes: `VideoActions` marks the video `started` and logs today's activity **in a `useEffect` on mount**, so `PlayerPage.tsx` doesn't need to change. The **Mark as done** toggle in `VideoActions` sets `done`.
3. Derived stats (pure functions, tested): done count per tag and per group, the current and best daily **streak** using local dates, and the list of "Continue" items (started but not done, most recent first).
4. Browse: pass `done` into the cards, add a "Hide done" filter (extend `Filters` in Step 4's `filters.ts` with `hideDone: boolean`, wired to the URL), and a "Continue" row at the top when one exists.
5. `/progress` page: the streak, a per-group progress bar per tag (done / available), the Continue list, a suggestion for the "weakest" group (fewest done relative to what's available) linking to that filter, and **Export / Import JSON** plus **Reset** with a confirm step.
6. Tests: store migration and corrupted-JSON handling, the streak across month boundaries and a missed day, and the derived counts.

### Verification
```bash
npm test && npm run typecheck && npm run build && npm run preview
```
Manual: open 3 videos, mark 2 done, reload, and check that the badges, the Continue row and the streak are correct. Export, reset and import restore everything. Two tabs stay in sync.

### Exit criteria
- Progress persists and drives the browse badges, the "hide done" filter and the `/progress` page.
- Nothing breaks when storage is unavailable.

---

## Step 8 — Polish and launch

**Branch:** `step-8-launch` · **Depends on:** 3, 4, 5, 6, 7 · **Tier:** default

### Context brief
All features are merged: weekly API ingestion (`scripts/ingest.ts`, `.github/workflows/refresh-data.yml`), browse and filter (`src/features/browse/`), the focus player (`src/features/player/`), shadow and record (`src/features/practice/`), and progress (`src/features/progress/`). The site deploys to `https://trungnv184.github.io/pronunciation-focus/`. This step makes it ready to share with Vietnamese learners: copy, accessibility, performance, first-run guidance, and checks on the live build.

### Tasks
1. **First-run onboarding** (shown once, can be dismissed, remembered in localStorage): a 3-card explainer — pick a sound → loop a clip → record and compare — plus a "Start with ending sounds" button linking to `/?tags=final-consonants`.
2. **About page** `/about` (the route stub exists from Step 1). It needs:
   - how videos are chosen, with a credit and link to every channel
   - a note that videos play through YouTube and belong to their creators
   - a contact link
   - the attribution required by the YouTube API Services policies:
     - a statement that the site uses YouTube API Services
     - links to the **YouTube Terms of Service** (`https://www.youtube.com/t/terms`) and the **Google Privacy Policy** (`https://policies.google.com/privacy`)
     - **the site's own privacy policy**: no accounts, no analytics (or name them), recordings and progress stay on the device, and YouTube embeds may set cookies
   - Link the About page from the footer on every page.
3. **Copy pass:** consistent Vietnamese-first labels, with English beneath for tags. No leftover "Coming soon" text.
4. **Accessibility:** visible focus rings, buttons and chips with `aria-pressed`, labelled controls, contrast ≥ 4.5:1, `prefers-reduced-motion` respected, and a keyboard-only run through every flow.
5. **Performance:** lazy-load the player and progress route pages and the `PracticePanel` component (`React.lazy`). Editing `App.tsx` for this is allowed now, because nothing runs in parallel. Check the size of `videos.json` (if over ~1 MB, drop `description` from the index or split it per channel), and get Lighthouse mobile scores ≥ 90 for Performance and Accessibility.
6. **Meta:** title, description, Open Graph image, favicon, `lang="vi"`.
7. **Freshness guard:** extend `scripts/validate-data.ts` so that when `source === "youtube-api"` it fails if `generatedAt` is more than 30 days old. The YouTube API data-retention policy requires a refresh within 30 days. Because CI runs `validate`, a stalled refresh then turns the next CI or deploy run red instead of silently serving stale data.
8. **Data check:** run `refresh-data` by hand. Spot-check 20 random videos for tag accuracy and add fixes to `data/overrides.json`. Write the observed precision in the PR description (target ≥ 85% of kept videos are truly pronunciation lessons).
9. **README:** setup, how to add a channel, how to fix a tag (overrides), how to rotate the API key, the data refresh schedule, re-enabling the scheduled workflow after 60 inactive days, and the privacy note.
10. Tag `v1.0.0`.

### Verification
```bash
npm test && npm run typecheck && npm run validate && npm run build
# Mobile is Lighthouse's default form factor. Needs a local Chrome.
npx lighthouse https://trungnv184.github.io/pronunciation-focus/ --only-categories=performance,accessibility \
  --output=json --output-path=lh.json --chrome-flags="--headless=new"
node -e 'const r=require("./lh.json");const s=Object.values(r.categories).map(c=>[c.id,c.score]);console.log(s);process.exit(s.every(([,v])=>v>=0.9)?0:1)'
```
On the live site, using a phone: onboarding → filter → loop → record → compare → mark done → `/progress` shows the update.

### Exit criteria
- The live v1 passes the full learner flow on mobile Chrome and iOS Safari, with Lighthouse ≥ 90 for Performance and Accessibility, and tag precision ≥ 85% on the spot check.

---

## Anti-patterns to avoid

- Shipping the API key to the browser, or fetching the YouTube API from the client. Ingestion runs in CI only.
- Absolute asset paths (`/data/videos.json`) that break under `/pronunciation-focus/`. Always use relative paths with `base: "./"`.
- Trying to record or compare the YouTube audio stream directly. It can't be done cross-origin, so keep the comparison sequential.
- Asking for the mic on page load. Ask on the first Record click.
- Two parallel steps editing the same file. Respect the ownership in each context brief.
- Overwriting a good `videos.json` with a partial one after a quota or API error.
- Tagging from descriptions alone (sponsor text and links produce false positives).
- Putting the API key in a URL (`key=`). Use the `X-Goog-Api-Key` header.
- UI tests reading `public/data/videos.json`. It changes weekly, so use `src/test/fixtures/videoIndex.ts`.
- Adding dependencies or global CSS inside a parallel step.
- Reusing a `/g` regex with `.test()` (stateful `lastIndex`).

## Plan mutation protocol

- **Split** a step if it grows past ~400 changed lines or 2 days: name the parts `N.a`, `N.b`, keep the dependencies, and update the graph.
- **Insert** a step by giving it the next free number with explicit dependencies. Never renumber merged steps.
- **Skip or abandon:** mark the step `~~Step N~~ — skipped (reason, date)` and check whether anything downstream depended on it.
- **Reorder** only along valid dependency edges.
- Record every change in the log below.

## Change log

| Date | Change | By |
|---|---|---|
| 2026-10-24 | Plan created | blueprint |
| 2026-10-24 | Adversarial review: fixed 3 critical, 10 major and 9 minor findings. Config inlined in Step 1, all dependencies and global CSS owned by Step 1, seed fields made optional, ingest moved to header auth with playability filters, partial-index guard and atomic writes, deploy prescribed via `workflow_call` with `ref: main`, keyboard-focus handling around the iframe, iOS mic and IndexedDB fixes, YouTube API attribution and 30-day freshness guard, mobile Lighthouse assertion. | blueprint review |
| 2026-10-25 | Step 2: channel list set to 6 real channels (4 EN, 2 VI). Tagger additions beyond the brief: Unicode-aware `\b`, diacritic-free matching only for unaccented text, channel name stripped from titles, general "pronunciation" check on titles only, `NOT_A_LESSON` filter, `cleanDescription` + `findBoilerplateLines` (Step 3 must strip per-channel boilerplate before tagging). `tsconfig.node.json` also includes the pure `src/data/*.ts` modules. | step 2 |
