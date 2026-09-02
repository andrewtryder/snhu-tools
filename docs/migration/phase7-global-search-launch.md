# Phase 7 Unified Global Search Launch

## Source Checkpoint

- **Git Commit SHA**: `409fecf569cf212d739ca13bae21c1e7285931a7`
- **Branch**: `integration/snhu-tools`
- **Pushed to Origin**: Clean, synchronized with `origin/integration/snhu-tools`
- **Baseline Commit**: `995f62d4efe58f29777f1f01135f1f568d9f498c`
- **Production Deployment ID**: `dpl_7PonnVQN8WsU78uaKEMx4YFDi3Sz`
- **Production Deployment URL**: `https://snhu-tools-kda0b2qa0-andrewtryder.vercel.app`
- **Canonical Aliases**: `https://snhu-tools.vercel.app`, `https://snhu-tools-andrewtryder.vercel.app`
- **Previous Deployment (Rollback Reference)**: `dpl_Be3sxfaANGB4ABpfLqEtiZ2JqNv9` (`https://snhu-tools-4mhw6s7fo-andrewtryder.vercel.app`)

## Search Architecture

The unified search architecture coordinates querying across the three primary product domains using sequential execution through `searchAll` to respect the `max: 1` consolidated runtime database pool:

- **Programs**: In-memory search over canonical programs catalog via `searchPrograms`, matching program titles, credentials, and levels. Returns canonical relative hrefs (`/programs/<slug>`).
- **Courses**: Database query via `searchCourses` over `courses_data`, searching strictly `catalog_course_id` and `title` case-insensitively with deterministic SQL ranking (exact normalized code > code prefix > code contains > title prefix > title contains). Supports space- and hyphen-insensitive normalized course codes (e.g. `CS 210`, `CS-210`, `cs210` -> `CS210`). Returns canonical relative hrefs (`/courses/<ID>`).
- **Transfer Options**: Database query via `searchTransferCourses` aggregating rows from `transfer_courses` grouped by canonical SNHU course code (`coursenumber`), returning the consolidated transfer option count. Returns canonical relative hrefs (`/transfers/courses/<slug>`).
- **Domain Failure Isolation**: `searchAll` isolates failures in any single domain (e.g., database timeout) and returns partial results accompanied by an `unavailable` domain array.

## API Compatibility

- **/api/search**: Untouched, preserving the legacy Degree Map Programs-only search contract:
  - Input: `?q=<query>&limit=<number>&level=<level>`
  - Response: `{ results: Program[], query: string, count: number }`
  - Zero grouped structure or non-program records returned.
- **/api/courses/search**: Preserves the existing historical Courses API contract:
  - Input: `?q=<query>&limit=<number>`
  - Response: `Array<{ catalog_course_id: string; title: string }>`
  - Reused by existing Course search input components without regression.

## New API

- **/api/global-search**: Dedicated endpoint serving unified grouped results for autocomplete and client integrations:
  - Input: `?q=<query>&limit=<number>` (default limit: 5, bounds: 1 to 20)
  - Caching: `Cache-Control: public, s-maxage=300, stale-while-revalidate=600`
  - Sanitization: Returns generic 500 error on unexpected failures with zero internal credentials or stack trace leaks.
  - Structure:
    ```json
    {
      "query": "cs210",
      "results": {
        "programs": [...],
        "courses": [...],
        "transfers": [...]
      },
      "counts": {
        "programs": 3,
        "courses": 1,
        "transfers": 1,
        "total": 5
      }
    }
    ```

## Header UX

- Integrated into `AppHeader` across desktop and mobile layouts via `<GlobalSearch />`.
- Accessibility: Uses WAI-ARIA combobox pattern (`role="combobox"`, `aria-autocomplete="list"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`).
- Accessible Label: `Search SNHU programs, courses, and transfer options`.
- Placeholder: `Search programs, courses, or transfer options...`.
- Autocomplete: Debounced (250ms) suggestions with abort control; categorizes suggestions into grouped headings ("Degree Programs", "Courses", "Transfer Options").
- Keyboard Navigation: Supports `ArrowDown`, `ArrowUp`, `Enter` to navigate and select suggestions; `Escape` closes the dropdown.
- Plain Enter Submission: Submits query to `/search?q=<encoded_query>` (NOT legacy `/programs?q=...`).

## Search Page

- Route: `/search?q=<query>`
- Layout: Full-page responsive grid with distinct sections for **Degree Programs**, **Courses**, and **Transfer Options**.
- Empty / Short Query: Displays prompt to enter at least 2 characters.
- No-Results: Clean message guiding the user toward valid queries.
- Partial Availability: Displays graceful status banner when any domain reports failure.
- Robots Metadata:
  ```
  robots: {
    index: false,
    follow: true
  }
  ```
  Ensures internal search result pages are not indexed by search engines while link equity is followed.

## Production Validation

All live production endpoints tested on `https://snhu-tools.vercel.app` (`dpl_7PonnVQN8WsU78uaKEMx4YFDi3Sz`):

1. **Root / Navigation Routes**:
   - `/` -> HTTP 200
   - `/about` -> HTTP 200
   - `/programs` -> HTTP 200
   - `/courses` -> HTTP 200
   - `/transfers` -> HTTP 200
2. **Program Global Search** (`GET /api/global-search?q=accounting`):
   - HTTP 200, returned 5 programs (`accounting-as`, `accounting-bs`, etc.), 5 courses (`ACC315`, `ACC325`, etc.), 5 transfer courses (`ACC201`, etc.).
3. **Course Code Search** (`GET /api/global-search?q=CS210`):
   - HTTP 200, returned canonical course `CS210` (href: `/courses/CS210`, title: "Programming Languages").
4. **Course Title Search** (`GET /api/global-search?q=Scripting`):
   - HTTP 200, returned `IT140` (href: `/courses/IT140`, title: "Introduction to Scripting") and `CIS135` ("Interactive Scripting for Business Applications").
   - Factual clarification resolved: Course catalog title for IT140 is "Introduction to Scripting"; search correctly matches title "Scripting".
5. **Transfer Aggregated Search** (`GET /api/global-search?q=ACC201`):
   - HTTP 200, returned single collapsed transfer result for `ACC201` with `optionCount: 13` and href `/transfers/courses/acc201`.
6. **Cross-Domain Overlap** (`GET /api/global-search?q=CS210`):
   - Simultaneously returned `CS210` in Courses and `CS210` in Transfer Options (2 transfer options).
7. **Search Page Full Render**:
   - `/search?q=CS210` -> HTTP 200, renders all three result sections.
   - `/search?q=accounting` -> HTTP 200, renders matching programs and courses.
   - `/search` (empty) -> HTTP 200, renders minimum character guidance.
8. **Page Robots Tag**:
   - `<meta name="robots" content="noindex, follow">` confirmed on `/search?q=CS210`.

## Existing Search Regression Checks

1. **Legacy Program Search** (`GET /api/search?q=accounting`):
   - Returned HTTP 200 with `{ results: [...], query: "accounting", count: 15 }`.
   - Programs-only format strictly preserved; 0 grouped structure.
2. **Existing Courses Search** (`GET /api/courses/search?q=ACC`):
   - Returned HTTP 200 with array of 10 items formatted as `{ catalog_course_id, title }`.
   - Existing Course explorer search components remain fully operational.
3. **Existing Transfers Search** (`GET /transfers?q=ACC201`):
   - Returned HTTP 200; dedicated transfer explorer and filters function normally.

## Runtime Health

- **Vercel Production Logs**: 23 requests inspected post-deployment; 0 HTTP 500 errors, 0 runtime exceptions, 0 connection pool errors.
- **Connection Multiplexing**: PgBouncer pooling on Neon handled sequential API and SSR requests without connection accumulation or exhaustion.
- **Honeybadger Observability**: 0 unhandled exceptions or search-related error notifications reported.

## SEO Safety

- Temporary `noindex, nofollow` metadata remains intact on `/courses` and `/transfers` routes.
- `/search` configured with `noindex, follow` preventing search index bloat while preserving link crawlability.
- No search result URLs added to `sitemap.ts` or `sitemap.xml`.
- No Search Console submissions or sitemap submissions performed.

## Legacy Safety

- Legacy standalone Vercel projects remain untouched:
  - `snhu-degreemap`
  - `snhu-courses`
  - `snhu-transfers`
- No HTTP 308 redirects enabled on legacy domains.
- CircleCI schedules, contexts, and pipelines remain untouched.
- Neon database resources and tables remain unmodified; zero database writes or migrations performed.

## Recommendation

The unified global search feature is fully deployed, validated in production, and performing according to design specifications with zero errors. All regression suites and historical API contracts are preserved.

The product UX is **READY** for the next gate: **Phase 7 Legacy Domain Redirects & SEO Cutover**.
