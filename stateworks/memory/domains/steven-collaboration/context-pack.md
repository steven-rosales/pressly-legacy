# Steven Collaboration Context Pack

## Domain

Steven Collaboration (`steven-collaboration`)

## Summary

Durable, non-secret collaboration preferences for working with Steven on Pressly. This memory governs how agents reason, ask questions, present decisions, and preserve handoffs; it does not contain laundry-production truth or replace Steven's current request.

## Invariants

- current_request_overrides_profile: Steven's explicit instruction in the current task overrides every saved collaboration preference.
- collaboration_memory_is_not_domain_truth: Steven-collaboration memory may guide process and presentation but cannot assert, modify, or override laundry-production facts, policies, or invariants.
- memory_claims_preserve_epistemic_status: Confirmed facts, implementation evidence, assumptions, preferences, and unresolved questions must remain distinguishable in every memory or handoff update.
- collaboration_memory_contains_no_secrets: Collaboration memory never stores credentials, secrets, private tokens, customer payloads, or sensitive personal information.

## Policies

- ask_essential_domain_questions: Interrogation should use a small batch of high-leverage domain questions and should not continue once the material ambiguity has converged.
- give_strong_evidence_backed_judgment: Give Steven blunt, strong recommendations and corrections when warranted, with concrete reasoning and tradeoffs instead of social cushioning or automatic agreement.
- reason_from_physical_operations: For LPMS decisions, load laundry-production memory and start from physical-floor reality, human stability, and explicit operator authority before applying generic software abstractions.
- preserve_report_only_boundaries: If Steven asks for a report, explanation, plan, or no changes, do not implement until he gives a clear green light.
- prefer_rigorous_proportional_verification: Test domain rules, state transitions, concurrency, persistence, and contracts rigorously while keeping verification proportional for small presentation changes.
- processor_ui_uses_elevenlabs_language: For new Processor UI, use Product Design, shadcn, and the current official ElevenLabs UI system aggressively for structure and interaction while retaining Pressly's color palette and prioritizing physical-floor ergonomics.
- visual_review_uses_selected_surface: Use Steven's supplied screenshots as the default Processor visual-review surface and do not switch to browser automation without his permission or an explicit browser request.
- local_runtime_is_native_wsl_docker: For local Pressly runtime work, default to Steven's native WSL2 Docker daemon and verify the active daemon before mutation rather than assuming Docker Desktop.
- endpoint_guidance_prefers_postman: When Steven asks how to exercise an endpoint manually, prefer a Postman setup over curl unless he requests another client.

## Decisions

- collaborator_name_is_steven: Address the collaborating user as Steven when a name is useful.
- user_product_and_execution_memory_are_separate: Store collaboration preferences in steven-collaboration, laundry-production truth in laundry-production, and unfinished implementation status in Stateworks work packages and evidence.

## Workflows

- grounded_domain_interrogation: Load the relevant domain context pack, current implementation, and concrete evidence before asking questions -> Ask one compact batch of only the questions that materially affect invariants, policies, state transitions, authorization, or floor workflow -> Re-explain an unclear question instead of interpreting confusion as a decision -> Separate confirmed facts, decisions, assumptions, and open questions explicitly -> Challenge an answer when code, evidence, or a stronger invariant contradicts it -> Reflect the converged model back compactly before planning implementation -> Persist only confirmed durable conclusions through a source-backed memory delta
- scoped_change_authorization: Classify the request as report, diagnosis, planning, implementation, or external action -> When Steven requests a report or says no changes, inspect read-only evidence and stop after the report -> When Steven gives an implementation green light, make the smallest coherent change that preserves agreed invariants -> Verify in proportion to correctness and operational risk -> Report the result, remaining limitations, and any unverified external state plainly
- durable_session_handoff: Keep user collaboration preferences separate from product-domain truth -> Keep unfinished engineering risks in queued or active Stateworks work rather than presenting them as durable facts -> Record exact verification already completed without upgrading it into an unsupported release claim -> Make the next highest-value action visible to the following session

## Vocabulary

- actor:steven: Steven is the user collaborating with agents on Pressly and LPMS.

## Assumptions

- None recorded.

## Open Questions

- None recorded.
