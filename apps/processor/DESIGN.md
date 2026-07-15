# Processor Design System

The Processor is a fast operational interface for a physical laundry floor.
This document defines its stable visual and interaction rules.

Implementation tokens in `src/index.css` and shared components under
`src/components` are the executable source of truth. Dated screenshot reviews
belong in QA evidence, not in this document.

## Design Direction

Use the public [ElevenLabs UI](https://github.com/elevenlabs/ui) language
aggressively for typography, density, grouped surfaces, borders, radii, and
interaction anatomy. Use the repository's shadcn primitives as the component
foundation.

Two differences are intentional:

- Pressly keeps its own blue and operational semantic palette.
- Controls that commit physical work favor floor ergonomics over consumer-app
  compactness.

Copy the design language, not ElevenLabs product content or domain semantics.

## Visual Grammar

- Use Inter throughout.
- Use a 24px medium page title, 14px routine interface text, and 12px metadata
  as the default scale.
- Prefer a near-white canvas, flat grouped regions, one-pixel borders, and
  restrained elevation.
- Reserve shadows for floating overlays such as dialogs, drawers, popovers, and
  menus.
- Use the shared radius and color variables. Do not introduce one-off hex
  colors or arbitrary corner systems inside features.
- Use Tabler icons consistently. An icon supports a label; it does not replace
  an unfamiliar operational label.
- Keep line lengths short and align numbers so capacity, time, weight, and count
  comparisons are immediate.

## Operational Hierarchy

Each screen should answer these questions in order:

1. What shift or run am I operating?
2. What state is it in?
3. What needs attention now?
4. What action is available?
5. What detail explains that action?

Keep diagnostics, hashes, version numbers, and invariant proofs available for
support without placing them in the operator's primary scan path.

Show one dominant action per decision region. Secondary or infrequent actions
must not stretch into a primary full-width call to action on desktop.

## Physical-Work Controls

- Use explicit verbs: `Compute`, `Accept`, `Start sorting`, `Complete washing`.
- Show the object and consequence beside irreversible or physically
  consequential actions.
- Disable duplicate submission while a command is pending.
- Do not show a physical transition as complete until the authoritative server
  response and refresh confirm it.
- Treat a conflict as new information: refresh the affected workspace and show
  the operator what changed.
- Starting a stage and confirming an unusually early completion are separate
  decisions. The confirmation should explain elapsed time without turning the
  configured pulse into an artificial lock.
- On coarse-pointer layouts, give consequential controls a comfortable touch
  target even when the surrounding interface remains compact.

## Component Patterns

### Scheduling

Present `Compute → Review/Accept → Start` as one stateful work region. Do not
split one workflow into unrelated cards or reproduce accepted state only in
React memory.

Keep schedule totals and warnings near the decision. Put detailed batch rows
after the decision summary.

### Production board

Make current stage, next permitted action, batch identity, and frozen state
visible without opening a detail surface.

Machine assignment belongs in a stage-scoped drawer or sheet. The board should
show a compact assignment summary rather than every machine choice at once.

Use the server-provided action state. The interface must not infer that a stage
can advance.

### Calendars and overlays

Use the shared shadcn calendar and popover primitives, never a browser-native
date picker.

Every overlay must:

- remain inside the viewport at 320px, 390px, and desktop widths;
- use collision-aware placement and an available-height bound;
- scroll internally when its content cannot fit;
- preserve the trigger and current selection while open;
- support keyboard navigation and visible focus.

### Responsive layout

The application supports a minimum document width of 320px. Dense timelines or
tables may scroll inside their own bounded region; the page itself must not
develop horizontal overflow.

Desktop may use persistent navigation and side sheets. Mobile uses one
header-triggered navigation drawer rather than a second fixed bottom bar;
selecting a destination closes the drawer immediately. Preserve the same task
order and use full-width primary actions where appropriate.

## State and Networking

Backend state is authoritative. URLs preserve selected shift and run identity;
browser-local state may hold only transient presentation choices.

The live change feed is an invalidation signal. After an event, fetch the
authoritative workspace or board. Do not animate or patch the domain state from
an SSE payload, and do not add periodic polling as a fallback.

Connection loss should be visible but quiet. Reconnect once, resynchronize, and
avoid toast storms.

## Accessibility

- Preserve visible focus and logical keyboard order.
- Use text in addition to color for state and warnings.
- Announce command outcomes and newly available stage actions.
- Respect reduced motion.
- Keep semantic headings, labels, tables, and dialog descriptions intact when
  changing visual composition.

## Design QA

Before accepting a UI change:

1. Capture the exact interaction state at desktop, 390px, and 320px when it can
   affect containment.
2. Compare the full screen and the changed region against the design direction.
3. Test keyboard use, visible focus, reduced motion, loading, error, empty,
   conflict, and reconnect states that the change touches.
4. Confirm popovers and drawers remain inside the viewport.
5. Confirm no page-level horizontal overflow or hidden primary action.
6. Run the Processor tests, typecheck, lint, and production build.

Store durable captures with their date, viewport, scenario, and work-item
reference. Temporary clipboard and `/tmp` paths are never acceptance evidence.
