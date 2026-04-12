# Bonyad app — 4/5 issue registry

**Purpose:** One file = one place to **open tickets** (GitHub / Linear / Jira / Notion). Each row below is a **discrete issue** with explicit **AI Chatbot · Backend · Frontend · iOS · DB** ownership.

**Batch label:** **4/5** (this registry). Full narrative, prompts, and steps: [`BONYAD_5_4_REQUEST_UPDATES.md`](./BONYAD_5_4_REQUEST_UPDATES.md).

**Platform tags**

| Tag | Meaning |
|-----|--------|
| **iOS** | SwiftUI app (`bonyad-cr-2`). |
| **Frontend** | Shared client work: iOS + **Android** + **Web** where parity is required. |
| **AI Chatbot** | Assistant API, prompts, intents, RAG/CMS content. |
| **Backend** | APIs, flags, webhooks, admin, PDF/payment pipelines. |
| **DB** | Schema, migrations, enums. |

**How to use:** Copy a block into your tracker, or import the **index table** as CSV (export from the markdown table if needed).

---

## Index (all issues)

| ID | Title | iOS | Frontend | AI Chatbot | Backend | DB | Epic |
|----|--------|:---:|:--------:|:----------:|:-------:|:--:|------|
| **45-P1** | Project attachments: photos + files (manual + AI) | ✓ | ✓ | — | ✓ | ✓ | Create project |
| **45-P2** | Home quick services: max 6 + AR copy (رئيسية / بسيطة) | ✓ | ✓ | — | opt | opt | Home |
| **45-P3** | Tab bar: label under every tab (active + inactive) | ✓ | ✓ | — | — | — | Navigation |
| **45-P4** | My projects: small tasks entry (user + technician) | ✓ | ✓ | — | ? | — | Projects |
| **45-P5** | Disable booking system app-wide (temporary) | ✓ | ✓ | opt | ✓ | — | Booking |
| **45-P6** | User tab bar: Calendar → Small tasks | ✓ | ✓ | — | — | — | Navigation |
| **45-P7** | Arabic Beta: نسخة تجريبية | ✓ | ✓ | — | opt | — | L10n |
| **45-P8** | Tutorial/help: kitchen → room on roof (EN/AR) | ✓ | ✓ | ✓ | opt | — | Onboarding |
| **45-A** | Chatbot: project brief quality (playbook EN/AR) | ✓ | ✓ | **✓** | ✓ | opt | Assistant |
| **45-B** | Chatbot: SOW + pricing guidance (disclaimers) | ✓ | ✓ | **✓** | ✓ | — | Assistant |
| **45-C** | Pre-flight: 6 pillars before “Generate with AI” | **✓** | later | opt | opt | opt | Create project |
| **45-D** | FAB “+” coachmark: show once per install | **✓** | ✓ | — | — | — | Onboarding |
| **45-E** | Saved cards, pay, refunds, technician payouts | ✓ | ✓ | — | **✓** | **✓** | Payments |
| **45-F** | Support tickets: 3 states + UI refresh | ✓ | ✓ | — | **✓** | migrate | Support |
| **45-G** | Home: contracts, support; tech: + portfolio | ✓ | ✓ | — | — | — | Home |
| **45-H** | Knowledge library (مكتبة المعرفة) + videos | ✓ | later | link | config | — | Onboarding |
| **45-I** | Section headers + card visual hierarchy | ✓ | ✓ | — | — | — | UI polish |
| **45-J** | Copy: ملخص المشروع → وصف المشروع | ✓ | ✓ | — | maybe | — | L10n |
| **45-K** | Phases label: مراحل العمل والمخرجات | ✓ | ✓ | — | maybe | — | Create project |
| **45-L** | Construction: optional considerations (animated) | ✓ | later | content | opt | — | Create project |
| **45-M** | Project list cards: photo thumb or logo fallback | ✓ | ✓ | — | URLs | — | Projects |
| **45-N** | Technician portfolio PDF pipeline (quality) | preview | — | — | **✓** | opt | Portfolio |
| **45-O** | Bank transfer + proof upload + admin approval | ✓ | ✓ | — | **✓** | **✓** | Payments |
| **45-P** | Copy: عمولة المنصة → رسوم المنصة | ✓ | ✓ | — | invoices | — | L10n |
| **45-Q** | Technician offline / personal tracking project | ✓ | later | — | **✓** | **✓** | Projects |

---

## Issues — P1–P8 (product / 4–5 May batch)

### 45-P1 — Project attachments: photos + files (manual + AI)

- **Epic:** Create project  
- **Platforms:** **Backend**, **DB**, **iOS**, **Frontend** (Android, Web). **AI Chatbot:** optional later.  
- **Summary:** Users attach **photos** (keep) and **files** (PDF, docs) in **Manual** and **AI** project creation; upload, validate, store metadata, link `project_id`.  
- **Acceptance criteria:**  
  - Backend: create/list/delete attachments; type/size validation; multipart or signed URLs.  
  - DB: `project_attachments` (or equivalent) with `source: manual|ai`.  
  - iOS: `UIDocumentPicker`, list/remove, errors, submit integration; photos unchanged.  
  - Android/Web: parity.  
- **Reference:** [`BONYAD_5_4_REQUEST_UPDATES.md`](./BONYAD_5_4_REQUEST_UPDATES.md#task-1--attachments-photos-and-files-on-manual--ai-project-creation)

---

### 45-P2 — Home quick services: max 6 + Arabic copy

- **Epic:** Home  
- **Platforms:** **iOS**, **Frontend**; **Backend** optional (`GET /config/home-quick-services`); **DB** only if server config persisted.  
- **Summary:** Quick row shows **exactly six** curated services; AR: `quick_services` → **الخدمات الرئيسية**; small-task section → **المهام البسيطة**.  
- **Acceptance criteria:** Six IDs/slugs defined; client caps list; all AR/EN bundles + PerView updated; RTL checked.  
- **Reference:** [Task 2](BONYAD_5_4_REQUEST_UPDATES.md#task-2--home-quick-services-max-6-services--arabic-copy)

---

### 45-P3 — Tab bar: title under every tab

- **Epic:** Navigation  
- **Platforms:** **iOS**, **Frontend** (Android).  
- **Summary:** Every tab shows **icon + label**; unselected uses opacity/color, **not** hidden label.  
- **Acceptance criteria:** Custom tab bar audited; Android `LABEL_VISIBILITY_LABELED` or equivalent; smallest device QA.  
- **Reference:** [Task 3](BONYAD_5_4_REQUEST_UPDATES.md#task-3--tab-bar-title-under-every-tab)

---

### 45-P4 — My projects: small tasks entry (user + technician)

- **Epic:** Projects  
- **Platforms:** **iOS**, **Frontend**; **Backend** if “mine” APIs need role fixes.  
- **Summary:** User and technician “my projects” surfaces expose a clear **Small tasks** path (chip, segment, row).  
- **Acceptance criteria:** Navigation to existing small-task list/create; localized keys (`small_tasks` / `my_small_tasks`); role-appropriate stacks.  
- **Reference:** [Task 4](BONYAD_5_4_REQUEST_UPDATES.md#task-4--my-projects-small-tasks-entry-user--technician)

---

### 45-P5 — Disable booking system (temporary)

- **Epic:** Booking / calendar  
- **Platforms:** **Backend** (feature flag, endpoints, push), **iOS**, **Frontend**; **AI Chatbot** optional (no booking suggestions).  
- **Summary:** Hide or disable booking/calendar flows until product re-enables.  
- **Acceptance criteria:** `bookings_enabled=false` (or equivalent); no user-facing booking entry points; models may remain for payloads; re-enable doc note.  
- **Reference:** [Task 5](BONYAD_5_4_REQUEST_UPDATES.md#task-5--remove-booking-system-temporary)

---

### 45-P6 — User tab: Calendar → Small tasks

- **Epic:** Navigation  
- **Platforms:** **iOS**, **Frontend** (Android, Web).  
- **Summary:** End-user bottom bar **Small tasks** tab replaces **Calendar**; pairs with 45-P5.  
- **Acceptance criteria:** Tab enum/indices updated; a11y + localized titles; deep links to calendar updated if any.  
- **Reference:** [Task 6](BONYAD_5_4_REQUEST_UPDATES.md#task-6--user-tab-bar-calendar--small-tasks)

---

### 45-P7 — Arabic Beta string: نسخة تجريبية

- **Epic:** Localization  
- **Platforms:** **iOS**, **Frontend**; **Backend** if CMS shows beta.  
- **Summary:** Replace **بيتا** with **نسخة تجريبية** for key `beta` (and hardcoded dupes).  
- **Acceptance criteria:** Grep clean in AR bundles + PerView.  
- **Reference:** [Task 7](BONYAD_5_4_REQUEST_UPDATES.md#task-7--arabic-beta--نسخة-تجريبية)

---

### 45-P8 — Tutorial example: roof room (not kitchen)

- **Epic:** Onboarding / help  
- **Platforms:** **iOS**, **Frontend**, **AI Chatbot** (examples); **Backend** CMS/API if applicable.  
- **Summary:** Replace kitchen renovation examples with roof-room EN/AR copy.  
- **Acceptance criteria:** Keys/constants listed in PR; length fits UI.  
- **Reference:** [Task 8](BONYAD_5_4_REQUEST_UPDATES.md#task-8--helptutorial-kitchen--room-on-roof)

---

## Issues — A–Q (roadmap)

### 45-A — Chatbot: project writing tips (detailed playbook)

- **Epic:** Assistant  
- **Platforms:** **AI Chatbot** (primary), **Backend** (CMS/playbook API), **iOS** / **Frontend** (display, link from AI create).  
- **Summary:** Assistant teaches strong project briefs (scope, timeline, budget, pitfalls); EN/AR; optional RAG JSON.  
- **Reference:** [Task A](BONYAD_5_4_REQUEST_UPDATES.md#task-a--chatbot-project-ideas-quality-checklist-dos-and-donts)

---

### 45-B — Chatbot: scope & pricing advice (non-binding)

- **Epic:** Assistant  
- **Platforms:** **AI Chatbot**, **Backend** (disclaimers), **iOS** (display).  
- **Summary:** Intent `scope_and_pricing_advice`; SOW structure; indicative GCC context; always defer to provider quotes; refusal for illegal/unsafe.  
- **Reference:** [Task B](BONYAD_5_4_REQUEST_UPDATES.md#task-b--chatbot-scope-of-work--pricing-guidance)

---

### 45-C — Pre-flight checklist before AI generate (6 pillars)

- **Epic:** Create project  
- **Platforms:** **iOS** (primary), optional **Backend** validate API, optional **AI Chatbot** hints.  
- **Summary:** Before generate, show missing pillars; “Continue anyway” / “Go back”; unit tests for evaluator.  
- **Reference:** [Task C](BONYAD_5_4_REQUEST_UPDATES.md#task-c--pre-flight-checklist-6-points-before-ai-generate)

---

### 45-D — “+” button guide: once per install

- **Epic:** Onboarding  
- **Platforms:** **iOS** (primary), **Frontend** parity.  
- **Summary:** Coachmark gated by `UserDefaults` / `AppStorage`; never repeats after dismiss; debug reset documented.  
- **Reference:** [Task D](BONYAD_5_4_REQUEST_UPDATES.md#task-d--button-guide-once-per-install)

---

### 45-E — Saved cards, payments, refunds, payouts

- **Epic:** Payments  
- **Platforms:** **Backend**, **DB** (primary); **iOS**, **Frontend** (tokenization UI, HyperPay patterns). **AI Chatbot:** no card data.  
- **Summary:** PCI-safe tokens; transactions/refunds; technician payouts; webhooks.  
- **Reference:** [Task E](BONYAD_5_4_REQUEST_UPDATES.md#task-e--saved-cards-pay-out-refunds)

---

### 45-F — Support tickets: 3 states + UI

- **Epic:** Support  
- **Platforms:** **Backend**, **DB** (enum migration); **iOS**, **Frontend** (list/detail UI).  
- **Summary:** Statuses only `open` | `in_progress` | `closed`; migrate legacy; refreshed cells/badges.  
- **Reference:** [Task F](BONYAD_5_4_REQUEST_UPDATES.md#task-f--support-tickets-3-states--ui-refresh)

---

### 45-G — Home shortcuts: contracts, support; tech portfolio

- **Epic:** Home  
- **Platforms:** **iOS**, **Frontend**.  
- **Summary:** User home: **My contracts**, **Support center**; technician: **+ My portfolio**; reduce Profile duplication.  
- **Reference:** [Task G](BONYAD_5_4_REQUEST_UPDATES.md#task-g--home-my-contracts-support-tech--my-portfolio)

---

### 45-H — Knowledge library + videos (مكتبة المعرفة)

- **Epic:** Onboarding  
- **Platforms:** **iOS** (primary), **Backend** (CDN/config URLs), **AI Chatbot** (help links); **Frontend** later.  
- **Summary:** Rename flow; 3 sections with video + interactive elements; completion tracking.  
- **Reference:** [Task H](BONYAD_5_4_REQUEST_UPDATES.md#task-h--onboarding--knowledge-library-مكتبة-المعرفة--videos)

---

### 45-I — Section titles & card styles (visual separation)

- **Epic:** UI polish  
- **Platforms:** **iOS**, **Frontend**.  
- **Summary:** Shared section header style; card rhythm; `ThemeManager` strokes; scope home/projects primarily.  
- **Reference:** [Task I](BONYAD_5_4_REQUEST_UPDATES.md#task-i--section-titles--card-styles-visual-separation)

---

### 45-J — Copy: وصف المشروع (was ملخص المشروع)

- **Epic:** Localization  
- **Platforms:** **iOS**, **Frontend**; **Backend** if PDF/email.  
- **Summary:** Project-wide AR (and EN if shared key) update.  
- **Reference:** [Task J](BONYAD_5_4_REQUEST_UPDATES.md#task-j--copy-ملخص-المشروع--وصف-المشروع)

---

### 45-K — Phases label: مراحل العمل والمخرجات

- **Epic:** Create project  
- **Platforms:** **iOS**, **Frontend**; **Backend** if PDFs/emails.  
- **Summary:** Unified EN/AR for AI + manual phases section (fix typos vs “المخرحات”).  
- **Reference:** [Task K](BONYAD_5_4_REQUEST_UPDATES.md#task-k--phases-label-مراحل-العمل-والمخرجات)

---

### 45-L — Construction: optional considerations (animated)

- **Epic:** Create project  
- **Platforms:** **iOS**; **AI Chatbot** / **Backend** for hint content JSON.  
- **Summary:** `OptionalConsiderationsCard`; non-blocking optional list; subtle animation.  
- **Reference:** [Task L](BONYAD_5_4_REQUEST_UPDATES.md#task-l--construction-ai-optional-consider-also-animated)

---

### 45-M — Project cards: thumbnail or Bonyad logo

- **Epic:** Projects  
- **Platforms:** **iOS**, **Frontend**; **Backend** attachment URLs.  
- **Summary:** First image async load; fallback logo; design-system radius/fill.  
- **Reference:** [Task M](BONYAD_5_4_REQUEST_UPDATES.md#task-m--project-cards-thumbnail-or-bonyad-logo)

---

### 45-N — Portfolio PDF quality + pipeline

- **Epic:** Portfolio  
- **Platforms:** **Backend** (primary: HTML→PDF etc.); **iOS** preview/download.  
- **Summary:** Professional PDF from structured profile; optional LLM for copy only.  
- **Reference:** [Task N](BONYAD_5_4_REQUEST_UPDATES.md#task-n--portfolio-pdf-design--generation-pipeline)

---

### 45-O — Bank transfer + proof + admin approval

- **Epic:** Payments  
- **Platforms:** **Backend**, **DB**; **iOS**, **Frontend**.  
- **Summary:** Reference code, proof upload, admin approve/reject; ledger/transactions states.  
- **Reference:** [Task O](BONYAD_5_4_REQUEST_UPDATES.md#task-o--payments-bank-transfer--proof--admin-approval)

---

### 45-P — Copy: رسوم المنصة (was عمولة المنصة)

- **Epic:** Localization / invoices  
- **Platforms:** **iOS**, **Frontend**, **Backend** invoice/PDF strings.  
- **Summary:** Arabic display string project-wide; EN “Platform fee” still valid.  
- **Reference:** [Task P](BONYAD_5_4_REQUEST_UPDATES.md#task-p--copy-عمولة-المنصة--رسوم-المنصة)

---

### 45-Q — Technician personal / offline project

- **Epic:** Projects  
- **Platforms:** **Backend**, **DB**; **iOS**; **Frontend** later.  
- **Summary:** Tech-only “track external job”; no end-user; private visibility; simplified chat/reviews.  
- **Reference:** [Task Q](BONYAD_5_4_REQUEST_UPDATES.md#task-q--technician-offline--personal-tracking-project)

---

## Checklist (copy into tracker)

**P1–P8**

- [ ] 45-P1 — Attachments photos + files  
- [ ] 45-P2 — Quick services ×6 + AR  
- [ ] 45-P3 — Tab labels always visible  
- [ ] 45-P4 — My projects → small tasks  
- [ ] 45-P5 — Booking disabled  
- [ ] 45-P6 — Calendar tab → small tasks  
- [ ] 45-P7 — Beta AR  
- [ ] 45-P8 — Roof tutorial example  

**A–Q**

- [ ] 45-A — Assistant project playbook  
- [ ] 45-B — SOW + pricing intent  
- [ ] 45-C — Pre-flight 6 pillars  
- [ ] 45-D — FAB coachmark once  
- [ ] 45-E — Cards / refunds / payouts  
- [ ] 45-F — Tickets 3 states  
- [ ] 45-G — Home shortcuts  
- [ ] 45-H — Knowledge library  
- [ ] 45-I — Section/card UI  
- [ ] 45-J — وصف المشروع  
- [ ] 45-K — مراحل العمل والمخرجات  
- [ ] 45-L — Construction optional UI  
- [ ] 45-M — Card thumbnails  
- [ ] 45-N — Portfolio PDF  
- [ ] 45-O — Bank transfer flow  
- [ ] 45-P — رسوم المنصة  
- [ ] 45-Q — Tech offline project  

---

## Cross-reference

| Doc | Role |
|-----|------|
| [`BONYAD_5_4_REQUEST_UPDATES.md`](./BONYAD_5_4_REQUEST_UPDATES.md) | Full prompts, steps, third-party deps |
| [`BONYAD_HOME_SERVICES_IOS.md`](./BONYAD_HOME_SERVICES_IOS.md) | iOS architecture & backlog context |

---

*Issue IDs use prefix **45-** (4/5 batch). Rename in your tracker if you use another scheme.*
