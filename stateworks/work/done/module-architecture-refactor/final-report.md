# Module Architecture Refactor Final Report

Status: complete locally on 2026-08-02; not committed or deployed.

Pressly's module architecture is now declared once as immutable data and
compiled into the queries consumed by ESLint and repository validation. Every
business, policy, and computation module explicitly registers its capabilities,
foundations, role vocabulary, directed foundation dependencies, and serialized
contract edge. Missing, stray, misspelled, overlapping, and cyclic declarations
fail mechanically.

The code now follows a capability-first functional hexagonal shape. Capability
models and commands remain inside their owning modules; policies and mappers are
pure; ports describe required effects; repositories and protocol controllers
form the imperative shell. Auth workforce, Orders incoming proposals, and
Production history were split into independently traversable capabilities while
cohesive shared language stayed in named foundations.

Serialized contracts are confined to actual trust or process boundaries.
Pricing, Auth, and Production retain contract imports only in their declared
controller and mapper roles. Orders retains one outbox codec mapper. Access
Control retains one Pricing guard. Users, Webhook Ingestion, Production Policy,
and Scheduling Computation have no contract imports. API, Worker, CLI, and
Processor adapters translate between serialized shapes and module-owned
application types at their edges.

Reusable patterns were introduced proportionally as typed functional factories
or compilers: the module-architecture compiler, schema-paired request boundary,
and compatible bound-cursor factory. No class hierarchy, generic workflow
engine, pattern catalog, or empty role scaffolding was added. The signed backlog
cursor remains local because its integrity semantics differ from the generic
cursor.

Repository verification passed: 49 bounded Turbo test tasks plus 14 tooling
files and 242 tooling tests, 27 lint tasks plus browser and architecture lint,
48 typecheck tasks plus browser and architecture typechecks, and 27 build tasks.
`git diff --check` also passed. An optional database-backed Production test could
not connect to Postgres at `127.0.0.1:55434`, so this report does not claim
database-integration proof.

This closes the selected module and contract-boundary refactor. Older request
casts remain in Control, Order Management, session, and live-production API
routes outside the migrated slices; they are named follow-up debt rather than
being represented as proof-carrying request boundaries. Pre-existing Processor
design work, marketing assets, images, and the SEO document deletion remain
user-owned and were not absorbed into this work package.

No product behavior, laundry-production policy, durable domain memory,
deployment state, pilot readiness, or production behavior changed. Commit and
push remain separate user-authorized actions.
