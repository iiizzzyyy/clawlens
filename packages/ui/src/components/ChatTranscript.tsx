/**
 * ChatTranscript component
 *
 * Renders a session's turns as a chat-style conversation with
 * user/assistant message bubbles and collapsible tool call indicators.
 */

import { useState } from 'react';
import type { SpanTree } from '../api/client';

interface ChatTranscriptProps {
  sessionTree: SpanTree;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatCost(usd: number): string {
  if (usd < 0.001) return `$${usd.toFixed(6)}`;
  return `$${usd.toFixed(4)}`;
}

function formatTokens(tokensIn: number, tokensOut: number): string {
  const total = tokensIn + tokensOut;
  if (total >= 1000) return `${(total / 1000).toFixed(1)}k tokens`;
  return `${total} tokens`;
}

/** Collapsible tool call pill */
function ToolCallPill({ span }: { span: SpanTree }) {
  const [expanded, setExpanded] = useState(false);
  const toolName = (span.metadata?.toolName as string) || span.name || 'tool';
  const argsPreview = span.metadata?.toolArgsPreview as string | undefined;
  const resultPreview = span.metadata?.toolResultPreview as string | undefined;

  return (
    <div className="my-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded-full text-xs text-slate-400 hover:text-slate-300 transition-colors"
      >
        <span className="text-sm">&#x1f527;</span>
        <span className="font-mono">{toolName}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          className={`opacity-50 transition-transform ${expanded ? 'rotate-180' : ''}`}
        >
          <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {expanded && (
        <div className="mt-1 ml-4 p-2 bg-slate-800/60 border border-slate-700 rounded-lg text-xs font-mono space-y-2 max-w-lg">
          {argsPreview && (
            <div>
              <div className="text-slate-500 mb-0.5">Args</div>
              <div className="text-slate-300 whitespace-pre-wrap break-words">{argsPreview}</div>
            </div>
          )}
          {resultPreview && (
            <div>
              <div className="text-slate-500 mb-0.5">Result</div>
              <div className="text-slate-300 whitespace-pre-wrap break-words">{resultPreview}</div>
            </div>
          )}
          {!argsPreview && !resultPreview && (
            <div className="text-slate-500 italic">No preview available</div>
          )}
          {span.durationMs != null && (
            <div className="text-slate-500">{span.durationMs}ms</div>
          )}
        </div>
      )}
    </div>
  );
}

/** A single user message bubble (right-aligned, blue) */
function UserBubble({ text, timestamp }: { text: string; timestamp: number }) {
  return (
    <div className="flex flex-col items-end mb-4">
      <div className="max-w-[75%] px-4 py-2.5 bg-blue-600 text-white rounded-2xl rounded-br-md">
        <p className="text-sm whitespace-pre-wrap break-words">{text}</p>
      </div>
      <span className="text-[11px] text-slate-500 mt-1 mr-1">{formatTime(timestamp)}</span>
    </div>
  );
}

/** A single assistant message bubble (left-aligned, slate) */
function AssistantBubble({
  text,
  timestamp,
  costUsd,
  tokensIn,
  tokensOut,
}: {
  text: string;
  timestamp: number;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
}) {
  const hasCostInfo = costUsd > 0 || tokensIn + tokensOut > 0;

  return (
    <div className="flex flex-col items-start mb-4">
      <div className="max-w-[75%] px-4 py-2.5 bg-slate-700 text-slate-100 rounded-2xl rounded-bl-md">
        <p className="text-sm whitespace-pre-wrap break-words">{text}</p>
      </div>
      <div className="flex items-center gap-2 mt-1 ml-1">
        {hasCostInfo && (
          <span className="text-[11px] text-slate-500">
            {costUsd > 0 && <>{formatCost(costUsd)} &middot; </>}
            {formatTokens(tokensIn, tokensOut)}
            {' '}&middot;{' '}
          </span>
        )}
        <span className="text-[11px] text-slate-500">{formatTime(timestamp)}</span>
      </div>
    </div>
  );
}

export default function ChatTranscript({ sessionTree }: ChatTranscriptProps) {
  const turns = sessionTree.children.filter((child) => child.spanType === 'turn');

  if (turns.length === 0) {
    return (
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-8 text-center">
        <p className="text-slate-400">No conversation turns found in this session.</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 space-y-1">
      {turns.map((turn) => {
        const userMessage = turn.metadata?.userMessagePreview as string | undefined;
        const assistantMessage = turn.metadata?.assistantMessagePreview as string | undefined;
        const toolSpans = (turn.children || []).filter((c) => c.spanType === 'tool_exec');

        return (
          <div key={turn.id}>
            {/* User message */}
            {userMessage && (
              <UserBubble text={userMessage} timestamp={turn.startTs} />
            )}

            {/* Tool calls (between user and assistant, or standalone) */}
            {toolSpans.length > 0 && (
              <div className="flex flex-col items-start mb-3 ml-1">
                {toolSpans.map((tool) => (
                  <ToolCallPill key={tool.id} span={tool} />
                ))}
              </div>
            )}

            {/* Assistant message */}
            {assistantMessage && (
              <AssistantBubble
                text={assistantMessage}
                timestamp={turn.endTs || turn.startTs}
                costUsd={turn.costUsd}
                tokensIn={turn.tokensIn}
                tokensOut={turn.tokensOut}
              />
            )}

            {/* Fallback if turn has no message previews */}
            {!userMessage && !assistantMessage && (
              <div className="flex flex-col items-start mb-4">
                <div className="max-w-[75%] px-4 py-2.5 bg-slate-700/50 text-slate-400 rounded-2xl rounded-bl-md border border-slate-600/50 border-dashed">
                  <p className="text-sm italic">Turn {turn.sequenceNum ?? ''} (no message preview)</p>
                </div>
                <span className="text-[11px] text-slate-500 mt-1 ml-1">{formatTime(turn.startTs)}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
