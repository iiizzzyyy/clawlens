/**
 * OpenClaw configuration reader
 *
 * Reads agent metadata from ~/.openclaw/openclaw.json with TTL-based caching.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface AgentConfigEntry {
  id: string;
  name: string;
  emoji: string | null;
  model: string | null;
  provider: string | null;
  channels: string[];
}

interface Logger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

interface CacheEntry {
  data: AgentConfigEntry[];
  readAt: number;
}

const TTL_MS = 30_000;

export class OpenClawConfigReader {
  private configPath: string;
  private logger: Logger;
  private cache: CacheEntry | null = null;

  constructor(configPath: string | undefined, logger: Logger) {
    this.configPath = configPath || join(homedir(), '.openclaw', 'openclaw.json');
    this.logger = logger;
  }

  getAgents(): AgentConfigEntry[] {
    const now = Date.now();
    if (this.cache && now - this.cache.readAt < TTL_MS) {
      return this.cache.data;
    }

    try {
      const raw = readFileSync(this.configPath, 'utf-8');
      const config = JSON.parse(raw);
      const agents = this.parseAgents(config);
      this.cache = { data: agents, readAt: now };
      return agents;
    } catch (error) {
      this.logger.warn('[clawlens] Failed to read openclaw.json:', error);
      return this.cache?.data ?? [];
    }
  }

  private parseAgents(config: Record<string, unknown>): AgentConfigEntry[] {
    const agents = config.agents as Record<string, unknown> | undefined;
    if (!agents) return [];

    const list = agents.list as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(list)) return [];

    const defaults = agents.defaults as Record<string, unknown> | undefined;
    const defaultModel = this.resolveDefaultModel(defaults);
    const channels = this.parseChannels(config);

    return list.map((entry) => {
      const id = String(entry.id || '');
      const name = String(entry.name || id);
      const model = entry.model ? String(entry.model) : defaultModel;
      const provider = model ? this.extractProvider(model) : null;

      return {
        id,
        name,
        emoji: null,
        model,
        provider,
        channels,
      };
    });
  }

  private resolveDefaultModel(defaults: Record<string, unknown> | undefined): string | null {
    if (!defaults) return null;
    const model = defaults.model as Record<string, unknown> | undefined;
    if (!model) return null;
    return model.primary ? String(model.primary) : null;
  }

  private extractProvider(model: string): string | null {
    const slashIndex = model.indexOf('/');
    return slashIndex > 0 ? model.slice(0, slashIndex) : null;
  }

  private parseChannels(config: Record<string, unknown>): string[] {
    const channels = config.channels as Record<string, unknown> | undefined;
    if (!channels) return [];
    return Object.keys(channels).filter((key) => {
      const ch = channels[key] as Record<string, unknown> | undefined;
      return ch && ch.enabled !== false;
    });
  }
}
