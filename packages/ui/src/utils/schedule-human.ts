/**
 * Convert cron schedule objects to human-readable text
 */

import type { CronSchedule } from '../api/client';

export function formatSchedule(schedule: CronSchedule): string {
  switch (schedule.kind) {
    case 'cron':
      return formatCronExpr(schedule.expr || '');
    case 'at':
      return formatAtSchedule(schedule.at || '');
    case 'every':
      return formatEverySchedule(schedule.everyMs || 0);
    default:
      return 'unknown schedule';
  }
}

function formatCronExpr(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5) return expr;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // every N hours: "0 */6 * * *"
  if (minute === '0' && hour.startsWith('*/') && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    const n = parseInt(hour.slice(2), 10);
    return n === 1 ? 'every hour' : `every ${n} hours`;
  }

  // every N minutes: "*/30 * * * *"
  if (minute.startsWith('*/') && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    const n = parseInt(minute.slice(2), 10);
    return n === 1 ? 'every minute' : `every ${n} minutes`;
  }

  // fixed time patterns
  if (dayOfMonth === '*' && month === '*') {
    const timeStr = formatTime(parseInt(hour, 10), parseInt(minute, 10));

    // daily: "0 5 * * *"
    if (dayOfWeek === '*') {
      return `daily at ${timeStr}`;
    }

    // weekdays: "0 9 * * 1-5"
    if (dayOfWeek === '1-5') {
      return `weekdays at ${timeStr}`;
    }

    // weekends: "0 10 * * 0,6" or "0 10 * * 6,0"
    if (dayOfWeek === '0,6' || dayOfWeek === '6,0') {
      return `weekends at ${timeStr}`;
    }

    // specific day
    const dayName = parseDayOfWeek(dayOfWeek);
    if (dayName) {
      return `${dayName} at ${timeStr}`;
    }
  }

  // fallback: raw expression
  return expr;
}

function formatTime(hour: number, minute: number): string {
  if (isNaN(hour) || isNaN(minute)) return '??';
  const period = hour >= 12 ? 'PM' : 'AM';
  const h = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const m = minute.toString().padStart(2, '0');
  return `${h}:${m} ${period}`;
}

function parseDayOfWeek(dow: string): string | null {
  const days: Record<string, string> = {
    '0': 'Sundays',
    '1': 'Mondays',
    '2': 'Tuesdays',
    '3': 'Wednesdays',
    '4': 'Thursdays',
    '5': 'Fridays',
    '6': 'Saturdays',
    '7': 'Sundays',
  };
  return days[dow] || null;
}

function formatAtSchedule(at: string): string {
  try {
    const date = new Date(at);
    return `once at ${date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })} ${date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    })}`;
  } catch {
    return `once at ${at}`;
  }
}

function formatEverySchedule(everyMs: number): string {
  if (everyMs <= 0) return 'unknown interval';
  const hours = everyMs / 3_600_000;
  if (hours >= 1 && hours === Math.floor(hours)) {
    return hours === 1 ? 'every hour' : `every ${hours} hours`;
  }
  const minutes = everyMs / 60_000;
  if (minutes >= 1 && minutes === Math.floor(minutes)) {
    return minutes === 1 ? 'every minute' : `every ${minutes} minutes`;
  }
  const seconds = everyMs / 1000;
  return `every ${seconds}s`;
}
