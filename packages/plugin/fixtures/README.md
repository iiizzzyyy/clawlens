# Test Fixtures

This directory contains sample JSONL session files for testing and demo purposes.

## Structure

```
fixtures/
  sample-session-basic.jsonl       # Simple session with one user message and response
  sample-session-tools.jsonl       # Session with tool executions
  sample-session-memory.jsonl      # Session with memory searches
  sample-session-delegation.jsonl  # Session with sub-agent delegation
```

## Usage

These fixtures are used for:

1. **Unit tests**: Import tests verify JSONL parsing logic
2. **Demo mode**: New ClawLens installs auto-load these sessions
3. **Development**: Manual testing during development

## Format

Each file follows the OpenClaw JSONL session format documented in `research/openclaw-plugin-api.md`.
