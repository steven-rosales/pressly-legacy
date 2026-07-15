# Cents Webhook Local Proof

Use this runbook to reproduce the Cents webhook authentication and ingress
cases from Postman without manually calculating signatures.

This is a local proof asset. Do not point it at production.

## Security Contract

Pressly expects these headers:

```text
X-Cents-Timestamp: <unix-seconds>
X-Cents-Signature: v1=<lowercase-hex HMAC-SHA256>
```

The signed message is the UTF-8 byte sequence:

```text
<timestamp>.<exact raw HTTP body>
```

The API rejects timestamps more than 300 seconds in the past or future. It
authenticates the exact raw body before parsing JSON.

The collection-level pre-request script:

1. Resolves variables in the raw body.
2. Selects a fresh Unix timestamp, or a deliberately stale one.
3. Computes HMAC-SHA256 with the local key.
4. Adds `X-Cents-Timestamp` and `X-Cents-Signature`.

It uses `pm.require('npm:crypto-js@4.2.0')` through Postman's external-package
loader. That loader is not available in every Postman runtime or workspace, so
verify compatibility before running the collection. Postman also documents
`pm.variables.replaceIn()` for resolving variables before a request is sent:

- [Import packages into Postman scripts](https://learning.postman.com/latest-v-12/docs/tests-and-scripts/write-scripts/postman-sandbox-reference/pm-require)
- [Use variables in scripts](https://learning.postman.com/docs/use/send-requests/variables/variables/)

## Safety Boundary

- Use only a generated local key.
- Never paste a production key, customer payload, bearer token, or production
  URL into Postman.
- Never commit or export the environment after adding the local key.
- Keep the synthetic payloads synthetic. Do not replace them with customer
  data.
- Do not log the key or generated signature.
- Treat the shared native-WSL Postgres volume as persistent development data.
  Do not reset it, remove it, or run `docker compose down -v` for this proof.

The example environment intentionally contains the unusable placeholder
`<set-local-only>`. Postman marks it as a secret only to mask the local value in
the UI; that does not make an exported environment safe after the value is
filled.

## Prepare the Local API

1. Generate a local key of at least 32 bytes.

   ```bash
   openssl rand -hex 32
   ```

2. Put that value in the API's local-only environment as
   `CENTS_WEBHOOK_HMAC_CURRENT_KEY`.

3. Start the local stack.

   ```bash
   pnpm docker:up
   ```

4. Confirm the API is reachable at `http://localhost:4000`.

5. For Worker processing beyond durable ingestion, keep
   `cents_test_store_id=tooling-store-001`. Local Docker bootstraps that
   synthetic Cents binding to `Pressly One`. The HMAC and ingress cases
   themselves do not require a live vendor account.

Do not paste the generated key into a command, issue, screenshot, log, or this
runbook.

## Import and Configure Postman

1. Import both files:
   - `tooling/cents-webhook.postman_collection.json`
   - `tooling/cents-webhook.postman_environment.example.json`

2. Duplicate the imported environment for local use.

3. Select the duplicated environment.

4. Set `cents_hmac_key` to the same local key used by the API.

5. Leave `base_url` as `http://localhost:4000`.

6. Keep `cents_test_store_id=tooling-store-001` for local Worker projection.
   Change it only when testing a different explicitly bootstrapped binding.

## Verify Postman Package Support

The collection requires a current Postman runtime that can load a public npm
package from an internal, partner, or public workspace.

Before sending a request:

1. Open the collection's pre-request script.
2. Open **Packages** and confirm `npm:crypto-js@4.2.0` imports successfully. A
   red warning means the signing script cannot run.
3. If a team policy restricts external packages, allow this exact public
   package or use a workspace where external public packages are permitted.
4. Use the current Postman Desktop app or supported web app. Newman does not
   support external packages used through `pm.require`.

If Postman reports `Cannot find package 'npm:crypto-js@4.2.0'`, stop there. The
request has not been signed. Update Postman, move or re-import the collection
into a supported workspace, and confirm package access before retrying.

Do not replace the import with deprecated `require('crypto-js')`, rely on a
legacy global `CryptoJS`, or paste a precomputed signature. Those approaches do
not prove that the exact current body was signed. If external packages cannot
be enabled, use the automated equivalent at the end of this runbook instead of
claiming a Postman proof.

## Run the Cases

Run requests in numbered order so the duplicate case follows its original
delivery.

For a disposable, isolated proof database, the imported identifiers may be
used once as written. For the shared native-WSL development database, first add
a unique run suffix to the accepted request bodies in your local Postman copy:

- change the IDs in requests 01, 05, 07, and 08;
- keep requests 05 and 06 byte-for-byte identical to each other;
- update the accepted events' `updatedAt` values consistently;
- do not change repository collection assets merely to rerun a local proof.

This preserves durable development history and makes the first accepted
delivery new without resetting the database.

| Case                 | Expected HTTP result | Expected ingress result                        |
| -------------------- | -------------------- | ---------------------------------------------- |
| `valid_signature`    | `202`                | New pending order event                        |
| `wrong_key`          | `401`                | Authentication rejected; no event              |
| `modified_body`      | `401`                | Authentication rejected; no event              |
| `stale_timestamp`    | `401`                | Authentication rejected; no event              |
| `order_event`        | `202`                | New pending order event                        |
| `duplicate_delivery` | `202`                | Same event acknowledged with `duplicate: true` |
| `customer_event`     | `202`                | Minimal ignored event                          |
| `marketing_event`    | `202`                | Minimal ignored event                          |

The `modified_body` mode signs the visible raw body plus one ASCII space, then
sends the visible body unchanged. This safely proves that changing even one raw
byte after signing invalidates the request.

The duplicate proof depends on byte-for-byte equality. The order and duplicate
requests intentionally have identical raw bodies. Their authentication
timestamps may differ because the event identity does not use the transport
timestamp.

If a positive case already exists from an earlier run, use a new run suffix.
Never reset the shared development database to make a `duplicate: false`
assertion pass. Do not edit only request 06; that would turn the duplicate proof
into a different delivery.

## Interpret Failures

- `503 cents_webhook_verification_unavailable`: the API has no usable current
  key, the configured key is too short, or verification failed to run.
- `401 invalid_cents_webhook_authentication`: key, timestamp, signature, or raw
  bytes do not match.
- `400 invalid_cents_webhook_body`: authentication passed, but the body was not
  valid JSON.
- `400 invalid_cents_*`: authentication passed, but the Cents wire payload
  could not be normalized.
- A Postman pre-request error about `cents_hmac_key`: the selected environment
  has no local key of at least 32 UTF-8 bytes.
- `Cannot find package 'npm:crypto-js@4.2.0'`: the current Postman runtime,
  workspace, or team policy cannot load the collection's external package. Use
  the compatibility steps above; this is not an API or HMAC-key failure.

Check workstation and API clock synchronization before investigating a valid
signature that fails only at the clock boundary.

## Automated Equivalent

CI does not depend on Postman. Every request description names the automated
test or tests that prove the same behavior. The deterministic asset test also
executes the signing script with a fixed clock and checks valid, wrong-key,
modified-body, and stale signatures.

Run it directly with:

```bash
pnpm exec vitest run tooling/test/cents-webhook-assets.test.mjs
```

The repository's root `pnpm test` command also includes `tooling/test`.
