/**
 * JSONL session importer
 *
 * Reads OpenClaw JSONL session files and generates spans for historical backfill.
 * Supports streaming line-by-line reads to handle large session files.
 */

import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { glob } from 'glob';
import { randomUUID } from 'node:crypto';
import type { SpanWriter } from '../db/writer.js';
import type { Span } from '../db/types.js';

/**
 * Result of importing a JSONL file
 */
export interface ImportResult {
  filePath: string;
  sessionId: string | null;
  spansCreated: number;
  linesProcessed: number;
  linesFailed: number;
  errors: string[];
  skipped: boolean;
  skippedReason?: string;
  durationMs: number;
}

/**
 * Session metadata from first JSONL line
 * Supports both demo fixture format and real OpenClaw format
 */
interface SessionMetadata {
  type: 'session';
  /** Normalized session ID (from `sessionId` or `id`) */
  sessionId: string;
  /** Normalized agent ID (from `agentId` or derived from file path) */
  agentId: string;
  channel?: string;
  /** Normalized creation timestamp (from `createdAt` or `timestamp`) */
  createdAt?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Raw session line as it appears in JSONL files
 * Real OpenClaw files use `id` and `timestamp`; demo fixtures use `sessionId` and `createdAt`
 */
interface RawSessionLine {
  type: 'session';
  id?: string;
  sessionId?: string;
  agentId?: string;
  channel?: string;
  timestamp?: string;
  createdAt?: string;
  version?: number;
  cwd?: string;
  metadata?: Record<string, unknown>;
}

/**
 * User message from JSONL
 */
interface UserMessage {
  type: 'message';
  id?: string;
  timestamp?: string;
  message: {
    role: 'user';
    content: Array<{ type: string; text?: string }>;
  };
}

/**
 * Assistant message from JSONL (contains usage/cost data)
 */
interface AssistantMessage {
  type: 'message';
  id?: string;
  timestamp?: string;
  message: {
    role: 'assistant';
    content: Array<{ type: string; text?: string; name?: string; arguments?: unknown }>;
    usage?: {
      inputTokens?: number;
      outputTokens?: number;
      input?: number;
      output?: number;
      totalTokens?: number;
      cost?: {
        input?: number;
        output?: number;
        total?: number;
      };
    };
    model?: string;
  };
}

/**
 * Tool result message from JSONL
 */
interface ToolResultMessage {
  type: 'message';
  id?: string;
  timestamp?: string;
  message: {
    role: 'toolResult';
    toolCallId?: string;
    toolName?: string;
    content: Array<{ type: string; text?: string }>;
    isError?: boolean;
    durationMs?: number;
  };
}

type JSONLLine = RawSessionLine | UserMessage | AssistantMessage | ToolResultMessage | { type: string };

/**
 * Derive agent ID from file path (e.g. agents/scout/sessions/abc.jsonl → scout)
 */
function deriveAgentIdFromPath(filePath: string): string {
  const match = filePath.match(/agents\/([^/]+)\/sessions\//);
  return match?.[1] ?? 'unknown';
}

/**
 * Normalize a raw session line into a consistent SessionMetadata shape
 */
function normalizeSessionMetadata(raw: RawSessionLine, filePath: string): SessionMetadata {
  return {
    type: 'session',
    sessionId: raw.sessionId ?? raw.id ?? randomUUID(),
    agentId: raw.agentId ?? deriveAgentIdFromPath(filePath),
    channel: raw.channel,
    createdAt: raw.createdAt ?? raw.timestamp,
    metadata: raw.metadata,
  };
}

/**
 * Compute file hash for import tracking
 */
async function computeFileHash(filePath: string): Promise<string> {
  const content = await readFile(filePath, 'utf-8');
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Parse timestamp to Unix milliseconds
 */
function parseTimestamp(timestamp: string | undefined, fallback: number): number {
  if (!timestamp) return fallback;
  const parsed = new Date(timestamp).getTime();
  return isNaN(parsed) ? fallback : parsed;
}

/**
 * Truncate preview text
 */
function truncatePreview(value: unknown, maxLength = 500): string {
  if (value === null || value === undefined) return '';

  let text: string;
  if (typeof value === 'string') {
    text = value;
  } else if (typeof value === 'object') {
    try {
      text = JSON.stringify(value);
    } catch {
      text = String(value);
    }
  } else {
    text = String(value);
  }

  return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
}

/**
 * Extract text preview from content blocks
 */
function extractContentPreview(
  content: Array<{ type: string; text?: string }> | undefined
): string {
  if (!content || !Array.isArray(content)) return '';

  const textBlocks = content
    .filter((block) => block.type === 'text' && block.text)
    .map((block) => block.text)
    .join(' ');

  return truncatePreview(textBlocks, 200);
}

/**
 * Import a single JSONL session file
 *
 * @param filePath - Path to JSONL file
 * @param writer - SpanWriter instance
 * @returns Import result
 */
export async function importSession(
  filePath: string,
  writer: SpanWriter
): Promise<ImportResult> {
  const startTime = Date.now();
  const result: ImportResult = {
    filePath,
    sessionId: null,
    spansCreated: 0,
    linesProcessed: 0,
    linesFailed: 0,
    errors: [],
    skipped: false,
    durationMs: 0,
  };

  try {
    // Check file stats
    const stats = await stat(filePath);
    if (stats.size === 0) {
      result.skipped = true;
      result.skippedReason = 'Empty file';
      result.durationMs = Date.now() - startTime;
      return result;
    }

    // Compute file hash
    const fileHash = await computeFileHash(filePath);

    // Check if already imported
    if (writer.isFileImported(filePath, fileHash)) {
      result.skipped = true;
      result.skippedReason = 'Already imported (hash matches)';
      result.durationMs = Date.now() - startTime;
      return result;
    }

    // Parse session file
    const spans = await parseSessionFile(filePath, result);

    // Write spans in batch transaction
    if (spans.length > 0) {
      writer.writeSpans(spans);
      result.spansCreated = spans.length;

      // Record import
      writer.recordImport(filePath, fileHash, spans.length);
    }

    result.durationMs = Date.now() - startTime;
    return result;
  } catch (error) {
    result.errors.push(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
    result.durationMs = Date.now() - startTime;
    return result;
  }
}

/**
 * Parse JSONL session file line by line
 */
async function parseSessionFile(filePath: string, result: ImportResult): Promise<Span[]> {
  const spans: Span[] = [];
  let sessionMetadata: SessionMetadata | null = null;
  let lineNumber = 0;

  // Track turn state
  let currentTurnSpanId: string | null = null;
  let currentTurnStartTs: number | null = null;
  let lastMessageTimestamp = Date.now();

  // Track tool calls for matching with results
  const pendingToolCalls = new Map<
    string,
    { toolName: string; spanId: string; startTs: number }
  >();

  // Create readline interface for streaming
  const fileStream = createReadStream(filePath, 'utf-8');
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    lineNumber++;
    result.linesProcessed++;

    // Skip empty lines
    if (!line.trim()) continue;

    try {
      const parsed = JSON.parse(line) as JSONLLine;

      // First line should be session metadata
      if (lineNumber === 1 && parsed.type === 'session') {
        sessionMetadata = normalizeSessionMetadata(parsed as RawSessionLine, filePath);
        result.sessionId = sessionMetadata.sessionId;

        // Create session span
        const sessionStartTs = parseTimestamp(
          sessionMetadata.createdAt,
          lastMessageTimestamp
        );
        const sessionSpan: Span = {
          id: randomUUID(),
          traceId: sessionMetadata.sessionId,
          parentId: null,
          sessionId: sessionMetadata.sessionId,
          sessionKey: null,
          agentId: sessionMetadata.agentId,
          channel: sessionMetadata.channel ?? null,
          accountId: null,
          conversationId: null,
          spanType: 'session',
          name: `Session ${sessionMetadata.sessionId.slice(0, 8)}`,
          startTs: sessionStartTs,
          endTs: null,
          durationMs: null,
          tokensIn: 0,
          tokensOut: 0,
          costUsd: 0,
          costInputUsd: 0,
          costOutputUsd: 0,
          model: null,
          provider: null,
          status: 'ok',
          errorMessage: null,
          runId: null,
          sequenceNum: null,
          source: 'jsonl',
          metadata: sessionMetadata.metadata ?? {},
          createdAt: Date.now(),
        };
        spans.push(sessionSpan);
        continue;
      }

      // Require session metadata before processing messages
      if (!sessionMetadata) {
        result.errors.push(`Line ${lineNumber}: Message before session metadata`);
        result.linesFailed++;
        continue;
      }

      // Skip non-message types (model_change, thinking_level_change, custom, etc.)
      if (parsed.type !== 'message') {
        continue;
      }

      if (parsed.type === 'message') {
        const msg = parsed as UserMessage | AssistantMessage | ToolResultMessage;
        const timestamp = parseTimestamp(msg.timestamp, lastMessageTimestamp);
        lastMessageTimestamp = timestamp;

        if (msg.message.role === 'user') {
          // User message - start a new turn
          const userMsg = msg as UserMessage;
          const turnSpanId = randomUUID();
          currentTurnSpanId = turnSpanId;
          currentTurnStartTs = timestamp;

          const turnSpan: Span = {
            id: turnSpanId,
            traceId: sessionMetadata.sessionId,
            parentId: spans[0].id, // Parent is session span
            sessionId: sessionMetadata.sessionId,
            sessionKey: null,
            agentId: sessionMetadata.agentId,
            channel: sessionMetadata.channel ?? null,
            accountId: null,
            conversationId: null,
            spanType: 'turn',
            name: `Turn ${timestamp}`,
            startTs: timestamp,
            endTs: null,
            durationMs: null,
            tokensIn: 0,
            tokensOut: 0,
            costUsd: 0,
            costInputUsd: 0,
            costOutputUsd: 0,
            model: null,
            provider: null,
            status: 'ok',
            errorMessage: null,
            runId: null,
            sequenceNum: null,
            source: 'jsonl',
            metadata: {
              userMessagePreview: extractContentPreview(userMsg.message.content),
              messageId: userMsg.id,
            },
            createdAt: Date.now(),
          };
          spans.push(turnSpan);
        } else if (msg.message.role === 'assistant') {
          // Assistant message - close turn and create llm_call span
          const assistantMsg = msg as AssistantMessage;

          // Create LLM call span with usage/cost data
          const llmSpan: Span = {
            id: randomUUID(),
            traceId: sessionMetadata.sessionId,
            parentId: currentTurnSpanId,
            sessionId: sessionMetadata.sessionId,
            sessionKey: null,
            agentId: sessionMetadata.agentId,
            channel: sessionMetadata.channel ?? null,
            accountId: null,
            conversationId: null,
            spanType: 'llm_call',
            name: `LLM Call: ${assistantMsg.message.model ?? 'unknown'}`,
            startTs: currentTurnStartTs ?? timestamp,
            endTs: timestamp,
            durationMs: currentTurnStartTs ? timestamp - currentTurnStartTs : null,
            tokensIn: assistantMsg.message.usage?.inputTokens ?? assistantMsg.message.usage?.input ?? 0,
            tokensOut: assistantMsg.message.usage?.outputTokens ?? assistantMsg.message.usage?.output ?? 0,
            costUsd: assistantMsg.message.usage?.cost?.total ?? 0,
            costInputUsd: assistantMsg.message.usage?.cost?.input ?? 0,
            costOutputUsd: assistantMsg.message.usage?.cost?.output ?? 0,
            model: assistantMsg.message.model ?? null,
            provider: deriveProvider(assistantMsg.message.model),
            status: 'ok',
            errorMessage: null,
            runId: null,
            sequenceNum: null,
            source: 'jsonl',
            metadata: {
              responsePreview: extractContentPreview(assistantMsg.message.content),
              messageId: assistantMsg.id,
            },
            createdAt: Date.now(),
          };
          spans.push(llmSpan);

          // Extract tool calls from content
          const toolCalls = assistantMsg.message.content.filter(
            (block) => block.type === 'toolCall'
          );
          for (const toolCall of toolCalls) {
            const toolCallBlock = toolCall as {
              type: 'toolCall';
              id?: string;
              name?: string;
              arguments?: unknown;
            };

            if (!toolCallBlock.id || !toolCallBlock.name) continue;

            // Create pending tool span (will be completed when tool result arrives)
            const toolSpanId = randomUUID();
            const toolSpan: Span = {
              id: toolSpanId,
              traceId: sessionMetadata.sessionId,
              parentId: currentTurnSpanId,
              sessionId: sessionMetadata.sessionId,
              sessionKey: null,
              agentId: sessionMetadata.agentId,
              channel: sessionMetadata.channel ?? null,
              accountId: null,
              conversationId: null,
              spanType: 'tool_exec',
              name: toolCallBlock.name,
              startTs: timestamp,
              endTs: null,
              durationMs: null,
              tokensIn: 0,
              tokensOut: 0,
              costUsd: 0,
              costInputUsd: 0,
              costOutputUsd: 0,
              model: null,
              provider: null,
              status: 'ok',
              errorMessage: null,
              runId: null,
              sequenceNum: null,
              source: 'jsonl',
              metadata: {
                toolName: toolCallBlock.name,
                toolArgsPreview: truncatePreview(toolCallBlock.arguments),
                toolCallId: toolCallBlock.id,
              },
              createdAt: Date.now(),
            };
            spans.push(toolSpan);

            // Track for matching with tool result
            pendingToolCalls.set(toolCallBlock.id, {
              toolName: toolCallBlock.name,
              spanId: toolSpanId,
              startTs: timestamp,
            });
          }

          // Close turn span
          if (currentTurnSpanId) {
            const turnSpan = spans.find((s) => s.id === currentTurnSpanId);
            if (turnSpan) {
              turnSpan.endTs = timestamp;
              turnSpan.durationMs = timestamp - turnSpan.startTs;
              turnSpan.tokensIn = llmSpan.tokensIn;
              turnSpan.tokensOut = llmSpan.tokensOut;
              turnSpan.costUsd = llmSpan.costUsd;
              turnSpan.costInputUsd = llmSpan.costInputUsd;
              turnSpan.costOutputUsd = llmSpan.costOutputUsd;
              turnSpan.model = llmSpan.model;
            }
          }
        } else if (msg.message.role === 'toolResult') {
          // Tool result - complete the pending tool span
          const toolResultMsg = msg as ToolResultMessage;
          const toolCallId = toolResultMsg.message.toolCallId;

          if (toolCallId && pendingToolCalls.has(toolCallId)) {
            const pending = pendingToolCalls.get(toolCallId)!;
            const toolSpan = spans.find((s) => s.id === pending.spanId);

            if (toolSpan) {
              toolSpan.endTs = timestamp;
              // If explicit duration provided, adjust startTs to match (since durationMs is GENERATED)
              if (toolResultMsg.message.durationMs !== undefined) {
                toolSpan.startTs = timestamp - toolResultMsg.message.durationMs;
                toolSpan.durationMs = toolResultMsg.message.durationMs;
              } else {
                toolSpan.durationMs = timestamp - pending.startTs;
              }
              toolSpan.status = toolResultMsg.message.isError ? 'error' : 'ok';
              toolSpan.metadata = {
                ...toolSpan.metadata,
                toolResultPreview: extractContentPreview(toolResultMsg.message.content),
                messageId: toolResultMsg.id,
              };
            }

            pendingToolCalls.delete(toolCallId);
          }
        }
      }
    } catch (error) {
      result.errors.push(
        `Line ${lineNumber}: ${error instanceof Error ? error.message : String(error)}`
      );
      result.linesFailed++;
      continue;
    }
  }

  // Close session span if we have one
  if (spans.length > 0 && spans[0].spanType === 'session') {
    spans[0].endTs = lastMessageTimestamp;
    spans[0].durationMs = lastMessageTimestamp - spans[0].startTs;

    // Aggregate session-level stats
    const childSpans = spans.slice(1);
    spans[0].tokensIn = childSpans.reduce((sum, s) => sum + s.tokensIn, 0);
    spans[0].tokensOut = childSpans.reduce((sum, s) => sum + s.tokensOut, 0);
    spans[0].costUsd = childSpans.reduce((sum, s) => sum + s.costUsd, 0);
    spans[0].costInputUsd = childSpans.reduce((sum, s) => sum + s.costInputUsd, 0);
    spans[0].costOutputUsd = childSpans.reduce((sum, s) => sum + s.costOutputUsd, 0);
  }

  return spans;
}

/**
 * Derive provider from model name
 */
function deriveProvider(model: string | undefined): string | null {
  if (!model) return null;

  if (model.startsWith('claude-')) return 'anthropic';
  if (model.startsWith('gpt-')) return 'openai';
  if (model.startsWith('gemini-')) return 'google';

  return null;
}

/**
 * Import all JSONL files matching a glob pattern
 *
 * @param pattern - Glob pattern for JSONL files
 * @param writer - SpanWriter instance
 * @returns Array of import results
 */
export async function importDirectory(
  pattern: string,
  writer: SpanWriter
): Promise<ImportResult[]> {
  const files = await glob(pattern, { absolute: true });
  const results: ImportResult[] = [];

  for (const file of files) {
    const result = await importSession(file, writer);
    results.push(result);
  }

  return results;
}
