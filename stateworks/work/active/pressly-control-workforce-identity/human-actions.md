# Human Actions

One bounded human action is required to close the deployed Order-detail runtime
contradiction recorded as Sentry issue `API-E`:

The network schedules this as `H1` after T3, T5, T6, T7, T7A, and T7B and before
V1. T3 remains the current next repository task; the gate will become the
human-action stop only after its declared repository dependencies are committed.

1. Sign in to `control.trypressly.com` as an authorized user and open the Orders
   workspace.
2. In browser developer tools, clear the Fetch/XHR network log, then open one
   existing Order known to contain at least one item. Do not create, correct, or
   save an Order for this proof.
3. Verify the authenticated Order-detail GET returns HTTP 200 with `ok: true`
   and at least one item, and that the read-only detail surface renders that
   item. Confirm the interaction emitted no POST, PUT, PATCH, or DELETE request.
4. Record only the date, redacted success outcome, and whether `API-E` retained
   its pre-repair event count and last-seen time after a fixed five-minute
   Sentry ingestion window starting after the successful GET. Do not record the
   URL, Order ID, customer data, response payload, or screenshot containing
   production data.
5. Resolve `API-E` only after the authenticated proof succeeds and Sentry still
   shows no post-repair recurrence. If the request fails or a new event appears,
   leave the issue open and return the defect to repository diagnosis.

`control.trypressly.com` is already deployed and healthy; it is not a pending
configuration action. Employee onboarding and a real invitation-delivery
provider remain deferred operational adoption work outside the currently
scheduled repository proof.
