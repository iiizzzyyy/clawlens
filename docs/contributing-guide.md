# Contributing to ClawLens

Thank you for your interest in contributing to ClawLens! This guide will help you get started with development and explain how to add features, fix bugs, and contribute to the project.

---

## Quick Start

### Prerequisites

- Node.js >= 18.0.0
- pnpm >= 8.0.0
- OpenClaw >= 2026.2.0 (for plugin integration)

### Setup

```bash
# Clone the repository
git clone https://github.com/clawlens/clawlens.git
cd clawlens

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Start development mode
pnpm dev:plugin  # Watch plugin package
pnpm dev:ui      # Vite dev server for UI
```

That's it! You're ready to start developing.

---

## Project Structure

```
clawlens/
├── packages/
│   ├── plugin/                # @clawlens/plugin - OpenClaw plugin
│   │   ├── src/
│   │   │   ├── index.ts       # Plugin entry point
│   │   │   ├── hooks/         # Lifecycle hook handlers
│   │   │   ├── db/            # Database layer (schema, reader, writer)
│   │   │   ├── api/           # HTTP API handlers
│   │   │   ├── importers/     # JSONL importer
│   │   │   └── config.ts      # Configuration loader
│   │   ├── tests/             # Plugin tests
│   │   └── fixtures/          # Demo session fixtures
│   │
│   └── ui/                    # @clawlens/ui - React web UI
│       ├── src/
│       │   ├── App.tsx        # React Router setup
│       │   ├── pages/         # Page components
│       │   ├── components/    # Reusable components
│       │   ├── hooks/         # Custom React hooks
│       │   └── api/           # API client
│       └── tests/             # UI tests
│
├── docs/                      # Documentation
├── .github/                   # GitHub Actions workflows
└── examples/                  # Example sessions
```

---

## Development Workflow

### Making Changes

1. **Create a branch**:
   ```bash
   git checkout -b feature/my-feature
   ```

2. **Make your changes**:
   - Edit files in `packages/plugin/src/` or `packages/ui/src/`
   - Add tests for new functionality
   - Update documentation if needed

3. **Test your changes**:
   ```bash
   pnpm test                # Run all tests
   pnpm test:coverage       # Check coverage
   pnpm typecheck           # Type check
   pnpm lint                # Lint code
   ```

4. **Build**:
   ```bash
   pnpm build
   ```

5. **Commit and push**:
   ```bash
   git add .
   git commit -m "Add feature: my feature description"
   git push origin feature/my-feature
   ```

6. **Open a pull request** on GitHub

---

## Common Tasks

### Adding Analytics Queries

Analytics queries are pre-built SQL queries that power the analytics UI.

**1. Add query type to the list** (`packages/plugin/src/api/analytics.ts`):

```typescript
export const ANALYTICS_QUERY_TYPES = [
  // Existing queries...
  'my_new_query',  // Add your query type here
] as const;
```

**2. Implement the query** (`packages/plugin/src/db/reader.ts`):

```typescript
export class SpanReader {
  getAnalytics(queryType: AnalyticsQueryType, params: AnalyticsParams): AnalyticsResult {
    switch (queryType) {
      // Existing cases...

      case 'my_new_query':
        return this.getMyNewQuery(params);

      default:
        throw new Error(`Unknown query type: ${queryType}`);
    }
  }

  private getMyNewQuery(params: AnalyticsParams): AnalyticsResult {
    const sql = `
      SELECT
        agent_id as label,
        COUNT(*) as count,
        SUM(cost_usd) as value
      FROM spans
      WHERE span_type = 'tool_exec'
        AND status = 'error'
        ${params.fromTs ? 'AND start_ts >= ?' : ''}
        ${params.toTs ? 'AND start_ts <= ?' : ''}
      GROUP BY agent_id
      ORDER BY value DESC
      LIMIT ?
    `;

    const values = [];
    if (params.fromTs) values.push(params.fromTs);
    if (params.toTs) values.push(params.toTs);
    values.push(params.limit ?? 100);

    const rows = this.db.prepare(sql).all(...values);

    return {
      queryType: 'my_new_query',
      data: rows as AnalyticsDataPoint[],
      metadata: {
        fromTs: params.fromTs,
        toTs: params.toTs,
        totalRecords: rows.length,
      },
    };
  }
}
```

**3. Add UI template** (`packages/ui/src/pages/Analytics.tsx`):

```tsx
const QUERY_TEMPLATES = [
  // Existing templates...
  {
    id: 'my_new_query',
    label: 'Tool Errors by Agent',
    description: 'Show which agents have the most tool execution failures',
    chartType: 'bar',
  },
];
```

**4. Add tests** (`packages/plugin/tests/analytics.test.ts`):

```typescript
describe('Analytics: my_new_query', () => {
  it('should return tool errors grouped by agent', () => {
    const result = reader.getAnalytics('my_new_query', {});

    expect(result.queryType).toBe('my_new_query');
    expect(result.data).toBeInstanceOf(Array);
    expect(result.data[0]).toHaveProperty('label');
    expect(result.data[0]).toHaveProperty('value');
  });
});
```

---

### Adding Span Types

Span types define the kinds of events ClawLens can capture.

**1. Add to type definition** (`packages/plugin/src/db/types.ts`):

```typescript
export type SpanType =
  | 'session'
  | 'turn'
  | 'llm_call'
  | 'tool_exec'
  | 'memory_search'
  | 'delegation'
  | 'my_new_type';  // Add your type here
```

**2. Create hook handler** (`packages/plugin/src/hooks/my-handler.ts`):

```typescript
import type { OpenClawHookContext } from 'openclaw';
import type { SpanWriter } from '../db/writer.js';

export function handleMyNewType(ctx: OpenClawHookContext, writer: SpanWriter) {
  const span = {
    traceId: ctx.sessionId,
    sessionId: ctx.sessionId,
    agentId: ctx.agentId,
    spanType: 'my_new_type' as const,
    name: 'My New Type',
    startTs: Date.now(),
    metadata: {
      customField: ctx.customData,
    },
  };

  writer.startSpan(span);
}
```

**3. Register hook** (`packages/plugin/src/index.ts`):

```typescript
import { handleMyNewType } from './hooks/my-handler.js';

export default function clawlensPlugin(api: OpenClawPluginApi) {
  const writer = new SpanWriter(db);

  // Existing hooks...

  api.hooks.on('my_custom_event', (ctx) => {
    handleMyNewType(ctx, writer);
  });
}
```

**4. Add UI rendering** (`packages/ui/src/components/SpanDetail.tsx`):

```tsx
function SpanDetail({ span }: { span: Span }) {
  // Existing rendering...

  if (span.spanType === 'my_new_type') {
    return (
      <div className="span-my-new-type">
        <h3>{span.name}</h3>
        <p>Custom field: {span.metadata.customField}</p>
      </div>
    );
  }
}
```

**5. Document in schema** (`docs/event-schema.md`):

Add a new section documenting your span type with examples.

---

### Writing Tests

ClawLens uses Vitest for testing. Tests are organized by package.

**Unit Tests** (`packages/plugin/tests/*.test.ts`):

```typescript
import { describe, it, expect } from 'vitest';
import { SpanWriter } from '../src/db/writer.js';
import { createTestDb } from '../src/db/connection.js';

describe('SpanWriter', () => {
  it('should write span to database', () => {
    const db = createTestDb();
    const writer = new SpanWriter(db);

    writer.startSpan({
      traceId: 'test',
      sessionId: 'test',
      agentId: 'test-agent',
      spanType: 'session',
      name: 'Test Session',
      startTs: Date.now(),
    });

    const spans = db.prepare('SELECT * FROM spans').all();
    expect(spans.length).toBe(1);
    expect(spans[0].agent_id).toBe('test-agent');
  });
});
```

**Integration Tests** (`packages/plugin/tests/integration.test.ts`):

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { importDemoFixtures } from '../src/demo.js';
import { handleSessionsList } from '../src/api/sessions.js';

describe('Integration Tests', () => {
  beforeAll(async () => {
    const db = createTestDb();
    const writer = new SpanWriter(db);
    await importDemoFixtures(writer, logger);
  });

  it('should return sessions from API', () => {
    const result = handleSessionsList('/clawlens/api/sessions', reader);
    expect(result.error).toBeUndefined();
    expect(result.data.length).toBeGreaterThan(0);
  });
});
```

**UI Tests** (`packages/ui/tests/*.test.tsx`):

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SessionList } from '../src/pages/SessionList.tsx';

describe('SessionList', () => {
  it('should render without crashing', () => {
    const { container } = render(<SessionList />);
    expect(container).toBeTruthy();
  });
});
```

**Run tests**:

```bash
pnpm test                  # Run all tests
pnpm test:watch            # Watch mode
pnpm test:coverage         # With coverage report
pnpm --filter plugin test  # Run plugin tests only
pnpm --filter ui test      # Run UI tests only
```

---

### Code Style

ClawLens uses ESLint and Prettier for code formatting.

**Lint your code**:

```bash
pnpm lint              # Check all packages
pnpm --filter plugin lint  # Lint plugin only
```

**Auto-fix**:

```bash
pnpm lint --fix
```

**TypeScript**:

```bash
pnpm typecheck         # Type check all packages
```

---

## Pull Request Guidelines

### Before Submitting

- [ ] Tests pass: `pnpm test`
- [ ] Code lints: `pnpm lint`
- [ ] Types check: `pnpm typecheck`
- [ ] Build succeeds: `pnpm build`
- [ ] Documentation updated if needed
- [ ] Commit messages are clear and descriptive

### PR Template

When creating a pull request, use this template:

```markdown
## Description

Brief description of what this PR does.

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing

- [ ] Added/updated tests
- [ ] All tests pass
- [ ] Manually tested (describe how)

## Checklist

- [ ] Code follows project style guidelines
- [ ] Documentation updated
- [ ] No breaking changes (or documented in migration guide)
```

### Review Process

1. **Automated checks**: CI runs tests, linting, type checking
2. **Code review**: Maintainer reviews your code
3. **Feedback**: Address any requested changes
4. **Merge**: Once approved, your PR will be merged

---

## Debugging Tips

### Debug Plugin Loading

Enable verbose logging:

```yaml
# clawlens.config.yaml
clawlens:
  verbose: true
```

Check OpenClaw logs:

```bash
openclaw --log-level debug
```

### Debug Database Queries

Use SQLite CLI:

```bash
sqlite3 ~/.openclaw/clawlens/clawlens.db

# List all tables
.tables

# Show spans
SELECT * FROM spans LIMIT 10;

# Check session count
SELECT COUNT(*) FROM spans WHERE span_type = 'session';
```

### Debug UI

Open browser developer console:
- Network tab: Check API requests
- Console tab: Check for errors
- React DevTools: Inspect component state

---

## Release Process

ClawLens uses semantic versioning (semver): `MAJOR.MINOR.PATCH`

### Creating a Release

1. **Update version** in `package.json` files
2. **Update CHANGELOG.md** with release notes
3. **Commit changes**: `git commit -m "chore: release v0.2.0"`
4. **Create tag**: `git tag v0.2.0`
5. **Push**: `git push && git push --tags`
6. **GitHub Actions** will automatically:
   - Run tests
   - Build packages
   - Create GitHub release
   - Publish to npm (if configured)

---

## Getting Help

- **GitHub Issues**: Report bugs or request features
- **GitHub Discussions**: Ask questions, share ideas
- **Discord**: Join the OpenClaw community (ClawLens channel)

---

## Code of Conduct

ClawLens follows the [Contributor Covenant Code of Conduct](../CODE_OF_CONDUCT.md). Please read and follow it.

---

## License

By contributing to ClawLens, you agree that your contributions will be licensed under the Apache-2.0 License.

---

## Resources

- [Architecture Guide](architecture.md)
- [Event Schema](event-schema.md)
- [OpenClaw Plugin SDK](https://github.com/openclaw/openclaw/tree/main/docs/plugin-sdk)
- [Vitest Documentation](https://vitest.dev/)
- [React Documentation](https://react.dev/)

Thank you for contributing to ClawLens! 🎉
