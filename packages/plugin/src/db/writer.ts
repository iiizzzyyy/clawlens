/**
 * Span writer for SQLite database
 *
 * Handles writing spans to the database with batched inserts and transactions.
 */

import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { Span, SpanSource, SpanStatus, SpanType } from './types.js';
import { spanToRow } from './types.js';

/**
 * Input for creating a new span (without auto-generated fields)
 */
export interface SpanInput {
  traceId: string;
  parentId?: string | null;
  sessionId: string;
  sessionKey?: string | null;
  agentId: string;
  channel?: string | null;
  accountId?: string | null;
  conversationId?: string | null;
  spanType: SpanType;
  name: string;
  startTs: number;
  endTs?: number | null;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
  costInputUsd?: number;
  costOutputUsd?: number;
  model?: string | null;
  provider?: string | null;
  status?: SpanStatus;
  errorMessage?: string | null;
  runId?: string | null;
  sequenceNum?: number | null;
  source?: SpanSource;
  metadata?: Record<string, unknown>;
}

/**
 * Updates for ending a span
 */
export interface SpanEndUpdates {
  endTs: number;
  status?: SpanStatus;
  costUsd?: number;
  costInputUsd?: number;
  costOutputUsd?: number;
  tokensIn?: number;
  tokensOut?: number;
  errorMessage?: string | null;
  model?: string | null;
  provider?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * General span updates
 */
export interface SpanUpdates {
  endTs?: number;
  status?: SpanStatus;
  costUsd?: number;
  costInputUsd?: number;
  costOutputUsd?: number;
  tokensIn?: number;
  tokensOut?: number;
  errorMessage?: string | null;
  model?: string | null;
  provider?: string | null;
  source?: SpanSource;
  metadata?: Record<string, unknown>;
}

/**
 * SpanWriter class for database write operations
 */
export class SpanWriter {
  private db: Database.Database;
  private insertStmt: Database.Statement;
  private updateStmt: Database.Statement;

  constructor(db: Database.Database) {
    this.db = db;

    // Prepare insert statement
    this.insertStmt = db.prepare(`
      INSERT INTO spans (
        id, trace_id, parent_id, session_id, session_key, agent_id,
        channel, account_id, conversation_id,
        span_type, name, start_ts, end_ts,
        tokens_in, tokens_out, cost_usd, cost_input_usd, cost_output_usd,
        model, provider, status, error_message,
        run_id, sequence_num, source, metadata, created_at
      ) VALUES (
        @id, @trace_id, @parent_id, @session_id, @session_key, @agent_id,
        @channel, @account_id, @conversation_id,
        @span_type, @name, @start_ts, @end_ts,
        @tokens_in, @tokens_out, @cost_usd, @cost_input_usd, @cost_output_usd,
        @model, @provider, @status, @error_message,
        @run_id, @sequence_num, @source, @metadata, @created_at
      )
    `);

    // Prepare update statement for ending spans
    this.updateStmt = db.prepare(`
      UPDATE spans SET
        end_ts = COALESCE(@end_ts, end_ts),
        status = COALESCE(@status, status),
        cost_usd = COALESCE(@cost_usd, cost_usd),
        cost_input_usd = COALESCE(@cost_input_usd, cost_input_usd),
        cost_output_usd = COALESCE(@cost_output_usd, cost_output_usd),
        tokens_in = COALESCE(@tokens_in, tokens_in),
        tokens_out = COALESCE(@tokens_out, tokens_out),
        error_message = COALESCE(@error_message, error_message),
        model = COALESCE(@model, model),
        provider = COALESCE(@provider, provider),
        source = COALESCE(@source, source),
        metadata = CASE
          WHEN @metadata IS NOT NULL THEN @metadata
          ELSE metadata
        END
      WHERE id = @id
    `);
  }

  /**
   * Write a single span to the database
   */
  writeSpan(span: Span): void {
    const row = spanToRow(span);
    this.insertStmt.run(row);
  }

  /**
   * Write multiple spans in a single transaction (batched insert)
   */
  writeSpans(spans: Span[]): void {
    if (spans.length === 0) return;

    const insertMany = this.db.transaction((spans: Span[]) => {
      for (const span of spans) {
        const row = spanToRow(span);
        this.insertStmt.run(row);
      }
    });

    insertMany(spans);
  }

  /**
   * Start a new span and return its ID
   *
   * Creates a span without an end timestamp (in-progress)
   */
  startSpan(input: SpanInput): string {
    const id = randomUUID();
    const now = Date.now();

    const span: Span = {
      id,
      traceId: input.traceId,
      parentId: input.parentId ?? null,
      sessionId: input.sessionId,
      sessionKey: input.sessionKey ?? null,
      agentId: input.agentId,
      channel: input.channel ?? null,
      accountId: input.accountId ?? null,
      conversationId: input.conversationId ?? null,
      spanType: input.spanType,
      name: input.name,
      startTs: input.startTs,
      endTs: input.endTs ?? null,
      durationMs: null, // Computed by SQLite
      tokensIn: input.tokensIn ?? 0,
      tokensOut: input.tokensOut ?? 0,
      costUsd: input.costUsd ?? 0,
      costInputUsd: input.costInputUsd ?? 0,
      costOutputUsd: input.costOutputUsd ?? 0,
      model: input.model ?? null,
      provider: input.provider ?? null,
      status: input.status ?? 'ok',
      errorMessage: input.errorMessage ?? null,
      runId: input.runId ?? null,
      sequenceNum: input.sequenceNum ?? null,
      source: input.source ?? 'hook',
      metadata: input.metadata ?? {},
      createdAt: now,
    };

    this.writeSpan(span);
    return id;
  }

  /**
   * End an in-progress span
   *
   * Sets the end timestamp and optionally updates cost/status fields
   */
  endSpan(id: string, updates: SpanEndUpdates): void {
    this.updateStmt.run({
      id,
      end_ts: updates.endTs,
      status: updates.status ?? null,
      cost_usd: updates.costUsd ?? null,
      cost_input_usd: updates.costInputUsd ?? null,
      cost_output_usd: updates.costOutputUsd ?? null,
      tokens_in: updates.tokensIn ?? null,
      tokens_out: updates.tokensOut ?? null,
      error_message: updates.errorMessage ?? null,
      model: updates.model ?? null,
      provider: updates.provider ?? null,
      source: null,
      metadata: updates.metadata ? JSON.stringify(updates.metadata) : null,
    });
  }

  /**
   * Update an existing span with partial updates
   */
  updateSpan(id: string, updates: SpanUpdates): void {
    this.updateStmt.run({
      id,
      end_ts: updates.endTs ?? null,
      status: updates.status ?? null,
      cost_usd: updates.costUsd ?? null,
      cost_input_usd: updates.costInputUsd ?? null,
      cost_output_usd: updates.costOutputUsd ?? null,
      tokens_in: updates.tokensIn ?? null,
      tokens_out: updates.tokensOut ?? null,
      error_message: updates.errorMessage ?? null,
      model: updates.model ?? null,
      provider: updates.provider ?? null,
      source: updates.source ?? null,
      metadata: updates.metadata ? JSON.stringify(updates.metadata) : null,
    });
  }

  /**
   * Record a JSONL file import
   */
  recordImport(filePath: string, fileHash: string, spansCreated: number): void {
    this.db
      .prepare(
        `
      INSERT OR REPLACE INTO imports (file_path, file_hash, imported_at, spans_created)
      VALUES (?, ?, ?, ?)
    `
      )
      .run(filePath, fileHash, Date.now(), spansCreated);
  }

  /**
   * Check if a file has already been imported
   */
  isFileImported(filePath: string, fileHash: string): boolean {
    const row = this.db
      .prepare('SELECT file_hash FROM imports WHERE file_path = ?')
      .get(filePath) as { file_hash: string } | undefined;
    return row?.file_hash === fileHash;
  }

  /**
   * Update daily stats aggregate
   */
  updateDailyStats(
    date: string,
    agentId: string,
    channel: string | null,
    model: string | null,
    stats: {
      spans?: number;
      errors?: number;
      cost?: number;
      tokens?: number;
      duration?: number;
    }
  ): void {
    this.db
      .prepare(
        `
      INSERT INTO daily_stats (date, agent_id, channel, model, total_spans, total_errors, total_cost, total_tokens, avg_duration)
      VALUES (@date, @agent_id, @channel, @model, @spans, @errors, @cost, @tokens, @duration)
      ON CONFLICT (date, agent_id, channel, model) DO UPDATE SET
        total_spans = total_spans + @spans,
        total_errors = total_errors + @errors,
        total_cost = total_cost + @cost,
        total_tokens = total_tokens + @tokens,
        avg_duration = (avg_duration * total_spans + @duration) / (total_spans + @spans)
    `
      )
      .run({
        date,
        agent_id: agentId,
        channel: channel ?? '',
        model: model ?? '',
        spans: stats.spans ?? 0,
        errors: stats.errors ?? 0,
        cost: stats.cost ?? 0,
        tokens: stats.tokens ?? 0,
        duration: stats.duration ?? 0,
      });
  }
}

/**
 * Create a new SpanWriter instance
 */
export function createSpanWriter(db: Database.Database): SpanWriter {
  return new SpanWriter(db);
}
