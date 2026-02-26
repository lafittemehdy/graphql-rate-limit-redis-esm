/**
 * Shared schema, mock data, and resolvers for the example servers.
 *
 * Demonstrates the @rateLimit directive on login and sensitive fields.
 */

import { rateLimitDirectiveTypeDefs } from "../../src/index.js";

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

export const typeDefs = `#graphql
	${rateLimitDirectiveTypeDefs}

	type Query {
		me: User
		publicInfo: String!
	}

	type Mutation {
		login(email: String!, password: String!): String! @rateLimit(limit: 5, duration: 60)
		resetPassword(email: String!): Boolean! @rateLimit(limit: 3, duration: 300)
	}

	type User {
		email: String!
		id: ID!
		name: String!
	}
`;

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

interface MockUser {
	email: string;
	id: string;
	name: string;
}

const users: MockUser[] = [
	{ email: "alice@example.com", id: "1", name: "Alice" },
	{ email: "bob@example.com", id: "2", name: "Bob" },
];

// ---------------------------------------------------------------------------
// Resolvers
// ---------------------------------------------------------------------------

export const resolvers = {
	Mutation: {
		login: (_: unknown, args: { email: string }) => {
			const user = users.find((u) => u.email === args.email);
			return user ? `token-for-${user.id}` : "invalid";
		},
		resetPassword: (_: unknown, args: { email: string }) => {
			return users.some((u) => u.email === args.email);
		},
	},
	Query: {
		me: () => users[0],
		publicInfo: () => "This endpoint is not rate limited.",
	},
};

// ---------------------------------------------------------------------------
// Banner
// ---------------------------------------------------------------------------

export function printBanner(port: number): void {
	console.log(`
┌─────────────────────────────────────────────┐
│  graphql-rate-limit-redis-esm  —  Example   │
├─────────────────────────────────────────────┤
│  Server:   http://localhost:${port}/graphql    │
│  Redis:    localhost:6379                    │
│  Engine:   rate-limiter-flexible             │
└─────────────────────────────────────────────┘

Rate limits:
  Mutation.login          -> 5 requests / 60s
  Mutation.resetPassword  -> 3 requests / 300s

Try these queries:

  # Not rate limited
  query Public {
    publicInfo
  }

  # Rate limited (5 per minute)
  mutation Login {
    login(email: "alice@example.com", password: "secret")
  }

  # Rate limited (3 per 5 minutes)
  mutation Reset {
    resetPassword(email: "alice@example.com")
  }
`);
}
