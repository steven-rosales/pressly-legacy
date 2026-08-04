# Module Architecture Refactor

## Purpose

Make Pressly's modular monolith maximally declarative, functional, and
hexagonal without changing product behavior or forcing ceremonial layers.

The refactor makes ownership and dependency direction mechanically visible:

- business capabilities own application commands, results, models, policies,
  use cases, ports, and adapters;
- packages own reusable technical mechanisms;
- contracts own serialized trust and process boundaries;
- pure decisions and transformations stay inside the functional core;
- I/O and framework behavior stay at explicit adapters; and
- reusable design patterns begin as typed functional factories or compilers
  only when repeated semantics justify a common shape.

## Delivered Scope

The refactor establishes one declarative module-architecture definition,
migrates Pricing as the contract-boundary pilot, corrects misclassified models
and persistence adapters, splits the oversized capability families, and
contains serialized-contract imports at real module edges.

## Non-Goals

- No new product or laundry-production behavior.
- No global workflow engine, service decomposition, or class hierarchy.
- No empty role files added to satisfy a folder template.
- No broad rewrite of active LPMS correctness or Control work.
- No mutation of unrelated Processor, marketing, image, or SEO worktree state.
