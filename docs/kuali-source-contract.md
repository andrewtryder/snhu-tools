# SNHU Kuali Catalog Source Contract & Integration Specification

> [!WARNING]
> **Unsupported Third-Party API Notice**: The Kuali Catalog API (`https://snhu.kuali.co/api/v1/catalog`) is an unauthenticated public API owned and operated by Kuali, Inc. for SNHU catalog publishing. Its payload shapes, endpoint paths, and field names are subject to unannounced change without notice. **Production pages must never query this API directly during a visitor request.**

---

## 1. Environment & Probing Parameters

| Parameter | Tested Value / Default | Description |
| :--- | :--- | :--- |
| **KUALI_BASE_URL** | `https://snhu.kuali.co` | Kuali Catalog service host |
| **KUALI_CATALOG_ID** | `6349a3f9164d00001c6c80da` | SNHU 2025–2026 Academic Catalog ID |
| **Sample Program PID** | `V1S14E8tg` | Computer Science (BS) program PID |
| **Sample Program PID** | `EJeCh74Ltl` | Accounting (BS) program PID |
| **Last Verified Date** | `2026-07-31` | Automated probe script execution date |

---

## 2. Tested Endpoint Specifications

### 2.1 Program List Endpoint
- **URL Pattern**: `/api/v1/catalog/programs/{catalogId}?q={query}`
- **HTTP Method**: `GET`
- **Response Format**: `JSON Array` (236 records in active catalog)
- **Primary Fields**: `pid`, `title`, `code`, `programType`, `catalogCategory`, `offering`, `dateStart`.

### 2.2 Program Detail Endpoint
- **URL Pattern**: `/api/v1/catalog/program/{catalogId}/{pid}`
- **HTTP Method**: `GET`
- **Response Format**: `JSON Object`
- **Primary Fields**: `pid`, `title`, `code`, `description`, `rulesRequirements` (HTML string), `specializations` (Array of concentration objects).

### 2.3 Course Catalog Search Endpoint
- **URL Pattern**: `/api/v1/catalog/courses/{catalogId}?q={query}`
- **HTTP Method**: `GET`
- **Response Format**: `JSON Array` (844 records for prefix search)
- **Primary Fields**: `pid`, `code`, `title`, `subjectCode`, `academicLevel`.

### 2.4 Course Detail Endpoint
- **URL Pattern**: `/api/v1/catalog/course/{catalogId}/{pid}`
- **HTTP Method**: `GET`
- **Response Format**: `JSON Object`
- **Primary Fields**: `pid`, `code`, `title`, `credits`, `description`, `rulesPrerequisites`.

---

## 3. Payload Structure & Parsing Strategy

### `rulesRequirements` HTML Formatting
Kuali publishes program requirements as embedded HTML containing semantic section tags:
- `<section>`: Demarcates a Requirement Group (e.g. "General Education Courses", "Major Courses", "Free Electives").
- `<h2 data-testid="grouping-label">`: Requirement group header text.
- `<span>42</span><span>Total Credits</span>`: Group total credit target.
- `<a href="#/courses/view/{pid}">`: Course reference links containing course code text (e.g. `CS 210`, `IT 145`).

> Kuali's requirement-link identifier is the course record's internal `id`, despite the route name. The course-detail endpoint requires the separate public `pid`; synchronization first builds an `id` → `pid` index from `/courses/{catalogId}?q=` before fetching details.

### Parser Resiliency & Fallback Behavior
- **Course-code canonicalization**: Course references are normalized to uppercase `SUBJ NNN` display form and a punctuation-free comparison key, so `ACC-201`, `ACC 201`, and `ACC201` resolve to the same course.
- **Rule Type Mapping**:
  - `Complete all of the following` -> `all_of`
  - `Complete 1 of the following` -> `choose_n` (minimumSelections = 1)
  - `N credit(s) from` -> `choose_credits` (minimumCredits = N)
  - `Free Electives` -> `free_elective`
  - `Concentration` -> `concentration`
- **Unparsed Content**: Any requirement block that does not conform to expected selectors is preserved as a `textRequirement` string and logged in `warnings`.
- **Missing Fields**: If optional fields (e.g. `description`, `code`, or `credits`) are null or missing, default fallback values are injected.

### Relationship and uncertainty handling

- `rulesPrerequisites` may be plain text or HTML. Prerequisite and corequisite clauses are classified independently; every explicit course reference is rendered as an informational relationship, including alternatives. The original clause is retained with the edge. The map does not determine whether a student satisfies grade, permission, or choice requirements.
- Prerequisites outside a degree remain visible as muted external context nodes. They do not count as degree requirements or starting courses.
- Course records without resolvable detail are labeled unavailable, not found, or failed. They are excluded from sequence insights and are never presented as courses with no prerequisites.
- Staging promotion compares edge volume and resolved-course rate with live data and rejects declines greater than 20%.

---

## 4. Rate Limiting, Concurrency & Retry Policy

- **Max Concurrency**: 1–2 simultaneous requests.
- **Request Timeout**: 10,000 ms (`AbortController`).
- **Retry Logic**:
  - **Transient Errors**: Retry HTTP `408`, `429`, and `5xx` server errors up to 3 times with exponential backoff and jitter (`delay = 2^attempt * 500ms + random(0-200ms)`).
  - **Permanent Errors**: Immediately fail without retrying `400`, `401`, `403`, or `404` client response statuses.

---

## 5. How to Refresh Committed Test Fixtures

The `.diagnostics/` directory is transient, gitignored scratch output used solely for intermediate probe inspection.

Run the automated probe script to generate local diagnostic output:
```bash
npx tsx scripts/probe-kuali-programs.ts --pid V1S14E8tg
```

Then refresh the committed test fixtures:
```bash
node -e '
  const fs = require("fs");
  const path = require("path");
  const fullList = JSON.parse(fs.readFileSync("./.diagnostics/raw-program-list.json", "utf-8"));
  fs.writeFileSync("./src/data/fixtures/program-list.sample.json", JSON.stringify(fullList.slice(0, 10), null, 2));
  const cs = JSON.parse(fs.readFileSync("./.diagnostics/raw-computer-science-program.json", "utf-8"));
  fs.writeFileSync("./src/data/fixtures/computer-science-program.sample.json", JSON.stringify(cs, null, 2));
'
```
