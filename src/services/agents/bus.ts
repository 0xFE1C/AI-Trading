import { EventEmitter } from 'events';
import crypto from 'crypto';
import { db } from '../../db/index.js';

export type AgentTopic = 'opportunity.signal' | 'research.brief' | 'trade.proposal' | 'risk.verdict';

export interface AgentMessage<T = unknown> {
  id: string; // `msg_${Date.now()}_${randomHex}`
  topic: AgentTopic;
  from: string; // agentId / service
  correlationId?: string;
  ts: number;
  ttlMs: number;
  payload: T;
  tokenCost?: number;
}

export type MessageHandler<T = any> = (msg: AgentMessage<T>) => void | Promise<void>;

export class AgentBus {
  private emitter: EventEmitter;
  private insertStmt: any;

  constructor() {
    this.emitter = new EventEmitter({ captureRejections: true });
    this.emitter.setMaxListeners(50);

    // Global error listener to prevent uncaughtException crash
    this.emitter.on('error', (err) => {
      console.warn('[AgentBus Error]', err?.message || err);
    });

    try {
      this.insertStmt = db.prepare(`
        INSERT INTO agent_messages (id, topic, from_agent, correlation_id, ts, ttl_ms, payload, consumed_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
    } catch {
      // In case DB is not yet initialized
    }
  }

  public publish<T = unknown>(
    topic: AgentTopic,
    from: string,
    payload: T,
    options: { correlationId?: string; ttlMs?: number; tokenCost?: number } = {}
  ): AgentMessage<T> {
    const id = `msg_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const ts = Date.now();
    const ttlMs = options.ttlMs ?? 15 * 60 * 1000; // default 15 min TTL

    const msg: AgentMessage<T> = {
      id,
      topic,
      from,
      correlationId: options.correlationId,
      ts,
      ttlMs,
      payload,
      tokenCost: options.tokenCost ?? 0,
    };

    // 1. Durable outbox persistence in SQLite
    try {
      if (!this.insertStmt) {
        this.insertStmt = db.prepare(`
          INSERT INTO agent_messages (id, topic, from_agent, correlation_id, ts, ttl_ms, payload, consumed_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
      }
      this.insertStmt.run(
        msg.id,
        msg.topic,
        msg.from,
        msg.correlationId || null,
        msg.ts,
        msg.ttlMs,
        JSON.stringify(msg.payload),
        null
      );
    } catch (err: any) {
      console.warn('[AgentBus Outbox Warning] Gagal menyimpan message:', err?.message);
    }

    // 2. Dispatch in-process event
    this.emitter.emit(topic, msg);
    return msg;
  }

  public subscribe<T = unknown>(topic: AgentTopic, handler: MessageHandler<T>): () => void {
    const safeWrapper = async (msg: AgentMessage<T>) => {
      try {
        await Promise.resolve(handler(msg));
      } catch (err: any) {
        console.warn(`[AgentBus Handler Error on ${topic}]:`, err?.message || err);
      }
    };

    this.emitter.on(topic, safeWrapper);
    return () => {
      this.emitter.off(topic, safeWrapper);
    };
  }

  public getRecentMessages(topic?: AgentTopic, limit = 50): AgentMessage[] {
    try {
      const rows = topic
        ? (db.prepare(`
            SELECT * FROM agent_messages
            WHERE topic = ?
            ORDER BY ts DESC
            LIMIT ?
          `).all(topic, limit) as any[])
        : (db.prepare(`
            SELECT * FROM agent_messages
            ORDER BY ts DESC
            LIMIT ?
          `).all(limit) as any[]);

      return rows.map((r) => ({
        id: r.id,
        topic: r.topic,
        from: r.from_agent,
        correlationId: r.correlation_id,
        ts: r.ts,
        ttlMs: r.ttl_ms,
        payload: JSON.parse(r.payload || '{}'),
      }));
    } catch {
      return [];
    }
  }
}

export const agentBus = new AgentBus();
