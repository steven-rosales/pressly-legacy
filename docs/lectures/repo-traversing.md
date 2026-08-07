# How to Read the Repository

This guide will teach you how to read the repository of Pressly.

## Mental Model

The repository rule is:

- apps compose
- modules decide
- packages enable
- contracts validate serialized boundaries

A good flowchart:

```txt
  Human['Human / browser / external system']
  App['App process / API, Worker, CLI, Web']
  Contract['Serialized Contract']
  Public['Module public surface']
  UseCase['Verb object use case']
  Core['Pure policy / lifecycle / projection / algorithms']
  Port['Required port']
  Adapter['Repository / adapter']
  Mechanism['PostgreSQL / network / crypto / runtime']

  Human -> App
  App -> Contract
  Contract -> Public
  Public -> UseCase
  UseCase -> Core
  UseCase -> Port
  Adapter -implements-> Port
  Adapter -> Mechanism
```

## Traversing

An app answers: 'What exists in this process, and how is it wired'

- API: `apps/api/src/main.ts` -> runtime -> `apps/api/src/bootstrap/api.composition.ts`
- Worker: `apps/worker/src/main.ts` -> `apps/worker/src/bootstrap/worker-jobs.composition.ts`
- CLI: `main.ts` -> command parsing -> injected capability
- Control/Processor/Web: framework entry -> app composition -> selected feature

Look at `apps/api/src/bootstrap/api-capabilities.composition.ts` that shows which modules exist together and where one module's public capability is adpated into another module's port.

Then find the semantic authority. The authority tree is:

```txt
business/
  orders
  pricing
  production
  users

security/
  identity
  authorization

integration/
  webhook-digestion

experience/
  control
  processor
```

When you know the owner, the `module.architecture.ts` tells you what the module can do, the features that are commands and queries, which foundations exist, what each feature may depend upon, and which dependencies are deliberately absent.

Once you're in the module, read it from outside inward:

1. `public.ts` - what other workspaces are allowed to consume
2. `main.ts` - canonical module-level construction exports
3. `composition/*.composition.ts` - how the module is assembled
4. `module.architecture.ts` - the complete internal ownership and depndency map
5. One selected verb-object feature

You'll then want to read the module contents, which should be read per feature. Choose a question, for example:

- How is a stage advanced?
- How is a pricing change published?
- How is a webhook claimed?
- How is a customer listed?
- How is an order projected into Production?

Then enter:

`features/<namespace>/<verb-object>`

Read the leaf in this order:

1. `.model.ts` and `.failure.ts` - vocabulary, inputs, results, expected rejection
2. `.usecase.ts` - orchestration and effect order
3. `.policy.ts`, `.lifecycle.ts`, `.projection.ts`, `.algorithm.ts` - pure decisions
4. `.port.ts` - required facts or effects
5. `.repo.ts` or `.adpater.ts` - concrete mechanisms
6. Qualified mapper - where representation changes
7. `.controller.ts` and `.route.ts` - protocol representation
8. `Mirrored tests - executable proof
