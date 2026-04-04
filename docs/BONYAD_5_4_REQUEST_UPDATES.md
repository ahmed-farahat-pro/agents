# Bonyad — 5/4 request updates & change requests

**Purpose:** Single planning doc for product/engineering: what touches **iOS**, **Frontend** (shared client UI: iOS + Android + Web where noted), **AI Chatbot**, **Backend**, and **DB**. Use for tickets, imports (Jira/Linear/Bonyad briefs), and assistant prompts.

**Note:** Filename encodes the request batch label **5/4** (no `/` in path). Adjust dates in your tracker as needed.

---

## Platform legend

| Tag | Meaning |
|-----|---------|
| **iOS** | SwiftUI app (`bonyad-cr-2`). |
| **Frontend** | Any client UI — **iOS**, **Android**, **Web** when behavior is shared or explicitly listed. |
| **AI Chatbot** | Bonyad in-app assistant (API + prompts, RAG, CMS content — not only `ChatbotView`). |
| **Backend** | Spring Boot (or primary API), webhooks, admin, payments, notifications. |
| **DB** | Schema, migrations, reporting. |
| **Android** / **Web** | Called out when parity is required beyond iOS. |

### Quick ownership key (per layer)

| Layer | Typical work |
|--------|----------------|
| **AI Chatbot** | System prompts, intents, bilingual templates, optional RAG/JSON playbooks, assistant API. |
| **Backend** | REST endpoints, feature flags, webhooks, validation, PDF generation, admin approval flows. |
| **Frontend** | Screens, navigation, localization, tokens to APIs (includes **iOS** unless Android/Web only). |
| **iOS** | SwiftUI-specific implementation in `bonyad-cr-2`. |
| **DB** | Tables, enums, migrations, indexes. |

---

# Part 1 — Tasks P1–P8 (product backlog)

Each task lists **AI Chatbot · Backend · Frontend · iOS** (and **DB** / **Android** / **Web** when relevant).

---

## Task 1 — Attachments: photos **and files** on manual + AI project creation

**Goal:** Users add **photos** plus **files** (PDF, etc.) in **Manual** and **AI** project flows.

| Layer | Scope |
|--------|--------|
| **Backend** | Multipart or signed URLs; validate type/size; attach to `project_id`. |
| **DB** | `project_attachments` (id, project_id, file_url, mime_type, size, created_at, source: manual \| ai). |
| **iOS** | `ManualProjectForm`, `AIProjectForm`: `UIDocumentPicker`, upload pipeline, list + remove, errors. |
| **Frontend** | **Android** / **Web**: same UX parity. |
| **AI Chatbot** | *—* (optional later: “attach files before generate”). |

**Steps:** (1) Backend model + endpoints (2) iOS (3) Android/Web (4) QA RTL/offline/large files.

**AI prompt (iOS first)**

```text
In the Bonyad iOS app (SwiftUI), add non-photo file attachments to project creation for both ManualProjectForm and the AI project flows (AIProjectForm / summary submit path). Use UIDocumentPicker (or PHPicker for images only where appropriate) to let users pick PDFs and common document types. Reuse BaseURLManager and existing multipart patterns if any; otherwise add an upload service that POSTs files to the backend project attachment endpoint (define a plausible path and Request models). Show selected files in a list with remove; disable submit until uploads succeed or queue with project create. Match ThemeManager and existing ManualProjectForm photo UX. Do not remove existing photo support.
```

---

## Task 2 — Home “quick services”: max **6** services + Arabic copy

**Goal:** Quick services row shows **six** curated items; Arabic copy updates.

| Layer | Scope |
|--------|--------|
| **iOS** | Cap list / filter in `HomeView` or config; `ar.lproj` / `en.lproj` / PerView. |
| **Frontend** | **Android** / **Web**: same cap + strings. |
| **Backend** | *Optional:* `GET /config/home-quick-services` → six `categoryId`s. |
| **AI Chatbot** | *—* |
| **DB** | *—* unless config stored server-side. |

| Current (concept) | New |
|-------------------|-----|
| `quick_services` → “الخدمات السريعة” | **“الخدمات الرئيسية”** |
| Small task section e.g. `small_task_types` | **“المهام البسيطة”** |

**AI prompt**

```text
In bonyad-cr-2 iOS project, find where HomeView (or equivalent) loads quick services / small tasks horizontal lists. Cap the quick services carousel to exactly 6 items from a constant array of category IDs or slugs (placeholder IDs with a TODO). Update Arabic localization: change key quick_services to "الخدمات الرئيسية" and small_task_types to "المهام البسيطة" in ar.lproj and mirrored PerView Arabic files; add sensible English strings in en.lproj. Do not change unrelated screens.
```

---

## Task 3 — Tab bar: title under **every** tab

**Goal:** Labels under **all** tabs; selection = style only (not hide label).

| Layer | Scope |
|--------|--------|
| **iOS** | Custom tab bar: icon + title always visible. |
| **Frontend** | **Android**: `LABEL_VISIBILITY_LABELED` or custom parity. |
| **Backend** | *—* |
| **AI Chatbot** | *—* |

**AI prompt**

```text
Find the main user tab bar implementation in the iOS app (SwiftUI). Ensure the title/label string appears under every tab item for both selected and unselected states; use opacity or color to distinguish selection instead of hiding the label. Keep RTL safe. List files changed.
```

---

## Task 4 — “My projects”: **small tasks** entry (user + technician)

**Goal:** Clear path to small tasks from user + tech “my projects” surfaces.

| Layer | Scope |
|--------|--------|
| **iOS** | `ProjectsListView` / tech lists: segment, chip, or row → small tasks. |
| **Backend** | Ensure “mine” list APIs for both roles if needed. |
| **Frontend** | **Android** / **Web** parity as applicable. |
| **AI Chatbot** | *—* |

**AI prompt**

```text
On iOS Bonyad app, locate the user's "My projects" screen and the technician's projects/home list. Add a visible "Small tasks" access point (e.g. horizontal bar, segmented control, or tappable row) that navigates to the existing small tasks list or creation flow. Use existing localization keys like small_tasks or my_small_tasks. Respect technician vs user navigation stacks.
```

---

## Task 5 — Remove **booking** system (temporary)

**Goal:** Hide/disable booking / calendar flows app-wide.

| Layer | Scope |
|--------|--------|
| **iOS** | Feature flag / hide CTAs, tabs, `needs_booking`. |
| **Frontend** | **Android** / **Web** same. |
| **Backend** | `bookings_enabled=false`; 404/410 or empty; push templates off. |
| **AI Chatbot** | *—* (optional: don’t suggest booking flows). |

**AI prompt**

```text
Search the iOS codebase for user-facing booking features: calendar tab, booking confirmation, needs_booking toggles, and appointment scheduling UI. Behind a single Swift feature flag defaulting to false (or remove entry points), hide navigation to booking and disable booking-related buttons. Do not delete models if still used by project payloads; prefer hiding. Summarize all entry points touched.
```

---

## Task 6 — User tab bar: **Calendar** → **Small tasks**

**Goal:** Bottom bar: small tasks root instead of calendar (pairs with Task 5).

| Layer | Scope |
|--------|--------|
| **iOS** | Tab enum: swap destination + localization + a11y. |
| **Frontend** | **Android** / **Web** tab order. |
| **Backend** | *—* |
| **AI Chatbot** | *—* |

**AI prompt**

```text
In the iOS app main tab bar for end users, replace the Calendar tab with a Small Tasks tab that opens the primary small tasks screen (reuse existing view). Remove or repurpose the calendar tab. Update tab accessibility labels and localized titles. Ensure technician tab bar unchanged unless shared code requires a split.
```

---

## Task 7 — Arabic: **Beta** → **نسخة تجريبية**

**Goal:** Replace **بيتا** with **نسخة تجريبية**.

| Layer | Scope |
|--------|--------|
| **iOS** | `ar.lproj` + PerView `beta` key. |
| **Frontend** | **Android** / **Web** `values-ar` etc. |
| **Backend** | *—* unless CMS shows beta. |
| **AI Chatbot** | *—* |

**AI prompt**

```text
Find all Arabic localizations for the beta label (key "beta" and any hardcoded بيتا). Set the Arabic value to "نسخة تجريبية" in ar.lproj and Localizations/PerView Arabic files. Do not change unrelated keys.
```

---

## Task 8 — Help/tutorial: kitchen → **room on roof**

**Goal:** EN/AR examples use roof room, not kitchen.

| Layer | Scope |
|--------|--------|
| **iOS** | Tutorial strings, `AIProjectForm`, demos. |
| **Backend** | CMS/API default examples if any. |
| **Frontend** | **Android** / **Web** if same copy. |
| **AI Chatbot** | Align few-shot / default suggestions with roof-room example. |

**Suggested copy:** EN: “Building a room on the roof” / AR: “بناء غرفة على السطح”

**AI prompt**

```text
Search the iOS project for user-visible example text that describes a kitchen renovation (English or Arabic) in tutorials, AI prompts, or onboarding. Replace with an example about building a room on the roof: English short phrase + Arabic "بناء غرفة على السطح" where appropriate. Update Localizable.strings and any Swift string constants. List every key changed.
```

---

### Import table (P1–P8)

| id | title | iOS | Frontend (A/W) | AI Chatbot | Backend | DB | epic |
|----|--------|-----|------------------|------------|---------|-----|------|
| P1 | Attachments photos + files | ✓ | ✓ | — | ✓ | ✓ | Create project |
| P2 | Quick services ×6 + AR copy | ✓ | ✓ | — | opt | opt | Home |
| P3 | Tab labels always visible | ✓ | ✓ | — | — | — | Navigation |
| P4 | My projects → small tasks | ✓ | ✓ | — | ? | — | Projects |
| P5 | Disable booking | ✓ | ✓ | opt | ✓ | — | Booking |
| P6 | Calendar tab → small tasks | ✓ | ✓ | — | — | — | Navigation |
| P7 | Beta AR string | ✓ | ✓ | — | opt | — | L10n |
| P8 | Tutorial roof example | ✓ | ✓ | ✓ | opt | — | Onboarding |

---

# Part 2 — Roadmap tasks A–Q (ownership & AI prompts)

---

## Task A — Chatbot: project ideas, quality checklist, do’s and don’ts

| Layer | Role |
|--------|------|
| **AI Chatbot** | **Primary:** system prompt, few-shot, SA/home-services context, optional RAG/JSON playbook. |
| **Backend** | CMS or `/content/playbook` endpoint; logging low-satisfaction turns. |
| **iOS** | Long replies in `ChatbotView` (markdown/sections); link “Tips” from AI create. |
| **Frontend** | Android/Web if shared assistant UI exists. |

**Prompt — AI Chatbot / backend**

```text
You are improving the Bonyad in-app assistant (Arabic + English). Design a system prompt and 6–8 user-facing response templates that teach users how to describe a home-service / construction project clearly. Cover: scope, location, timeline, budget expectations, materials, access, safety, and what makes a bad brief. Include one short example brief for "building a room on the roof" in EN and AR. Output: (1) system prompt text, (2) template list with trigger intents, (3) suggested API shape if content is loaded from backend JSON.
```

---

## Task B — Chatbot: scope of work & pricing guidance

| Layer | Role |
|--------|------|
| **AI Chatbot** | **Primary:** intent `scope_and_pricing_advice`; bilingual; no binding quotes. |
| **Backend** | Disclaimers, legal-safe copy versioning. |
| **iOS** | Display structured/long answers. |

**Prompt — AI Chatbot**

```text
Extend the Bonyad assistant with a dedicated intent: "scope_and_pricing_advice". The bot should explain SOW structure (deliverables, exclusions, assumptions), phased milestones, and how Saudi / GCC home projects often estimate cost drivers. Always state that figures are indicative and official quotes come from providers on the platform. Provide bilingual (EN/AR) short and long reply variants. Include refusal path for illegal or unsafe requests.
```

---

## Task C — Pre-flight checklist: 6 points before AI generate

| Layer | Role |
|--------|------|
| **iOS** | **Primary:** `ProjectDraftCompleteness`, alert/sheet, “Continue anyway”. |
| **Backend** | *Optional:* `POST …/project-drafts/validate` rule-based gaps. |
| **AI Chatbot** | *Optional:* smarter hints from API. |
| **Frontend** | Parity on other clients later. |

**Prompt — iOS**

```text
In the Bonyad iOS app, implement a pre-submit completeness check before calling AI project generation (AIProjectForm and/or ConversationalAIForm). Product defines 6 required "pillars" (placeholder enum: description, location, budget, duration, attachments, constraints). Evaluate filled state from current form state; present a SwiftUI alert or sheet listing missing pillars in Arabic/English using Localizable.strings; primary button "Continue anyway", secondary "Go back and add". Wire primary to existing generate flow. Add unit tests for the evaluator struct.
```

**Prompt — Backend (optional)**

```text
Design POST /api/v1/project-drafts/validate returning JSON { complete: bool, missingKeys: string[], suggestions: localized string[] } for a partial ProjectRequest. No LLM required in v1—rule-based. Document OpenAPI snippet.
```

---

## Task D — “+” button guide: **once** per install

| Layer | Role |
|--------|------|
| **iOS** | **Primary:** `UserDefaults` / `AppStorage` flag; coachmark gating. |
| **Frontend** | Android/Web parity. |
| **Backend** | *—* |
| **AI Chatbot** | *—* |

**Prompt — iOS**

```text
Find the demo overlay or coachmark that explains tapping the + button to create a project (search DemoHighlight, coachmark, onboarding overlay). Gate it with a single UserDefaults key hasSeenFABCreateHint default false; set true when user dismisses or completes the hint. Ensure it never shows again on subsequent cold starts. Do not break demo mode for QA if a separate flag exists—document behavior.
```

---

## Task E — Saved cards, pay-out, refunds

| Layer | Role |
|--------|------|
| **Backend** | **Primary:** PSP tokenization, webhooks, `payment_methods`, `transactions`, `refunds`, payouts. |
| **DB** | **Primary:** schema for tokens, charges, refunds, payouts. |
| **iOS** | Manage cards, pay with token, technician payout status UI. |
| **Frontend** | Android/Web parity. |
| **AI Chatbot** | *—* (no card data in chat). |

**Prompt — Backend**

```text
Outline a PCI-aligned card vault design using tokenization only. Specify tables payment_method, charge, refund, payout with statuses. Include idempotency keys and webhook handlers. Note Saudi/MADA constraints at high level.
```

**Prompt — iOS**

```text
Audit HyperPay usage in the Bonyad iOS app; propose UI flows for (1) user adding a default card, (2) paying with saved token, (3) technician viewing payout status. List files to touch and Apple Pay vs card decision.
```

---

## Task F — Support tickets: 3 states + UI refresh

| Layer | Role |
|--------|------|
| **Backend** | Migrate enums → `open` \| `in_progress` \| `closed`. |
| **DB** | Migration script. |
| **iOS** | List/detail badges, a11y, filters. |
| **Frontend** | Android/Web. |
| **AI Chatbot** | *—* |

**Prompt — Full stack**

```text
Normalize support ticket status to three values: OPEN, IN_PROGRESS, CLOSED. Provide SQL migration sketch and Spring enum change. On iOS, find support/ticket list UI and redesign cells with clear status badge, relative time, and separator styling. Remove obsolete status strings from Localizable.strings.
```

---

## Task G — Home: My contracts, Support; tech: + My portfolio

| Layer | Role |
|--------|------|
| **iOS** | **Primary:** `HomeContainerView` / `ServiceProviderHomeView` quick access; trim Profile dupes. |
| **Frontend** | Layout parity. |
| **Backend** | *—* unless new deeplinks. |
| **AI Chatbot** | *—* |

**Prompt — iOS**

```text
Locate HomeContainerView (user) and ServiceProviderHomeView (technician). Add a compact "Quick access" section with: My contracts, Support center; for technician add My portfolio. Reuse existing navigation destinations from Profile where possible. Reduce duplication in ProfileView by removing the same rows or replacing with "See home". Match ThemeManager and RTL.
```

---

## Task H — Onboarding → **Knowledge library** (مكتبة المعرفة) + videos

| Layer | Role |
|--------|------|
| **iOS** | **Primary:** rename flow, AVKit, interactive sections, completion tracking. |
| **Backend** | CDN URLs / remote config for MP4s. |
| **AI Chatbot** | Link/help intents to library topics. |
| **Frontend** | Android/Web later. |

**Prompt — iOS**

```text
Refactor OnboardingView into a KnowledgeLibrary experience: navigation title and Arabic name "مكتبة المعرفة", English "Knowledge library". Three tabbed or paged sections with AVPlayer for MP4 URLs loaded from a local config struct (placeholder URLs). Add one interactive element per page (e.g. DisclosureGroup checklist or tap-to-reveal tips). Preserve hasSeenIntro / navigation into app. Update Localizable.strings EN/AR.
```

---

## Task I — Section titles & card styles (visual separation)

| Layer | Role |
|--------|------|
| **iOS** | **Primary:** `SectionHeaderStyle`, card rhythm, `ThemeManager`. |
| **Frontend** | Parity. |
| **Backend** | *—* |
| **AI Chatbot** | *—* |

**Prompt — iOS**

```text
Audit HomeView and primary list screens: unify section headers with a shared SectionHeaderStyle (title + subtitle + optional action). Increase vertical rhythm between cards; use cardBackground + 1pt stroke from ThemeManager. Avoid drive-by changes outside home/projects. Provide before/after screenshot list in PR description.
```

---

## Task J — Copy: `ملخص المشروع` → `وصف المشروع`

| Layer | Role |
|--------|------|
| **iOS** | **Primary:** grep AR keys + PerView. |
| **Frontend** | `strings.xml` / Web. |
| **Backend** | PDF/email if same string. |
| **AI Chatbot** | *—* |

**Prompt — iOS**

```text
Grep for ملخص المشروع and the localization key that maps to it; replace with وصف المشروع in ar.lproj, PerView Arabic bundles, and English equivalent if the key is shared ("Project description" vs "Summary"). List all keys touched.
```

---

## Task K — Phases label: `مراحل العمل والمخرجات`

| Layer | Role |
|--------|------|
| **iOS** | **Primary:** AI + manual creation strings. |
| **Backend** | PDFs/emails if duplicated. |
| **AI Chatbot** | *—* |

**Prompt — iOS**

```text
Find localized strings for project phases / milestones in AI project summary and ManualProjectForm; set Arabic to "مراحل العمل والمخرجات" and appropriate English ("Work phases & deliverables"). Update en.lproj/ar.lproj and any PhaseApproval strings.
```

---

## Task L — Construction AI: optional “consider also…” (animated)

| Layer | Role |
|--------|------|
| **iOS** | **Primary:** `OptionalConsiderationsCard`, SwiftUI animation. |
| **AI Chatbot** | Content for `optionalConstructionHints`. |
| **Backend** | *Optional:* return hints JSON. |

**Prompt — iOS**

```text
Where construction-specific UI exists in project creation or summary, add an OptionalConsiderationsCard: list from model optionalConstructionHints: [String], with "Optional" badge and subtle loop animation (opacity or scale) using SwiftUI animation. Data can be stubbed until backend returns hints.
```

---

## Task M — Project cards: thumbnail or Bonyad logo

| Layer | Role |
|--------|------|
| **iOS** | **Primary:** list cell image + fallback asset. |
| **Backend** | Serve attachment URLs. |
| **AI Chatbot** | *—* |

**Prompt — iOS**

```text
Find ProjectCard or equivalent list cell for projects. Use AsyncImage or SDWebImageSwiftUI for first attachment URL; on failure or nil, show BonyadLogo compact or Image(asset) placeholder. Preserve aspect fill and corner radius consistent with design system.
```

---

## Task N — Portfolio PDF: design + generation pipeline

| Layer | Role |
|--------|------|
| **Backend** | **Primary:** HTML→PDF or template engine; optional LLM for blurbs only. |
| **iOS** | Preview/download only. |
| **AI Chatbot** | *—* |
| **DB** | Store metadata/version if needed. |

**Prompt — Backend / design**

```text
Propose a portfolio PDF pipeline: (1) structured JSON from technician profile, (2) HTML template with brand CSS, (3) headless Chrome or server library to PDF, (4) optional LLM pass to rewrite project blurbs only (no hallucinated metrics). List risks and cost. iOS only downloads/displays PDF.
```

---

## Task O — Payments: bank transfer + proof + admin approval

| Layer | Role |
|--------|------|
| **Backend** | **Primary:** intents, proof upload, admin approve/reject, ledger. |
| **DB** | States, proof storage refs. |
| **iOS** | Instructions UI, upload, history. |
| **Frontend** | Parity. |
| **AI Chatbot** | *—* |

**Prompt — Backend**

```text
Design REST flows for offline bank transfer: create intent with unique reference, upload proof file to object storage, admin approve endpoint, idempotent completion posting to ledger/transactions. Include state diagram and sample payloads for iOS client.
```

**Prompt — iOS**

```text
Add a "Pay by transfer" path: display static bank details from remote config, reference code tied to userId+invoiceId, upload proof via multipart, poll or push for status. Ensure list view reads from existing transactions API extended with new statuses.
```

---

## Task P — Copy: `عمولة المنصة` → `رسوم المنصة`

| Layer | Role |
|--------|------|
| **iOS** | **Primary:** AR bundles + invoices strings. |
| **Frontend** | Android/Web. |
| **Backend** | Invoice/PDF templates. |
| **AI Chatbot** | *—* |

**Prompt — iOS**

```text
Grep عمولة المنصة and platform_fee related keys; replace display string with رسوم المنصة in Arabic bundles; verify English "Platform fee" still accurate. Include PDF/invoice strings if duplicated.
```

---

## Task Q — Technician “offline” / personal tracking project

| Layer | Role |
|--------|------|
| **Backend** | **Primary:** `external_agreement`, `owner_technician_id`, nullable `client_user_id`, permissions. |
| **DB** | **Primary:** flags + visibility rules. |
| **iOS** | “Track external job” flow; gated timeline (no customer chat). |
| **Frontend** | Later parity. |
| **AI Chatbot** | *—* |

**Prompt — Backend**

```text
Model a TechnicianPersonalProject entity extending or paralleling Project: no end-user account, technician_id owner, visibility private to technician, optional manual client name string. Specify API CRUD and how it appears in reporting separately from marketplace projects.
```

**Prompt — iOS**

```text
Add technician-only flow "Track external job": minimal form (title, notes, dates), saves as personal project type; reuse ProjectStatusTimelineView with gated features (no customer chat, no reviews). Gate with role check.
```

---

### Summary table A–Q (iOS · Frontend · AI Chatbot · Backend · DB)

| ID | Task | iOS | Frontend | AI Chatbot | Backend | DB |
|----|------|-----|----------|------------|---------|-----|
| A | Project writing tips | display | display | **yes** | prompts/CMS | opt |
| B | Scope & pricing | display | display | **yes** | disclaimers | — |
| C | 6-point pre-AI check | **yes** | later | opt | opt API | opt |
| D | + coachmark once | **yes** | parity | — | — | — |
| E | Cards / refunds | **yes** | parity | — | **yes** | **yes** |
| F | Tickets 3 states | **yes** | parity | — | **yes** | migrate |
| G | Home shortcuts | **yes** | parity | — | — | — |
| H | Knowledge library | **yes** | later | link | config/CDN | — |
| I | Section/card UI | **yes** | parity | — | — | — |
| J | وصف المشروع | **yes** | parity | — | maybe | — |
| K | مراحل العمل والمخرجات | **yes** | parity | — | maybe | — |
| L | Construction optional UI | **yes** | later | content | opt | — |
| M | Card thumbnails | **yes** | parity | — | URLs | — |
| N | Portfolio PDF | preview | — | — | **yes** | opt |
| O | Bank transfer + admin | **yes** | parity | — | **yes** | **yes** |
| P | رسوم المنصة | **yes** | parity | — | invoices | — |
| Q | Tech offline project | **yes** | later | — | **yes** | **yes** |

---

### Import-friendly checklist (A–Q)

- [ ] A — Assistant: project brief playbook (EN/AR)  
- [ ] B — Assistant: SOW + pricing intent with disclaimers  
- [ ] C — Pre-flight missing fields before AI generate  
- [ ] D — FAB coachmark once only  
- [ ] E — Tokenized cards + refunds + payouts  
- [ ] F — Support: open / in progress / closed + UI  
- [ ] G — Home shortcuts: contracts, support, portfolio  
- [ ] H — Knowledge library + video pages  
- [ ] I — Section & card visual separation  
- [ ] J — وصف المشروع string  
- [ ] K — مراحل العمل والمخرجات string  
- [ ] L — Construction optional animated hints  
- [ ] M — Project card image or logo fallback  
- [ ] N — Portfolio PDF pipeline upgrade  
- [ ] O — Bank transfer payment + proof + admin  
- [ ] P — رسوم المنصة  
- [ ] Q — Technician personal / external tracking project  

---

# Part 3 — Third-party dependencies (iOS / `bonyad-cr-2`)

Reference for **Frontend (iOS)** stack; Android/Web use their own manifests.

- `Firebase/Core`, `Firebase/Messaging`, `Firebase/Firestore`, `Firebase/Crashlytics`
- `GoogleMaps`, `GooglePlaces`
- `GoogleSignIn`
- `Mixpanel-swift`
- `CocoaMQTT` (MQTT chat)
- `SDWebImage`
- `SwiftJWT` (Swift Package Manager)
- `OPPWAMobile.xcframework` (HyperPay, local)

---

## Cross-reference

- Deeper **iOS** architecture, widgets, and original P1–P8 context: [`BONYAD_HOME_SERVICES_IOS.md`](./BONYAD_HOME_SERVICES_IOS.md)  
- **Bonyad web briefs** (Excel, AI import, issues): dashboard `/bonyad` in this repo  

---

*Last updated: consolidated 5/4 request batch — align tickets with platform columns above.*
