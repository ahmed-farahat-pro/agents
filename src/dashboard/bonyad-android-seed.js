/**
 * Seed issues for Bonyad Android fix brief (11 items).
 * Prompts are structured dev briefs (plain text); expand via Bonyad UI if needed.
 */
module.exports = [
  {
    sort_order: 1,
    title: 'App Not Fully Translated — Integrate Google Cloud Translation API',
    priority: 'high',
    tags: ['Localization', 'Google Cloud', 'Logging'],
    criteria: [
      'All hardcoded strings moved to translatable resources or the API',
      'Google Cloud Translation API integrated with stored API key',
      'Logcat logs show every translation call with source, target, and result',
      'Switching language translates 100% of visible text on all screens',
    ],
    prompt: `TASK: Fix incomplete app translation using Google Cloud Translation API.

CONTEXT: Some strings stay in the original language when the user switches language. Dynamic and static copy must be covered.

REQUIREMENTS:
1. Audit all screens and UI for hardcoded strings outside the translation layer.
2. Integrate Google Cloud Translation API for dynamic/server text; API key only from project secrets/config — never hardcoded.
3. Detailed logging for every translation call: source/target languages, input key/text, result; failures with full error and graceful fallback to original text. Use Logcat tag TranslationLog.
4. Complete res/values/strings.xml and all locale variants.
5. Test the full app in every supported language; no untranslated visible strings.

ACCEPTANCE: Switching language translates ALL visible text. Logs confirm each call with source/target/result.`,
  },
  {
    sort_order: 2,
    title: 'Language Flip Causes Full App Reload to Home Screen',
    priority: 'high',
    tags: ['Navigation', 'Language Toggle', 'UX'],
    criteria: [
      'Language toggle does not reload or recreate the whole app',
      'User remains on the same screen after switching language',
      'All text on the current screen updates immediately',
      'Back stack preserved — back navigation works correctly',
    ],
    prompt: `TASK: Fix language toggle so it does NOT reload the app or jump to home.

BUG: Changing language triggers full reload and sends user to home; context is lost.

EXPECTED: In-place locale update on the current screen; same back stack; no Activity recreate that resets navigation.

TECH: Remove inappropriate recreate() / intent flags on language change. Prefer ViewModel + StateFlow/LiveData or CompositionLocalProvider (Compose) to rebind text without recreate(). For Views, rebind resources after context locale update without recreate().

ACCEPTANCE: Toggle language on any deep screen → text updates in place → user stays put → back stack intact.`,
  },
  {
    sort_order: 3,
    title: 'Circular Animation on "+" Button Goes Out of Bounds',
    priority: 'high',
    tags: ['Animation', 'UI / Layout'],
    criteria: [
      'Animation fully clipped within the button bounds',
      'No overflow onto adjacent UI or the nav bar',
      'Polished on multiple screen sizes',
    ],
    prompt: `TASK: Constrain the "+" (create project) circular animation inside its container.

BUG: Animation draws outside the button and overlaps adjacent UI.

FIX: clipToPadding/clipChildren on parents; Compose: Modifier.clip(CircleShape) or clipToBounds; View: android:clipChildren="true" and radius within bounds. Test multiple screen sizes.

ACCEPTANCE: Tap "+" — animation stays fully inside the button on all tested devices.`,
  },
  {
    sort_order: 4,
    title: 'Dark Mode Is Broken — Full App Audit Required',
    priority: 'high',
    tags: ['Dark Mode', 'Theme', 'Full Audit'],
    criteria: [
      'Hardcoded colors replaced with theme/Material tokens',
      'res/values-night/ covers custom colors',
      'Every screen, dialog, bottom sheet, WebView verified in dark mode',
    ],
    prompt: `TASK: Full dark mode audit and fix across the app.

BUG: Wrong colors, white flashes, unreadable text, hardcoded #FFFFFF / Color.WHITE / non-theme attrs.

FIX: Walk every screen in dark mode. Replace hardcoded colors with ?attr/* or MaterialTheme.colorScheme. Add values-night resources. Fix custom views, dialogs, WebViews, tinted icons.

ACCEPTANCE: Entire app readable and on-brand in dark mode; no bypassing theme tokens.`,
  },
  {
    sort_order: 5,
    title: 'Service Icons (SVGs) Not Displaying on Home Screen',
    priority: 'high',
    tags: ['Icons', 'SVG', 'Home Screen'],
    criteria: [
      'All service SVGs render on Home',
      'Library supports SVG (Coil+SVG, AndroidSVG, VectorDrawable, etc.)',
      'Correct in light and dark mode',
      'No empty placeholders',
    ],
    prompt: `TASK: Fix Home screen service SVG icons showing blank.

VERIFY: Source of assets (drawable/assets/URL). Valid SVG files. Correct decoder (Coil SVG, Glide SVG, VectorDrawable). Network logging if remote. Compose: appropriate ImageLoader.

Do not replace with PNG unless unavoidable — prefer fixing SVG pipeline.

ACCEPTANCE: All service icons visible on Home in light and dark mode.`,
  },
  {
    sort_order: 6,
    title: 'Back Button After Service Selection Goes to Old Design Screen',
    priority: 'medium',
    tags: ['Navigation', 'Back Stack', 'Project Creation'],
    criteria: [
      'Back from Project Creation never shows deprecated "Project vs Small Project" screen',
      'Stack is Home → Service Selection → Project Creation (clean)',
      'Old screen removed from active graph if obsolete',
    ],
    prompt: `TASK: Fix back navigation after service selection in project creation flow.

BUG: From Project Creation, Back lands on deprecated intermediate screen (Project vs Small Project).

FIX: Trace Nav graph / Fragment back stack. Use popUpTo, inclusive flags, or replace deprecated destinations so Back returns to Service Selection or Home only.

ACCEPTANCE: Back never surfaces the old screen.`,
  },
  {
    sort_order: 7,
    title: 'Back Arrow Direction Not Respecting App Language (RTL/LTR)',
    priority: 'medium',
    tags: ['RTL Support', 'Localization', 'Navigation'],
    criteria: [
      'Single reusable back control used app-wide',
      'Auto-mirrors for RTL (e.g. autoMirrored drawables, Icons.AutoMirrored)',
      'Tested in Arabic (or other RTL) and LTR',
    ],
    prompt: `TASK: Globally correct back-arrow direction for RTL vs LTR.

BUG: Back arrows wrong direction in RTL.

FIX: One reusable component; use platform layout direction; XML autoMirrored="true"; Compose scale or AutoMirrored icons; Toolbar home-as-up where appropriate.

ACCEPTANCE: All back arrows correct in both directions.`,
  },
  {
    sort_order: 8,
    title: 'Info Icon Does Nothing — Must Launch In-App Guided Tour',
    priority: 'medium',
    tags: ['UX', 'Onboarding', 'Info Icon'],
    criteria: [
      'Info opens multi-step spotlight tour',
      'Dismissible / Skip anytime',
      'Tour strings go through translation layer',
      'Info always re-opens tour',
    ],
    prompt: `TASK: Wire Info icon to a step-by-step guided tour (spotlight + tooltips).

COVER: Home overview, "+", services, search, chatbot, language toggle (adjust to real IA).

Use TapTarget/Showcase or custom overlay. Persist "seen" optional but Info must always restart tour. All copy translatable.

ACCEPTANCE: Info launches tour; dismissible; translated strings.`,
  },
  {
    sort_order: 9,
    title: 'Chatbot Icon — Remove Arrow Above Head, Match iOS Design',
    priority: 'low',
    tags: ['Chatbot', 'Icon Design', 'iOS Parity'],
    criteria: [
      'Arrow above head removed',
      'Visual parity with iOS chatbot asset',
      'Light/dark and multiple sizes OK',
    ],
    prompt: `TASK: Update Android chatbot floating icon — remove arrow above head; match iOS.

EDIT VectorDrawable/SVG or replace asset. Verify silhouette, colors, proportions vs iOS reference.

ACCEPTANCE: No arrow; matches iOS design intent.`,
  },
  {
    sort_order: 10,
    title: 'Search Bar Inner Text Field Is White on White Background',
    priority: 'medium',
    tags: ['Search Bar', 'UI / Colors', 'Theming'],
    criteria: [
      'Inner field visually distinct from bar container',
      'Text, hint, cursor readable in light and dark',
      'Theme attributes — no hardcoded white-on-white',
    ],
    prompt: `TASK: Fix search inner field contrast (white on white).

USE theme tokens for field vs container backgrounds; readable hint and cursor; verify dark mode.

ACCEPTANCE: Input area clearly visible in both themes.`,
  },
  {
    sort_order: 11,
    title: 'Search Functionality Is Broken — Restore to Working State',
    priority: 'low',
    tags: ['Search', 'Regression', 'Core Feature'],
    criteria: [
      'Queries return correct results',
      'Clearing search restores full list',
      'Regression root cause fixed',
      'Light logging: query + result count',
    ],
    prompt: `TASK: Fix search regression (no/wrong/silent failures).

CHECK: data source, query wiring, filters, ViewModel/UI binding, recent refactors. Restore prior behavior. Add logs for query and result count.

ACCEPTANCE: Search works; clear restores list; logs aid debugging.`,
  },
];
