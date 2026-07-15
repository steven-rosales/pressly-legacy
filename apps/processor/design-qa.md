# Processor Design QA — Historical Snapshot

> **Captured:** 2026-07-14
>
> **Status:** historical, not a current acceptance result

Current visual and interaction rules live in [DESIGN.md](./DESIGN.md). Current
delivery status and verified evidence live in the relevant Stateworks work item.

## What This Review Found

The review used the public [ElevenLabs UI](https://github.com/elevenlabs/ui) as a
design-language reference while retaining Pressly colors and floor-sized
controls.

It found two issues in screenshots supplied during that review:

1. The shift calendar escaped the viewport when opened from the editor.
2. The Configuration publication action stretched like a primary section even
   though it was an infrequent secondary action.

The implementation pass added collision-aware calendar placement and height
limits, tightened calendar geometry, and made the publication action compact on
desktop. The relevant component tests, Processor suite, typecheck, lint, and
production build passed at that point.

## Evidence Limitation

The original review referenced clipboard and `/tmp` screenshots. Those paths
were ephemeral and are not durable repository evidence. A post-fix desktop and
mobile screenshot comparison was still pending, so this snapshot must not be
treated as proof of current visual closure.

Historical screenshots under `docs/agents` remain preserved, but their numbered
folders are non-authoritative unless a work item supplies the missing scenario
and capture context.
