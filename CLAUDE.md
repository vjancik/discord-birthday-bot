# Bun instructions

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.mdx`.

# Custom instructions

## Practical Rules
- use bun commands instead of npm and node commands
- when using any bun command prepend it with `bunx cross-env AGENT=1` (for example: `bunx cross-env AGENT=1 bun run test`)
- dont install dotenv, .env is loaded automatically by bun
- dont use the "any" type to resolve type errors, except where it actually makes sense logically
- use custom application errors instead of throwing generic errors when possible
- do not remove previous source code comments, unless you are changing the implementation or providing clarification or the user is asking you to
- use type imports for type only imports
- use ?? instead of || for nullish coalescing
- after implementing your task, run `bun run typecheck && bun run codecheck:fix` and fix any errors until it passes all checks
- use the context7 MCP tools to fetch up to date information on external APIs and docs, assume your internal knowledge is outdated

## Architecture Rules
- use Domain-Driven Design principles and adhere to Hexagonal Architecture
- adhere to SOLID principles
