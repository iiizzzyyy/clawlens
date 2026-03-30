/**
 * Memory Browser page — browse agent workspace files with snapshot history and diffs
 */

import { useState, useEffect, useCallback } from 'react';
import {
  fetchMemoryFiles,
  fetchMemoryFileContent,
  fetchMemoryHistory,
  fetchMemoryDiff,
  type MemoryFile,
  type MemoryFileContent,
  type MemorySnapshotMeta,
  type MemoryDiffResult,
} from '../api/client';

// =============================================================================
// File tree sidebar
// =============================================================================

interface FileTreeProps {
  files: MemoryFile[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

function buildTree(files: MemoryFile[]): Map<string, MemoryFile[]> {
  const groups = new Map<string, MemoryFile[]>();
  for (const f of files) {
    const parts = f.path.split('/');
    const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '.';
    const existing = groups.get(dir);
    if (existing) {
      existing.push(f);
    } else {
      groups.set(dir, [f]);
    }
  }
  return groups;
}

function FileTree({ files, selectedPath, onSelect }: FileTreeProps) {
  const tree = buildTree(files);
  const dirs = Array.from(tree.keys()).sort();

  return (
    <div className="space-y-3">
      {dirs.map((dir) => (
        <div key={dir}>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 px-2">
            {dir === '.' ? 'Root' : dir}
          </div>
          <ul className="space-y-0.5">
            {tree.get(dir)!.map((file) => (
              <li key={file.path}>
                <button
                  onClick={() => onSelect(file.path)}
                  className={`w-full text-left px-2 py-1.5 rounded text-sm truncate transition-colors ${
                    selectedPath === file.path
                      ? 'bg-slate-600 text-white'
                      : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                  }`}
                  title={file.path}
                >
                  {file.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// Diff display
// =============================================================================

interface DiffViewProps {
  diff: string;
}

function DiffView({ diff }: DiffViewProps) {
  const lines = diff.split('\n');

  return (
    <pre className="text-sm font-mono leading-relaxed overflow-x-auto">
      {lines.map((line, i) => {
        let className = 'text-slate-300';

        if (line.startsWith('+')) {
          className = 'text-green-400 bg-green-900/30';
        } else if (line.startsWith('-')) {
          className = 'text-red-400 bg-red-900/30';
        }

        return (
          <div key={i} className={`${className} px-3 py-0.5`}>
            {line.length > 0 ? line : '\u00A0'}
          </div>
        );
      })}
    </pre>
  );
}

// =============================================================================
// History panel
// =============================================================================

interface HistoryPanelProps {
  snapshots: MemorySnapshotMeta[];
  selectedSnapshots: [number | null, number | null];
  onToggleSnapshot: (capturedAt: number) => void;
  onViewSnapshot: (capturedAt: number) => void;
  loading: boolean;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function HistoryPanel({
  snapshots,
  selectedSnapshots,
  onToggleSnapshot,
  onViewSnapshot,
  loading,
}: HistoryPanelProps) {
  if (loading) {
    return <div className="text-slate-400 text-sm p-3">Loading history...</div>;
  }

  if (snapshots.length === 0) {
    return (
      <div className="text-slate-400 text-sm p-3">
        No snapshots yet. Snapshots are captured every 5 minutes when files change.
      </div>
    );
  }

  const [fromTs, toTs] = selectedSnapshots;

  return (
    <div className="space-y-1">
      <div className="text-xs text-slate-400 px-3 mb-2">
        Click to view a version. Select two to compare.
      </div>
      {snapshots.map((snap) => {
        const isFrom = fromTs === snap.capturedAt;
        const isTo = toTs === snap.capturedAt;
        const isSelected = isFrom || isTo;

        return (
          <div
            key={snap.id}
            className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm cursor-pointer transition-colors ${
              isSelected
                ? 'bg-slate-600 text-white'
                : 'text-slate-300 hover:bg-slate-700'
            }`}
          >
            <button
              onClick={() => onToggleSnapshot(snap.capturedAt)}
              className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center text-xs ${
                isSelected
                  ? 'bg-blue-500 border-blue-400 text-white'
                  : 'border-slate-500 hover:border-slate-400'
              }`}
              title={isFrom ? 'From (older)' : isTo ? 'To (newer)' : 'Select for diff'}
            >
              {isFrom ? 'A' : isTo ? 'B' : ''}
            </button>
            <button
              onClick={() => onViewSnapshot(snap.capturedAt)}
              className="flex-1 text-left truncate"
            >
              {formatTime(snap.capturedAt)}
            </button>
            <span className="text-xs text-slate-500 flex-shrink-0">
              {snap.contentHash.slice(0, 8)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// Main Memory page
// =============================================================================

type ViewMode = 'current' | 'snapshot' | 'diff';

export default function Memory() {
  const [files, setFiles] = useState<MemoryFile[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<MemoryFileContent | null>(null);
  const [snapshots, setSnapshots] = useState<MemorySnapshotMeta[]>([]);
  const [selectedSnapshots, setSelectedSnapshots] = useState<[number | null, number | null]>([
    null,
    null,
  ]);
  const [diffResult, setDiffResult] = useState<MemoryDiffResult | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('current');
  const [snapshotContent, setSnapshotContent] = useState<string | null>(null);

  const [loadingFiles, setLoadingFiles] = useState(true);
  const [loadingContent, setLoadingContent] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load file list
  useEffect(() => {
    setLoadingFiles(true);
    fetchMemoryFiles()
      .then((data) => {
        setFiles(data);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoadingFiles(false));
  }, []);

  // Load file content when a file is selected
  useEffect(() => {
    if (!selectedPath) {
      setFileContent(null);
      return;
    }
    setLoadingContent(true);
    setViewMode('current');
    setSelectedSnapshots([null, null]);
    setDiffResult(null);
    setSnapshotContent(null);

    Promise.all([
      fetchMemoryFileContent(selectedPath),
      fetchMemoryHistory(selectedPath).then(setSnapshots).catch(() => setSnapshots([])),
    ])
      .then(([content]) => {
        setFileContent(content);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => {
        setLoadingContent(false);
        setLoadingHistory(false);
      });

    setLoadingHistory(true);
  }, [selectedPath]);

  // Handle toggling a snapshot for diff selection
  const handleToggleSnapshot = useCallback(
    (capturedAt: number) => {
      setSelectedSnapshots((prev) => {
        const [from, to] = prev;
        if (from === capturedAt) return [null, to];
        if (to === capturedAt) return [from, null];
        if (from === null) return [capturedAt, to];
        if (to === null) return [from, capturedAt];
        // Both filled — replace the older selection
        return [from, capturedAt];
      });
    },
    []
  );

  // Handle viewing a single snapshot
  const handleViewSnapshot = useCallback(
    (capturedAt: number) => {
      if (!selectedPath) return;
      setLoadingDiff(true);
      setViewMode('snapshot');

      // Fetch via diff endpoint with from=0 to get the snapshot content
      // Actually, we'll use the diff endpoint to get content at that point
      fetchMemoryDiff(selectedPath, capturedAt, capturedAt)
        .then((result) => {
          // The diff of a snapshot with itself will be all context lines
          // Parse out the content from the diff result
          const lines = result.diff.split('\n');
          const content = lines
            .map((l) => (l.startsWith(' ') ? l.slice(1) : l.startsWith('+') ? l.slice(1) : null))
            .filter((l): l is string => l !== null)
            .join('\n');
          setSnapshotContent(content);
          setError(null);
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoadingDiff(false));
    },
    [selectedPath]
  );

  // Compute diff when two snapshots are selected
  useEffect(() => {
    const [from, to] = selectedSnapshots;
    if (!selectedPath || from === null || to === null) {
      if (viewMode === 'diff') setViewMode('current');
      return;
    }

    const actualFrom = Math.min(from, to);
    const actualTo = Math.max(from, to);

    setLoadingDiff(true);
    setViewMode('diff');

    fetchMemoryDiff(selectedPath, actualFrom, actualTo)
      .then((result) => {
        setDiffResult(result);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoadingDiff(false));
  }, [selectedSnapshots, selectedPath]);

  return (
    <div className="-m-6">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-700">
        <h1 className="text-2xl font-bold text-white">Memory Browser</h1>
        <p className="text-sm text-slate-400 mt-1">
          Browse agent workspace files and track changes over time
        </p>
      </div>

      {error && (
        <div className="mx-6 mt-4 px-4 py-2 bg-red-900/40 border border-red-700 rounded text-red-300 text-sm">
          {error}
        </div>
      )}

      <div className="flex" style={{ height: 'calc(100vh - 120px)' }}>
        {/* Left sidebar: File tree */}
        <div className="w-56 flex-shrink-0 bg-slate-800 border-r border-slate-700 overflow-y-auto p-3">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Workspace Files
          </div>
          {loadingFiles ? (
            <div className="text-slate-400 text-sm">Loading...</div>
          ) : files.length === 0 ? (
            <div className="text-slate-500 text-sm">No .md files found</div>
          ) : (
            <FileTree files={files} selectedPath={selectedPath} onSelect={setSelectedPath} />
          )}
        </div>

        {/* Main content area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {!selectedPath ? (
            <div className="flex-1 flex items-center justify-center text-slate-500">
              Select a file to view its content
            </div>
          ) : loadingContent ? (
            <div className="flex-1 flex items-center justify-center text-slate-400">
              Loading...
            </div>
          ) : (
            <>
              {/* File header with view mode tabs */}
              <div className="px-4 py-2 border-b border-slate-700 flex items-center gap-4 bg-slate-800/50">
                <span className="text-sm font-medium text-white truncate">{selectedPath}</span>
                <div className="flex gap-1 ml-auto">
                  <button
                    onClick={() => {
                      setViewMode('current');
                      setSelectedSnapshots([null, null]);
                    }}
                    className={`px-3 py-1 text-xs rounded transition-colors ${
                      viewMode === 'current'
                        ? 'bg-slate-600 text-white'
                        : 'text-slate-400 hover:text-white hover:bg-slate-700'
                    }`}
                  >
                    Current
                  </button>
                  {viewMode === 'snapshot' && (
                    <button
                      className="px-3 py-1 text-xs rounded bg-slate-600 text-white"
                    >
                      Snapshot
                    </button>
                  )}
                  {viewMode === 'diff' && (
                    <button
                      className="px-3 py-1 text-xs rounded bg-slate-600 text-white"
                    >
                      Diff
                    </button>
                  )}
                </div>
              </div>

              {/* File content / diff viewer */}
              <div className="flex-1 overflow-auto p-4">
                {viewMode === 'current' && fileContent && (
                  <pre className="text-sm font-mono text-slate-300 whitespace-pre-wrap leading-relaxed">
                    {fileContent.content}
                  </pre>
                )}
                {viewMode === 'snapshot' && (
                  loadingDiff ? (
                    <div className="text-slate-400 text-sm">Loading snapshot...</div>
                  ) : snapshotContent !== null ? (
                    <pre className="text-sm font-mono text-slate-300 whitespace-pre-wrap leading-relaxed">
                      {snapshotContent}
                    </pre>
                  ) : (
                    <div className="text-slate-500 text-sm">No snapshot data</div>
                  )
                )}
                {viewMode === 'diff' && (
                  loadingDiff ? (
                    <div className="text-slate-400 text-sm">Computing diff...</div>
                  ) : diffResult ? (
                    <DiffView diff={diffResult.diff} />
                  ) : (
                    <div className="text-slate-500 text-sm">Select two snapshots to compare</div>
                  )
                )}
              </div>
            </>
          )}
        </div>

        {/* Right sidebar: History panel */}
        {selectedPath && (
          <div className="w-64 flex-shrink-0 bg-slate-800 border-l border-slate-700 overflow-y-auto">
            <div className="p-3 border-b border-slate-700">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Snapshot History
              </div>
            </div>
            <div className="p-2">
              <HistoryPanel
                snapshots={snapshots}
                selectedSnapshots={selectedSnapshots}
                onToggleSnapshot={handleToggleSnapshot}
                onViewSnapshot={handleViewSnapshot}
                loading={loadingHistory}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
