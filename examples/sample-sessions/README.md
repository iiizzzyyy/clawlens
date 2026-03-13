# Sample Sessions

This directory contains example OpenClaw JSONL session files for demonstration and testing.

## Purpose

These sample sessions are used for:

1. **Demo mode**: Automatically loaded when ClawLens is first installed to show features
2. **Development**: Manual testing during development
3. **Testing**: Integration tests for JSONL import
4. **Documentation**: Examples of the OpenClaw session format

## Creating Sample Sessions

To create sample sessions:

1. Run OpenClaw with various scenarios
2. Copy JSONL files from `~/.openclaw/agents/<agentId>/sessions/`
3. Sanitize any sensitive data
4. Place files in this directory

## Session Types Needed

- **Basic conversation**: Simple user message and assistant response
- **Tool execution**: Session with bash, browser, or other tool calls
- **Memory operations**: Session with memory search/recall
- **Multi-agent**: Session with agent delegation
- **Error cases**: Sessions with tool failures, timeouts, errors

## Format

All files must follow the OpenClaw JSONL session format documented in `research/openclaw-plugin-api.md`.
