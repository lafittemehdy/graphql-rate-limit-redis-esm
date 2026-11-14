# Security Policy

## Supported versions

Security fixes target the latest published release in the current major release line (5.x). Upgrade to the latest patch before reporting a suspected issue. Older release lines are unsupported.

## Private vulnerability reports

Use [GitHub private vulnerability reporting](https://github.com/lafittemehdy/graphql-rate-limit-redis-esm/security/advisories/new), or email lafittemehdy@gmail.com if that channel is unavailable. Do not include exploits, credentials, personal data, or undisclosed vulnerability details in public issues.

Include affected versions, impact, prerequisites, a minimal safe reproduction, and any known workaround. Maintainers will coordinate investigation and disclosure; no fixed response time or security guarantee is promised.

## Deployment boundaries

Rate limiting supplements authentication, authorization, query limits, and upstream request limits. Trust forwarded identity headers only behind a verified proxy chain. Keep Redis private and authenticated, and choose service failure behavior deliberately.
