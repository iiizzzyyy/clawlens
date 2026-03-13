# Contributing to ClawLens

Thank you for your interest in contributing to ClawLens! This document provides quick start guidelines. For detailed examples and advanced topics, see the [full Contributing Guide](docs/contributing-guide.md).

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

That's it! You're ready to contribute.

---

## Development Workflow

1. **Create a branch**:
   ```bash
   git checkout -b feature/my-feature
   ```

2. **Make changes and test**:
   ```bash
   pnpm test              # Run all tests
   pnpm lint              # Check code style
   pnpm typecheck         # Type check
   pnpm build             # Build packages
   ```

3. **Commit and push**:
   ```bash
   git add .
   git commit -m "feat: add my feature"
   git push origin feature/my-feature
   ```

4. **Open a pull request** on GitHub

---

## Project Structure

```
clawlens/
├── packages/
│   ├── plugin/          # @clawlens/plugin - OpenClaw plugin
│   │   ├── src/
│   │   │   ├── index.ts       # Plugin entry point
│   │   │   ├── hooks/         # Lifecycle hook handlers
│   │   │   ├── db/            # Database layer
│   │   │   ├── api/           # HTTP API handlers
│   │   │   └── importers/     # JSONL importer
│   │   └── tests/             # Plugin tests
│   │
│   └── ui/              # @clawlens/ui - React web UI
│       ├── src/
│       │   ├── pages/         # Page components
│       │   ├── components/    # Reusable components
│       │   └── api/           # API client
│       └── tests/             # UI tests
│
├── docs/                # Documentation
│   ├── architecture.md
│   ├── event-schema.md
│   ├── contributing-guide.md  # Detailed guide
│   └── roadmap.md
│
└── .github/
    ├── workflows/       # CI/CD
    └── ISSUE_TEMPLATE/  # Bug/feature templates
```

---

## Code Style

- **TypeScript**: All code is TypeScript with strict mode enabled
- **ESM**: Use ES modules (import/export), not CommonJS
- **Formatting**: Prettier (configured in package.json)
- **Linting**: ESLint with TypeScript rules

**Check your code**:

```bash
pnpm lint           # Lint all packages
pnpm lint --fix     # Auto-fix issues
pnpm typecheck      # Type check all packages
```

---

## Testing

ClawLens uses Vitest for testing.

**Run tests**:

```bash
pnpm test                    # Run all tests
pnpm test:coverage           # With coverage
pnpm test:watch              # Watch mode
pnpm --filter plugin test    # Plugin tests only
pnpm --filter ui test        # UI tests only
```

**Test requirements**:
- All new features must have tests
- Bug fixes should include regression tests
- Maintain or improve coverage (currently 55%+ lines)

See [Testing section in Contributing Guide](docs/contributing-guide.md#writing-tests) for examples.

---

## Pull Request Guidelines

### Before Submitting

- [ ] Tests pass: `pnpm test`
- [ ] Code lints: `pnpm lint`
- [ ] Types check: `pnpm typecheck`
- [ ] Build succeeds: `pnpm build`
- [ ] Documentation updated (if needed)
- [ ] Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)

### Commit Message Format

Use conventional commit prefixes:

- `feat: Add session replay timeline component`
- `fix: Correct cost calculation in analytics`
- `docs: Update plugin installation guide`
- `refactor: Simplify span matching logic`
- `test: Add tests for JSONL importer`
- `chore: Update dependencies`

### PR Template

When opening a pull request:

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation

## Testing
- [ ] Added/updated tests
- [ ] All tests pass
- [ ] Manually tested

## Checklist
- [ ] Code follows style guidelines
- [ ] Documentation updated
- [ ] No breaking changes (or documented)
```

---

## Common Tasks

For detailed examples, see the [Contributing Guide](docs/contributing-guide.md).

### Adding Analytics Queries

1. Add query type to `ANALYTICS_QUERY_TYPES` in `packages/plugin/src/api/analytics.ts`
2. Implement query in `SpanReader.getAnalytics()` in `packages/plugin/src/db/reader.ts`
3. Add UI template in `packages/ui/src/pages/Analytics.tsx`
4. Add tests in `packages/plugin/tests/analytics.test.ts`

[See detailed example →](docs/contributing-guide.md#adding-analytics-queries)

### Adding Span Types

1. Add to `SpanType` in `packages/plugin/src/db/types.ts`
2. Create hook handler in `packages/plugin/src/hooks/`
3. Register hook in `packages/plugin/src/index.ts`
4. Add UI rendering in components
5. Document in `docs/event-schema.md`

[See detailed example →](docs/contributing-guide.md#adding-span-types)

---

## Issue Reporting

### Bug Reports

Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md) and include:

- ClawLens version
- OpenClaw version
- Operating system
- Steps to reproduce
- Expected vs actual behavior
- Logs or screenshots

### Feature Requests

Use the [feature request template](.github/ISSUE_TEMPLATE/feature_request.md) and include:

- **Problem**: What problem does this solve?
- **Solution**: How should it work?
- **Alternatives**: Other approaches considered
- **Impact**: Who benefits?

---

## Code Review Process

1. **Submit PR**: All PRs get automated checks (tests, lint, typecheck)
2. **Review**: Maintainer reviews within 1-2 business days
3. **Feedback**: Address requested changes
4. **Approval**: Once approved, PR is merged

---

## Development Resources

- **[Architecture Guide](docs/architecture.md)** — How ClawLens works
- **[Event Schema](docs/event-schema.md)** — Span types and fields
- **[Contributing Guide](docs/contributing-guide.md)** — Detailed examples
- **[Roadmap](docs/roadmap.md)** — Future features

---

## Getting Help

- **[GitHub Discussions](https://github.com/clawlens/clawlens/discussions)** — General questions
- **[GitHub Issues](https://github.com/clawlens/clawlens/issues)** — Bugs and features
- **Discord** — Join #clawlens in OpenClaw community

---

## Code of Conduct

ClawLens follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). Please read and follow it.

---

## License

By contributing to ClawLens, you agree that your contributions will be licensed under the Apache-2.0 License.

---

Thank you for contributing to ClawLens! 🎉
