/**
 * CostBar component
 *
 * Horizontal bar showing cumulative cost as a running total, segmented by turn.
 * Each segment is colored by cost relative to session average.
 */

import { useMemo, useState } from 'react';
import type { SpanTree } from '../api/client';

interface CostBarProps {
  sessionTree: SpanTree;
}

interface TurnCost {
  turnId: string;
  turnNumber: number;
  cost: number;
  cumulativeCost: number;
  percentage: number;
}

export default function CostBar({ sessionTree }: CostBarProps) {
  const [hoveredTurn, setHoveredTurn] = useState<TurnCost | null>(null);

  // Extract turn costs from session tree
  const turnCosts = useMemo(() => {
    const turns = sessionTree.children.filter((child) => child.spanType === 'turn');
    const totalCost = sessionTree.costUsd || 0;

    let cumulative = 0;
    return turns.map((turn, index) => {
      cumulative += turn.costUsd;
      return {
        turnId: turn.id,
        turnNumber: index + 1,
        cost: turn.costUsd,
        cumulativeCost: cumulative,
        percentage: totalCost > 0 ? (turn.costUsd / totalCost) * 100 : 0,
      };
    });
  }, [sessionTree]);

  // Calculate average cost per turn
  const avgCostPerTurn = useMemo(() => {
    if (turnCosts.length === 0) return 0;
    return sessionTree.costUsd / turnCosts.length;
  }, [sessionTree.costUsd, turnCosts.length]);

  // Get color based on cost relative to average
  const getCostColor = (cost: number) => {
    if (cost < avgCostPerTurn * 0.5) return 'bg-green-500';
    if (cost < avgCostPerTurn * 1.5) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const formatCost = (cost: number) => {
    if (cost < 0.001) return `$${(cost * 1000).toFixed(2)}m`;
    return `$${cost.toFixed(4)}`;
  };

  return (
    <div className="bg-slate-800 rounded-lg p-4 border border-slate-700 sticky top-0 z-10">
      {/* Header */}
      <div className="flex justify-between items-center mb-3">
        <div className="text-sm font-medium text-slate-300">Session Cost</div>
        <div className="text-lg font-bold text-white">{formatCost(sessionTree.costUsd)}</div>
      </div>

      {/* Cost bar */}
      <div className="relative">
        <div className="flex h-8 rounded-lg overflow-hidden bg-slate-700">
          {turnCosts.map((turn) => (
            <div
              key={turn.turnId}
              className={`${getCostColor(turn.cost)} hover:opacity-80 transition-opacity cursor-pointer relative`}
              style={{ width: `${Math.max(turn.percentage, 2)}%` }}
              onMouseEnter={() => setHoveredTurn(turn)}
              onMouseLeave={() => setHoveredTurn(null)}
            >
              {/* Turn number label (only show if segment is wide enough) */}
              {turn.percentage > 8 && (
                <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-white/80">
                  T{turn.turnNumber}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Tooltip */}
        {hoveredTurn && (
          <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 shadow-lg z-20 min-w-[160px]">
            <div className="text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Turn</span>
                <span className="text-white font-medium">#{hoveredTurn.turnNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Turn cost</span>
                <span className="text-white font-mono">{formatCost(hoveredTurn.cost)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-700 pt-1 mt-1">
                <span className="text-slate-400">Cumulative</span>
                <span className="text-white font-mono">{formatCost(hoveredTurn.cumulativeCost)}</span>
              </div>
            </div>
            {/* Arrow */}
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900 border-l border-t border-slate-600 transform rotate-45"></div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex gap-4 mt-3 text-xs text-slate-400">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-green-500"></div>
          <span>Below avg</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-yellow-500"></div>
          <span>Near avg</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-red-500"></div>
          <span>Above avg</span>
        </div>
        <div className="ml-auto text-slate-500">
          Avg: {formatCost(avgCostPerTurn)}/turn
        </div>
      </div>
    </div>
  );
}
