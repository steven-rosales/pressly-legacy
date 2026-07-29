# Pressly Order Authority Design QA

## Scope

Product Design verification covered the Processor operational Order view,
source-evidence presentation, individual archive, History restore, denial
states, and responsive behavior. The existing Processor design system and
shared shadcn primitives remained the visual baseline.

## Environment

- Date: 2026-07-28
- Browser: user-selected Chrome
- Local Processor: `http://localhost:4173`
- Local API: `http://localhost:4000`
- Data: documented variable-order local fixture
- Desktop viewport: 1440 x 900
- Mobile viewport: 390 x 844

Postgres, API, Worker, and Processor were healthy. Migration 0035 was applied
to the local database before verification.

## Critical States

### Operational list

- Canonical order number is the primary identity.
- Customer name is the secondary identity on every checked row and History
  event; unavailable identity is explicit.
- Existing navigation, density, controls, border treatment, typography, and
  color tokens remain consistent.
- Search and filters retain usable desktop and mobile layouts.

### Order workspace

- Pressly commercial and Production state appear before source evidence.
- Source state is labeled as source evidence rather than an instruction.
- Field ownership, source posture, latest decision, canonical versions, and
  audit evidence are server-composed.
- Technical record evidence is secondary and collapsible.
- Disabled Production commands state the server-owned reason.

### Blocked source

- The top warning says that Cents is blocked.
- The copy explains that the observation was retained but cannot change
  Pressly order facts.
- The source report repeats the blocked posture without turning it into a
  Production action.
- An append-only local posture sequence proved
  `blocked -> observe_only -> normal`.

### Archive

- The action is named **Archive from active work**.
- Consequences explicitly exclude deletion and completion.
- The manager chooses a stable reason, may add an audit note, reviews recorded
  Pressly facts, and confirms a second time.
- Success removes the order from active work while History retains its
  identity, customer, reason, actor, and permanent record.

### Restore

- History exposes **Restore to active work** only as an explicit manager
  action.
- The dialog explains that current facts are re-evaluated and Cents is not
  changed.
- A reason is required.
- Success reports the canonical identity:
  `Order TEST-INTAKE-001 is back in active work.`

### Version conflict

- A deliberately stale Production version was rejected.
- The form remained open with the manager's selections intact.
- The message said the order or batch changed and instructed the manager to
  reopen the order and review its current floor position.
- No client-side transition or silent retry occurred.

## Responsive Review

Desktop uses the established right-side sheet and preserves the underlying
order context. Mobile uses a full-width workspace with a sticky command footer.
The key identity, status, source warning, truth report, and actions remain
reachable without horizontal scrolling.

## Interaction and Accessibility

- Controls retain accessible names and native or shared shadcn semantics.
- Dialog focus and close behavior remained functional.
- Archive requires explicit acknowledgement and confirmation.
- Restore requires a selected reason.
- Focused component suites cover loading, empty, error, permission-denied,
  blocked-source, stale-version, disabled-command, success, and localization
  states.

## Browser Health

Chrome console inspection after normal, blocked-source, archive, restore, and
version-conflict flows returned no warnings or errors. Successful reads and
mutations completed against the rebuilt local API; the deliberate conflict
returned the expected recoverable application state.

## Result

Pass. No unresolved high-severity workflow, responsive, or design-system issue
remains in the verified scope.
