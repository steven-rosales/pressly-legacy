# Browser E2E

This suite proves browser behavior that only exists after API, Web, Control,
and Processor are assembled behind production-like HTTPS. It does not replace
policy, state-machine, repository, controller, or contract tests.

The runner:

- refuses remote Docker contexts and non-local `DOCKER_HOST` values
- creates a unique Compose project and clean Postgres volume
- builds the production API, Web, Control, and Processor Dockerfiles
- exposes only Caddy on a random `127.0.0.1` HTTPS port
- bootstraps a synthetic facility and owner with random credentials
- keeps credentials and authenticated storage state in a mode-`0600` `/tmp`
  directory outside the repository
- removes containers, networks, volumes, images, and credentials on every exit

Run Chromium once after installing dependencies:

```sh
pnpm test:browser:install
```

Run the fast PR journeys:

```sh
pnpm test:browser:smoke
```

Run every browser journey:

```sh
pnpm test:browser:e2e
```

Failure-only traces, screenshots, video, service logs, JSON, JUnit, and HTML
reports stay under the ignored `.artifacts/playwright/` directory. All data in
this topology is synthetic. Browser requests are confined to the local
`web.pressly.test`, `api.pressly.test`, `control.pressly.test`, and
`processor.pressly.test` origins.

Local runs have no retries. CI permits one diagnostic retry but passes
`--fail-on-flaky-tests`, so a retry-pass still blocks release.
