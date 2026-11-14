# Contributing to graphql-rate-limit-redis-esm

Use the Node.js version declared in package.json and the exact package manager pinned in the repository root. Clone the repository and run these commands from its root:

```sh
pnpm install --frozen-lockfile
pnpm run verify
pnpm audit
```

Run `npx playwright install chromium` and `npm run test:browser` from `examples/visualization` after building it. Browser tests cover desktop and mobile keyboard behavior.

Build the visualization independently with `cd examples/visualization`, `npm ci`, and `npm run build`. Set `REDIS_URL` to an isolated test Redis instance to run the Redis integration tests; never point tests at production data. Keep dependency lockfiles synchronized with their manifests.

## Changes and review

- Open an issue describing the problem and a minimal reproduction before proposing a large change.
- Preserve public API contracts, supported runtimes, ESM/CommonJS exports, and TypeScript declarations. Describe any intentional behavior change.
- Add a focused regression test for a bug or new behavior. Check affected examples and update their documentation.
- Include the problem, resulting behavior, validation commands, and any remaining limitations in your pull request.
- Keep generated build output, coverage, dependency directories, secrets, and local data out of commits.

## Reporting issues

Include package and runtime versions, a minimal reproduction, expected behavior, and actual behavior. Please follow [our code of conduct](CODE_OF_CONDUCT.md). Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).
