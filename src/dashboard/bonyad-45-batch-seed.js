/**
 * Bonyad sheet `4-5`: change-request batch (P1–P8 + A–Q).
 * Seeded into MySQL on dashboard init when the sheet has zero issues.
 * UI: /bonyad/sheet.html?slug=4-5 — status via Open / In progress / Done (sheet_status + is_done).
 */

const SHEET = {
  slug: '4-5',
  label: 'Bonyad',
  platform_line: '4/5 requests — iOS · Frontend · AI Chatbot · Backend · DB',
  brief_title: 'Bonyad — 4/5 change requests (P1–P8 + roadmap A–Q)',
  brief_subtitle:
    'Use Open → In progress → Done on each card. Expand for full developer/AI prompts. Add or delete issues with the edit key.',
  meta_date: 'May 2026',
  meta_to: 'Engineering',
  meta_from: 'Product',
  status_label: 'Tracking',
  sort_order: 5,
};

/** @type {Array<{sort_order:number,title:string,priority:'high'|'medium'|'low',tags:string[],criteria:string[],prompt:string}>} */
const ISSUES = [
  {
    sort_order: 1,
    title: '45-P1 — Project attachments: photos + files (manual + AI)',
    priority: 'high',
    tags: ['45-P1', 'iOS', 'Android', 'Web', 'Backend', 'DB', 'Epic: Create project'],
    criteria: [
      'Backend accepts multipart or signed URLs; validate type/size; link to project_id',
      'DB: project_attachments (or equivalent) with source manual|ai',
      'iOS: ManualProjectForm + AI flows — UIDocumentPicker, list/remove, errors; keep photos',
      'Android/Web parity',
      'QA: large files, permissions, offline, RTL',
    ],
    prompt: `In the Bonyad iOS app (SwiftUI), add non-photo file attachments to project creation for both ManualProjectForm and the AI project flows (AIProjectForm / summary submit path). Use UIDocumentPicker (or PHPicker for images only where appropriate) to let users pick PDFs and common document types. Reuse BaseURLManager and existing multipart patterns if any; otherwise add an upload service that POSTs files to the backend project attachment endpoint (define a plausible path and Request models). Show selected files in a list with remove; disable submit until uploads succeed or queue with project create. Match ThemeManager and existing ManualProjectForm photo UX. Do not remove existing photo support.

Backend/DB: extend create/update project APIs; store metadata; Android/Web mirror.`,
  },
  {
    sort_order: 2,
    title: '45-P2 — Home quick services: max 6 + Arabic copy',
    priority: 'medium',
    tags: ['45-P2', 'iOS', 'Android', 'Web', 'Backend?', 'Epic: Home'],
    criteria: [
      'Quick services row shows exactly 6 curated items (IDs from constant or config API)',
      'AR: quick_services → "الخدمات الرئيسية"; small task section → "المهام البسيطة"',
      'en.lproj sensible English; PerView AR mirrored',
      'Optional: GET /config/home-quick-services for CMS-driven IDs',
      'Verify RTL on home',
    ],
    prompt: `In bonyad-cr-2 iOS project, find where HomeView (or equivalent) loads quick services / small tasks horizontal lists. Cap the quick services carousel to exactly 6 items from a constant array of category IDs or slugs (placeholder IDs with a TODO). Update Arabic localization: change key quick_services to "الخدمات الرئيسية" and small_task_types to "المهام البسيطة" in ar.lproj and mirrored PerView Arabic files; add sensible English strings in en.lproj. Do not change unrelated screens.

Mirror cap + strings on Android/Web.`,
  },
  {
    sort_order: 3,
    title: '45-P3 — Tab bar: label under every tab',
    priority: 'medium',
    tags: ['45-P3', 'iOS', 'Android', 'Epic: Navigation'],
    criteria: [
      'Every tab shows icon + title in selected and unselected states',
      'Selection uses color/weight/opacity — never hide the label',
      'Android: BottomNavigationView LABEL_VISIBILITY_LABELED or custom parity',
      'RTL safe; QA smallest device',
    ],
    prompt: `Find the main user tab bar implementation in the iOS app (SwiftUI). Ensure the title/label string appears under every tab item for both selected and unselected states; use opacity or color to distinguish selection instead of hiding the label. Keep RTL safe. List files changed.`,
  },
  {
    sort_order: 4,
    title: '45-P4 — My projects: small tasks (user + technician)',
    priority: 'high',
    tags: ['45-P4', 'iOS', 'Android', 'Web', 'Backend?', 'Epic: Projects'],
    criteria: [
      'User ProjectsListView (or equivalent) has visible path to small tasks',
      'Technician project/home list has same class of entry',
      'Uses localization e.g. small_tasks / my_small_tasks',
      'Backend list APIs support "mine" for both roles if needed',
    ],
    prompt: `On iOS Bonyad app, locate the user's "My projects" screen and the technician's projects/home list. Add a visible "Small tasks" access point (e.g. horizontal bar, segmented control, or tappable row) that navigates to the existing small tasks list or creation flow. Use existing localization keys like small_tasks or my_small_tasks. Respect technician vs user navigation stacks.`,
  },
  {
    sort_order: 5,
    title: '45-P5 — Disable booking system (temporary)',
    priority: 'high',
    tags: ['45-P5', 'iOS', 'Android', 'Web', 'Backend', 'Epic: Booking'],
    criteria: [
      'Feature flag bookings_enabled=false (or equivalent) on backend; empty/404 booking endpoints',
      'No calendar/booking CTAs or tabs in clients; hide needs_booking flows',
      'Push templates that assume booking disabled',
      'Prefer hiding over deleting models still referenced by payloads',
    ],
    prompt: `Search the iOS codebase for user-facing booking features: calendar tab, booking confirmation, needs_booking toggles, and appointment scheduling UI. Behind a single Swift feature flag defaulting to false (or remove entry points), hide navigation to booking and disable booking-related buttons. Do not delete models if still used by project payloads; prefer hiding. Summarize all entry points touched.

Repeat for Android/Web; backend flag + guards.`,
  },
  {
    sort_order: 6,
    title: '45-P6 — User tab: Calendar → Small tasks',
    priority: 'high',
    tags: ['45-P6', 'iOS', 'Android', 'Web', 'Epic: Navigation'],
    criteria: [
      'End-user tab bar: Small tasks tab opens primary small tasks screen',
      'Localized titles + accessibility labels updated',
      'Deep links to old calendar updated if any',
      'Technician tab bar unchanged unless shared code forces split',
    ],
    prompt: `In the iOS app main tab bar for end users, replace the Calendar tab with a Small Tasks tab that opens the primary small tasks screen (reuse existing view). Remove or repurpose the calendar tab. Update tab accessibility labels and localized titles. Ensure technician tab bar unchanged unless shared code requires a split.`,
  },
  {
    sort_order: 7,
    title: '45-P7 — Arabic Beta: نسخة تجريبية',
    priority: 'low',
    tags: ['45-P7', 'iOS', 'Android', 'Web', 'Epic: L10n'],
    criteria: [
      'Grep beta / بيتا; update key beta to "نسخة تجريبية" in ar bundles + PerView',
      'English may stay "Beta"',
    ],
    prompt: `Find all Arabic localizations for the beta label (key "beta" and any hardcoded بيتا). Set the Arabic value to "نسخة تجريبية" in ar.lproj and Localizations/PerView Arabic files. Do not change unrelated keys.`,
  },
  {
    sort_order: 8,
    title: '45-P8 — Tutorial: kitchen → room on roof',
    priority: 'low',
    tags: ['45-P8', 'iOS', 'Android', 'Web', 'AI Chatbot', 'Backend?', 'Epic: Onboarding'],
    criteria: [
      'Replace kitchen renovation examples with roof-room EN/AR',
      'EN e.g. "Building a room on the roof"; AR "بناء غرفة على السطح"',
      'Tutorials, AIProjectForm, CMS/API defaults aligned',
    ],
    prompt: `Search the iOS project for user-visible example text that describes a kitchen renovation (English or Arabic) in tutorials, AI prompts, or onboarding. Replace with an example about building a room on the roof: English short phrase + Arabic "بناء غرفة على السطح" where appropriate. Update Localizable.strings and any Swift string constants. List every key changed.`,
  },
  {
    sort_order: 9,
    title: '45-A — Chatbot: project brief playbook (EN/AR)',
    priority: 'medium',
    tags: ['45-A', 'AI Chatbot', 'Backend', 'iOS', 'Epic: Assistant'],
    criteria: [
      'System prompt + 6–8 templates: scope, location, timeline, budget, materials, access, safety, bad briefs',
      'Roof-room example brief in EN and AR',
      'Optional JSON/RAG playbook endpoint; ChatbotView shows long formatted replies',
    ],
    prompt: `You are improving the Bonyad in-app assistant (Arabic + English). Design a system prompt and 6–8 user-facing response templates that teach users how to describe a home-service / construction project clearly. Cover: scope, location, timeline, budget expectations, materials, access, safety, and what makes a bad brief. Include one short example brief for "building a room on the roof" in EN and AR. Output: (1) system prompt text, (2) template list with trigger intents, (3) suggested API shape if content is loaded from backend JSON.`,
  },
  {
    sort_order: 10,
    title: '45-B — Chatbot: SOW + pricing guidance (disclaimers)',
    priority: 'medium',
    tags: ['45-B', 'AI Chatbot', 'Backend', 'iOS', 'Epic: Assistant'],
    criteria: [
      'Intent scope_and_pricing_advice: SOW structure, milestones, GCC cost drivers',
      'Never binding quotes; official quotes from platform providers',
      'Bilingual short/long variants; refusal for illegal/unsafe',
    ],
    prompt: `Extend the Bonyad assistant with a dedicated intent: "scope_and_pricing_advice". The bot should explain SOW structure (deliverables, exclusions, assumptions), phased milestones, and how Saudi / GCC home projects often estimate cost drivers. Always state that figures are indicative and official quotes come from providers on the platform. Provide bilingual (EN/AR) short and long reply variants. Include refusal path for illegal or unsafe requests.`,
  },
  {
    sort_order: 11,
    title: '45-C — Pre-flight: 6 pillars before AI generate',
    priority: 'medium',
    tags: ['45-C', 'iOS', 'AI Chatbot', 'Backend?', 'Epic: Create project'],
    criteria: [
      'ProjectDraftCompleteness (or equivalent) for 6 pillars before generate',
      'SwiftUI alert/sheet: missing list; Continue anyway / Go back',
      'Optional POST /api/v1/project-drafts/validate rule-based',
      'Unit tests for evaluator',
    ],
    prompt: `In the Bonyad iOS app, implement a pre-submit completeness check before calling AI project generation (AIProjectForm and/or ConversationalAIForm). Product defines 6 required "pillars" (placeholder enum: description, location, budget, duration, attachments, constraints). Evaluate filled state from current form state; present a SwiftUI alert or sheet listing missing pillars in Arabic/English using Localizable.strings; primary button "Continue anyway", secondary "Go back and add". Wire primary to existing generate flow. Add unit tests for the evaluator struct.

Backend (optional): Design POST /api/v1/project-drafts/validate returning JSON { complete: bool, missingKeys: string[], suggestions: localized string[] } for a partial ProjectRequest. No LLM required in v1—rule-based. Document OpenAPI snippet.`,
  },
  {
    sort_order: 12,
    title: '45-D — FAB "+" coachmark: once per install',
    priority: 'medium',
    tags: ['45-D', 'iOS', 'Android', 'Web', 'Epic: Onboarding'],
    criteria: [
      'UserDefaults/AppStorage e.g. hasSeenFABCreateHint',
      'Show only until dismiss; never on cold start after',
      'Document interaction with demo/QA flags',
    ],
    prompt: `Find the demo overlay or coachmark that explains tapping the + button to create a project (search DemoHighlight, coachmark, onboarding overlay). Gate it with a single UserDefaults key hasSeenFABCreateHint default false; set true when user dismisses or completes the hint. Ensure it never shows again on subsequent cold starts. Do not break demo mode for QA if a separate flag exists—document behavior.`,
  },
  {
    sort_order: 13,
    title: '45-E — Saved cards, pay, refunds, technician payouts',
    priority: 'high',
    tags: ['45-E', 'iOS', 'Android', 'Web', 'Backend', 'DB', 'Epic: Payments'],
    criteria: [
      'PSP tokenization only; payment_methods, transactions, refunds, payout batches',
      'Webhooks; idempotency; MADA/Saudi constraints at high level',
      'iOS: HyperPay patterns — manage cards, pay with token, payout status',
    ],
    prompt: `Outline a PCI-aligned card vault design using tokenization only. Specify tables payment_method, charge, refund, payout with statuses. Include idempotency keys and webhook handlers. Note Saudi/MADA constraints at high level.

iOS: Audit HyperPay usage in the Bonyad iOS app; propose UI flows for (1) user adding a default card, (2) paying with saved token, (3) technician viewing payout status. List files to touch and Apple Pay vs card decision.`,
  },
  {
    sort_order: 14,
    title: '45-F — Support tickets: 3 states + UI',
    priority: 'medium',
    tags: ['45-F', 'iOS', 'Android', 'Web', 'Backend', 'DB', 'Epic: Support'],
    criteria: [
      'Statuses only open | in_progress | closed; migrate legacy',
      'iOS list/detail: badges, relative time, a11y',
      'Remove obsolete Localizable strings',
    ],
    prompt: `Normalize support ticket status to three values: OPEN, IN_PROGRESS, CLOSED. Provide SQL migration sketch and Spring enum change. On iOS, find support/ticket list UI and redesign cells with clear status badge, relative time, and separator styling. Remove obsolete status strings from Localizable.strings.`,
  },
  {
    sort_order: 15,
    title: '45-G — Home: contracts, support; tech: portfolio',
    priority: 'medium',
    tags: ['45-G', 'iOS', 'Android', 'Web', 'Epic: Home'],
    criteria: [
      'User home: My contracts, Support center shortcuts',
      'Technician home: + My portfolio',
      'Reduce duplicate rows in Profile',
    ],
    prompt: `Locate HomeContainerView (user) and ServiceProviderHomeView (technician). Add a compact "Quick access" section with: My contracts, Support center; for technician add My portfolio. Reuse existing navigation destinations from Profile where possible. Reduce duplication in ProfileView by removing the same rows or replacing with "See home". Match ThemeManager and RTL.`,
  },
  {
    sort_order: 16,
    title: '45-H — Knowledge library (مكتبة المعرفة) + videos',
    priority: 'medium',
    tags: ['45-H', 'iOS', 'Backend', 'AI Chatbot', 'Epic: Onboarding'],
    criteria: [
      'Rename onboarding flow; EN "Knowledge library" / AR مكتبة المعرفة',
      'Three sections with AVPlayer remote URLs from config',
      'Interactive element per page; chapter completion tracking',
    ],
    prompt: `Refactor OnboardingView into a KnowledgeLibrary experience: navigation title and Arabic name "مكتبة المعرفة", English "Knowledge library". Three tabbed or paged sections with AVPlayer for MP4 URLs loaded from a local config struct (placeholder URLs). Add one interactive element per page (e.g. DisclosureGroup checklist or tap-to-reveal tips). Preserve hasSeenIntro / navigation into app. Update Localizable.strings EN/AR.`,
  },
  {
    sort_order: 17,
    title: '45-I — Section headers + card visual hierarchy',
    priority: 'low',
    tags: ['45-I', 'iOS', 'Android', 'Web', 'Epic: UI polish'],
    criteria: [
      'Shared SectionHeaderStyle (title, subtitle, action)',
      'Card rhythm; ThemeManager cardBackground + 1pt stroke',
      'Scope primarily home/projects',
    ],
    prompt: `Audit HomeView and primary list screens: unify section headers with a shared SectionHeaderStyle (title + subtitle + optional action). Increase vertical rhythm between cards; use cardBackground + 1pt stroke from ThemeManager. Avoid drive-by changes outside home/projects. Provide before/after screenshot list in PR description.`,
  },
  {
    sort_order: 18,
    title: '45-J — Copy: وصف المشروع (was ملخص المشروع)',
    priority: 'low',
    tags: ['45-J', 'iOS', 'Android', 'Web', 'Backend?', 'Epic: L10n'],
    criteria: [
      'Grep ملخص المشروع and shared keys',
      'AR + EN if shared; PerView; PDF/email if duplicated',
    ],
    prompt: `Grep for ملخص المشروع and the localization key that maps to it; replace with وصف المشروع in ar.lproj, PerView Arabic bundles, and English equivalent if the key is shared ("Project description" vs "Summary"). List all keys touched.`,
  },
  {
    sort_order: 19,
    title: '45-K — Phases: مراحل العمل والمخرجات',
    priority: 'low',
    tags: ['45-K', 'iOS', 'Android', 'Web', 'Backend?', 'Epic: Create project'],
    criteria: [
      'Unified string AI + manual project creation',
      'EN e.g. "Work phases & deliverables"; fix typos vs المخرحات',
    ],
    prompt: `Find localized strings for project phases / milestones in AI project summary and ManualProjectForm; set Arabic to "مراحل العمل والمخرجات" and appropriate English ("Work phases & deliverables"). Update en.lproj/ar.lproj and any PhaseApproval strings.`,
  },
  {
    sort_order: 20,
    title: '45-L — Construction: optional considerations (animated)',
    priority: 'low',
    tags: ['45-L', 'iOS', 'AI Chatbot', 'Backend?', 'Epic: Create project'],
    criteria: [
      'OptionalConsiderationsCard from optionalConstructionHints: [String]',
      'Optional badge; subtle SwiftUI loop animation',
      'Non-blocking submit',
    ],
    prompt: `Where construction-specific UI exists in project creation or summary, add an OptionalConsiderationsCard: list from model optionalConstructionHints: [String], with "Optional" badge and subtle loop animation (opacity or scale) using SwiftUI animation. Data can be stubbed until backend returns hints.`,
  },
  {
    sort_order: 21,
    title: '45-M — Project cards: image or Bonyad logo',
    priority: 'medium',
    tags: ['45-M', 'iOS', 'Android', 'Web', 'Epic: Projects'],
    criteria: [
      'First attachment thumb via AsyncImage / SDWebImageSwiftUI',
      'Nil/failure → Bonyad logo placeholder',
      'Aspect fill + corner radius per design system',
    ],
    prompt: `Find ProjectCard or equivalent list cell for projects. Use AsyncImage or SDWebImageSwiftUI for first attachment URL; on failure or nil, show BonyadLogo compact or Image(asset) placeholder. Preserve aspect fill and corner radius consistent with design system.`,
  },
  {
    sort_order: 22,
    title: '45-N — Portfolio PDF pipeline (quality)',
    priority: 'medium',
    tags: ['45-N', 'Backend', 'iOS', 'Epic: Portfolio'],
    criteria: [
      'Structured JSON → HTML template → server PDF',
      'Optional LLM for blurbs only; iOS preview/download',
    ],
    prompt: `Propose a portfolio PDF pipeline: (1) structured JSON from technician profile, (2) HTML template with brand CSS, (3) headless Chrome or server library to PDF, (4) optional LLM pass to rewrite project blurbs only (no hallucinated metrics). List risks and cost. iOS only downloads/displays PDF.`,
  },
  {
    sort_order: 23,
    title: '45-O — Bank transfer + proof + admin approval',
    priority: 'high',
    tags: ['45-O', 'iOS', 'Android', 'Web', 'Backend', 'DB', 'Epic: Payments'],
    criteria: [
      'States PENDING_PROOF → PENDING_ADMIN → COMPLETED/REJECTED',
      'User uploads proof; admin dashboard approve/reject',
      'Transactions ledger append correctly',
    ],
    prompt: `Design REST flows for offline bank transfer: create intent with unique reference, upload proof file to object storage, admin approve endpoint, idempotent completion posting to ledger/transactions. Include state diagram and sample payloads for iOS client.

iOS: Add a "Pay by transfer" path: display static bank details from remote config, reference code tied to userId+invoiceId, upload proof via multipart, poll or push for status. Ensure list view reads from existing transactions API extended with new statuses.`,
  },
  {
    sort_order: 24,
    title: '45-P — Copy: رسوم المنصة (was عمولة المنصة)',
    priority: 'low',
    tags: ['45-P', 'iOS', 'Android', 'Web', 'Backend', 'Epic: L10n'],
    criteria: [
      'Grep عمولة المنصة and platform_fee keys',
      'AR رسوم المنصة; EN "Platform fee" if still accurate',
      'Invoice/PDF strings',
    ],
    prompt: `Grep عمولة المنصة and platform_fee related keys; replace display string with رسوم المنصة in Arabic bundles; verify English "Platform fee" still accurate. Include PDF/invoice strings if duplicated.`,
  },
  {
    sort_order: 25,
    title: '45-Q — Technician offline / personal project',
    priority: 'high',
    tags: ['45-Q', 'iOS', 'Backend', 'DB', 'Epic: Projects'],
    criteria: [
      'external_agreement, owner_technician_id, nullable client_user_id',
      'Private to technician; reporting separate from marketplace',
      'iOS: minimal form; timeline without customer chat/reviews',
    ],
    prompt: `Model a TechnicianPersonalProject entity extending or paralleling Project: no end-user account, technician_id owner, visibility private to technician, optional manual client name string. Specify API CRUD and how it appears in reporting separately from marketplace projects.

iOS: Add technician-only flow "Track external job": minimal form (title, notes, dates), saves as personal project type; reuse ProjectStatusTimelineView with gated features (no customer chat, no reviews). Gate with role check.`,
  },
];

module.exports = { SHEET, ISSUES };
