# Browser Hosts

Customer, Control, and Processor browser process entrypoints migrate here only
after their experience features and generated clients are proven. Control and
Processor own an explicit React DOM mount lifecycle. Customer owns injected
Next client-instrumentation startup and teardown; Next remains the sole owner
of rendering, hydration, routing, and StrictMode. Browser hosts never own UI or
business policy.
