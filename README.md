# graphql-rate-limit-redis-esm

[![npm version](https://img.shields.io/npm/v/graphql-rate-limit-redis-esm.svg)](https://www.npmjs.com/package/graphql-rate-limit-redis-esm)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Build Status](https://github.com/lafittemehdy/graphql-rate-limit-redis-esm/actions/workflows/test.yml/badge.svg)](https://github.com/lafittemehdy/graphql-rate-limit-redis-esm/actions)
[![Test Coverage](https://img.shields.io/badge/coverage-90%25-brightgreen.svg)](https://github.com/lafittemehdy/graphql-rate-limit-redis-esm)

A straightforward GraphQL rate limiting directive that actually works with ESM and doesn't make you pull your hair out.

Stop people from hammering your GraphQL endpoints. Simple as that.

## Why This Exists

Most rate limiting solutions for GraphQL are either stuck in CommonJS land, bloated with features you'll never use, or have convoluted APIs. This one does one thing well: rate limits GraphQL fields using Redis.

## What You Get

- Full ESM support (because it's +2025)
- TypeScript types that actually help
- Redis-only, no memory store nonsense
- Write your own key generation logic
- Add `@rateLimit` to any field and you're done

## Installation

```bash
npm install graphql-rate-limit-redis-esm
```

Works with npm, pnpm, yarn, or whatever package manager you're using this week.

## How to Use It

```typescript
import { createRateLimitDirective, rateLimitDirectiveTypeDefs } from 'graphql-rate-limit-redis-esm';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { RateLimiterRedis } from 'rate-limiter-flexible';
import Redis from 'ioredis';

const redis = new Redis();

// Set up the directive
const rateLimitTransformer = createRateLimitDirective({
  keyGenerator: (directiveArgs, source, args, context, info) => {
    // Figure out who's making the request
    return `user:${context.userId}:${info.fieldName}`;
  },
  limiterClass: RateLimiterRedis,
  limiterOptions: {
    storeClient: redis,
  },
});

// Build your schema
const schema = makeExecutableSchema({
  typeDefs: [
    rateLimitDirectiveTypeDefs,
    `
      type Mutation {
        login(email: String!, password: String!): String! @rateLimit(limit: 5, duration: 60)
      }
    `,
  ],
  resolvers: {
    // your resolvers here
  },
});

// Apply rate limiting
const schemaWithRateLimit = rateLimitTransformer(schema);
```

That's it. Now your `login` mutation can only be called 5 times per minute per user.

## How It Works

The `@rateLimit` directive takes two arguments:
- `limit`: How many requests are allowed
- `duration`: Time window in seconds

When someone exceeds the limit, they get a GraphQL error. No requests make it to your resolver.

## Key Generation

The `keyGenerator` function is where you decide how to track limits. Common patterns:

```typescript
// Per user
(directiveArgs, source, args, context, info) => `user:${context.userId}`

// Per IP address
(directiveArgs, source, args, context, info) => `ip:${context.ip}`

// Per user per field
(directiveArgs, source, args, context, info) => `user:${context.userId}:${info.fieldName}`

// Get creative
(directiveArgs, source, args, context, info) => `${context.userId}:${args.resourceId}:${info.fieldName}`
```

## Requirements

- Node.js 18 or newer
- A Redis instance
- GraphQL 16+
- `@graphql-tools/utils` 10+
- `rate-limiter-flexible` 8+

## License

MIT, do whatever you want with it. Just don’t screw over humanity, it’s not mandatory per the license, but seriously, don’t be an assh*le.
