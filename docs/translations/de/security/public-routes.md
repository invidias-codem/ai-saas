# Öffentliche Routen

## Zweck

Dieses Dokument erklärt, welche Genie AI Routes öffentlich zugänglich sein sollen, welche geschützt sind, und wie die Public-Route-Enforcement aktuell funktioniert.

Es existiert, um eine wiederkehrende Klasse von Production-Bugs zu verhindern:
- öffentliche Pages linken unabsichtlich in auth-gated Surfaces
- ansonsten öffentliche Routes werden blockiert weil Middleware/Proxy Allowlists nicht aktualisiert wurden
- Verwirrung zwischen UI-Level-Visibility und tatsächlicher Route-Accessibility

Dieses Dokument sollte als aktuelle Route-Visibility-Referenz für die Application behandelt werden.

---

## Kernprinzip

Eine Route ist nur wirklich öffentlich, wenn das server-seitige Auth-Gate sie als öffentlich behandelt.

In Genie AI bedeutet das, dass öffentlicher Access nicht nur bestimmt wird durch:
- ob ein Link auf einer Landing Page erscheint
- ob eine Page visuell "marketing-like" ist
- ob die Route sich öffentlich anfühlt by Convention

Sie muss auch explizit erlaubt sein durch die Route-Matching-Logik in der Auth Middleware/Proxy Layer.

---

## Aktuelle Enforcement Layer

### Route-Gating Mechanism
Public vs Protected Route Verhalten wird primär kontrolliert in:
- `proxy.ts`

Diese Datei enthält den `isPublicRoute` Matcher, genutzt neben Clerk Auth Enforcement.

### Wichtige Implikation
Immer wenn eine neue öffentliche Route hinzugefügt wird, oder ein öffentlicher Route-Subtree sich ändert, muss die Route in **beiden** Orten gereviewt werden:
1. Application Routing/UI
2. Proxy Auth Allowlist

Wenn nur die UI aktualisiert wird, können öffentliche User trotzdem zu Sign-In redirected werden.

---

## Public Route Categories

Die Application hat aktuell mehrere Route-Typen die als öffentlich betrachtet werden sollten.

## 1. Public Landing / Marketing Routes

Diese sind öffentliche Entry Surfaces für unauthenticated Visitors.

### Examples
- `/`
- `/:locale`

### Purpose
- Product Discovery
- Positioning
- Conversion in Sign-Up oder Product Entry

---

## 2. Public Auth Entry Routes

Diese sind öffentlich zugänglich weil sie Teil des Authentication Entry Flow sind.

### Examples
- `/sign-in(.*)`
- `/sign-up(.*)`
- `/:locale/sign-in(.*)`
- `/:locale/sign-up(.*)`

### Purpose
- User Authentication
- User Onboarding Entry

---

## 3. Public Informational Routes

Diese sollen ohne Authentifizierung zugänglich bleiben weil sie Support, Policy, oder Educational Content bereitstellen.

### Current Examples
- `/privacy`
- `/:locale/privacy`
- `/support`
- `/:locale/support`
- `/slack`
- `/:locale/slack`
- `/blog(.*)`
- `/:locale/blog(.*)`
- `/docs`
- `/:locale/docs`
- `/docs/(.*)`
- `/:locale/docs/(.*)`

### Purpose
- Helfen Users die Platform zu verstehen
- Provide Public Support und Policy Information
- Expose Documentation ohne Sign-In zu forcen

---

## 4. Public API / Callback Surfaces

Einige API Routes müssen öffentlich bleiben weil sie Integration oder Webhook Entry Points sind.

### Current Examples
- `/api/guest-chat`
- `/api/feedback`
- `/api/integrations/slack/callback`
- `/api/integrations/slack/events`
- `/api/integrations/slack/command`
- `/api/integrations/slack/interactivity`
- `/api/integrations/slack/auth`
- `/api/webhooks/kofi`
- `/api/support/verify-donation`
- `/api/integrations/telegram/webhook`
- `/api/internal/jklaw`
- `/api/internal/route-to-jklaw`
- `/api/referral/capture`
- `/api/cron(.*)`
- `/api/test-mcts`
- `/api/webhooks/vercel-logs`

### Explicit Exclusions
Die folgenden sind **nicht** public trotz Client-Side Entry Points oder Non-Browser Consumers:
- `/api/cli/stream`
- `/api/memory/cli`

Diese Routes erfordern Bearer-Token Auth wenn `LATTICE_CLI_TOKEN` konfiguriert ist. Sie dürfen nicht als Public in Proxy Allowlists oder Route Ops behandelt werden.

### Important Note
Public API Surface bedeutet **nicht** Low-Risk Surface.
Viele dieser Routes sind öffentlich weil sie externen Traffic akzeptieren müssen, aber sie brauchen trotzdem:
- Validation
- Auth Verification wo applicable
- Signature/Token Checks wo appropriate
- Narrow Purpose-Specific Behavior

---

## Protected Route Categories

Die folgenden breiten Route-Klassen sollten als Protected behandelt werden, außer explizit anders dokumentiert.

## 1. Authenticated Product Routes

### Examples
- Dashboard Routes
- Conversation Routes
- Workspace Routes
- Settings
- Authenticated Generation Tools
- User-Specific Onboarding/Product State Surfaces

### Purpose
- Expose Actual Product Functionality
- Operate auf User State
- Access Protected Application Data

---

## 2. Protected API Routes

Jede API Route nicht explizit allowlisted als Public sollte als Protected assumed werden.

### Typical Examples
- Chat Execution Routes
- User-Specific Data Routes
- Workspace Management Routes
- Profile/Configuration Routes
- Internal Product Actions requiring User Identity

---

## Route Visibility and Locale Prefixes

Die Application nutzt Localized Routing.

### Important Implication
Public Route Treatment muss beide berücksichtigen:
- Unprefixed Route Forms
- Locale-Prefixed Route Forms

### Example
Wenn `/docs` public sein soll, dann sollten alle relevanten Public Forms betrachtet werden:
- `/docs`
- `/:locale/docs`
- `/docs/(.*)`
- `/:locale/docs/(.*)`

Das ist besonders wichtig für nested Docs/Blog/Support Trees.

---

## Known Failure Mode: Public UI Linking Into Protected Route

Ein häufiges Regression Pattern ist:
1. eine Public Landing/Support Page linkt zu einer Route wie `/docs`
2. die Route existiert und erscheint Public in der UI
3. die Route wird nicht zu `isPublicRoute` hinzugefügt
4. Unauthenticated Users werden zu Sign-In redirected

Das ist bereits in der Praxis mit dem Public Docs Path passiert.

### Lesson
Immer wenn eine Public Content Surface hinzugefügt oder geändert wird, muss Route Visibility als Teil der Implementation gereviewt werden.

---

## Public Docs Route Fix Example

Der Docs-Route Auth Bug wurde resolved durch explizites Allowlisten:
- `/docs`
- `/:locale/docs`
- `/docs/(.*)`
- `/:locale/docs/(.*)`

in `proxy.ts`.

### Why This Mattered
Der Support Page's "View Docs" Link war öffentlich sichtbar, aber der eigentliche Docs Route Subtree wurde nicht als Public vom Auth Gate behandelt.

Das ist genau die Art von Mismatch die dieses Dokument existiert um zu verhindern.

---

## Review Checklist für Any New Public Route

Beim Hinzufügen einer neuen Public Route, verify all following:

1. **UI Intent**
- Is this actually meant to be public?

2. **Route Tree Coverage**
- Does the Allowlist include both Root und Nested Forms if needed?

3. **Locale Coverage**
- Does the Allowlist include Locale-Prefixed Variants?

4. **Middleware/Proxy Alignment**
- Is `proxy.ts` updated accordingly?

5. **Auth Behavior Test**
- Was the Route tested in a Logged-Out Session?

6. **Public-Link Flow Test**
- Was the Route tested through the actual Public Entry Page die zu ihr linkt?

---

## Safe Documentation Practice

Immer wenn Route Visibility sich ändert, sollte Documentation idealerweise alongside Code aktualisiert werden wenn der Change affectet:
- Public Access Expectations
- Support Flows
- Docs/Blog/Privacy Visibility
- Integration/Webhook Behavior

Das verhindert dass der Codebase stillschweigend von der intended Access Policy abdriftet.

---

## Recommended Future Follow-Ups

Die Route-Visibility Story würde gestärkt werden durch Hinzufügen:
- `docs/security/trust-boundaries.md`
- `docs/reference/api-reference.md`
- `docs/operations/route-verification-checklist.md`

Diese würden helfen Public-Route Documentation mit breiterer Auth, API, und Deployment Verification Practice zu verbinden.