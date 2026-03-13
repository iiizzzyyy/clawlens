---
name: Bug Report
about: Report a bug or unexpected behavior in ClawLens
title: '[BUG] '
labels: bug
assignees: ''
---

## Bug Description

A clear and concise description of what the bug is.

## Environment

- **ClawLens Version:** [e.g., 0.1.0]
- **OpenClaw Version:** [e.g., 2026.3.0]
- **Operating System:** [e.g., macOS 14.0, Ubuntu 22.04, Windows 11]
- **Node.js Version:** [run `node --version`]
- **Package Manager:** [pnpm / npm / yarn]

## Steps to Reproduce

1. Install ClawLens with `...`
2. Configure with `...`
3. Run command `...`
4. See error

## Expected Behavior

What you expected to happen.

## Actual Behavior

What actually happened. Include full error messages and stack traces.

```
Paste error output here
```

## Screenshots

If applicable, add screenshots to help explain your problem.

## Configuration

Paste relevant portions of your `clawlens.config.yaml` (remove sensitive data):

```yaml
# Your config here
```

## Additional Context

Add any other context about the problem here:

- Does this happen consistently or intermittently?
- Does this happen with demo fixtures or only with real data?
- Have you modified any plugin code?
- Are there any related errors in OpenClaw logs?

## Logs

If possible, include relevant logs from:
- OpenClaw console output
- Browser console (for UI issues)
- SQLite database state (`SELECT COUNT(*) FROM spans;`)

## Checklist

- [ ] I have searched existing issues to ensure this is not a duplicate
- [ ] I have included all required environment information
- [ ] I have provided steps to reproduce
- [ ] I have checked the documentation and FAQ
