import type { NewsItem, ThreatSignal, ThreatSeverity } from './types.js';
import { COIN_PATTERNS } from './lexicon.js';

interface ThreatRule {
  pattern: RegExp;
  severity: ThreatSeverity;
  scope: 'coin' | 'global';
}

const THREAT_RULES: ThreatRule[] = [
  // Critical: direct asset or protocol exploit/hack/drain
  {
    pattern: /\b(hack|hacked|exploit|exploited|drained?|stolen|breach|vulnerability)\b/i,
    severity: 'critical',
    scope: 'coin',
  },
  {
    pattern: /\b(rug\s?pull|rugpull|exit scam|ponzi|fraud|scam)\b/i,
    severity: 'critical',
    scope: 'coin',
  },

  // High: listing status & exchange freeze
  {
    pattern: /\b(delist|delisting|delisted|suspend|suspended|freeze|frozen)\b/i,
    severity: 'high',
    scope: 'coin',
  },
  {
    pattern: /\b(indodax (down|maintenance|gangguan|error))\b/i,
    severity: 'high',
    scope: 'global',
  },

  // Medium: enforcement & regulatory charges (Bare 'sec' is intentionally NOT a threat!)
  {
    pattern: /\b(sec charges?|indicted?|arrested?|lawsuit filed|bappebti (block|ban|suspend))\b/i,
    severity: 'medium',
    scope: 'coin',
  },
];

export function detectThreats(item: NewsItem): ThreatSignal[] {
  const signals: ThreatSignal[] = [];
  const text = `${item.title} ${item.description || ''}`;

  for (const rule of THREAT_RULES) {
    if (!rule.pattern.test(text)) continue;

    if (rule.scope === 'coin') {
      const coins = Object.entries(COIN_PATTERNS)
        .filter(([, re]) => re.test(text))
        .map(([s]) => s);

      // If no specific coin is mentioned in the threat headline, do NOT falsely block all coins!
      if (coins.length === 0) continue;

      for (const coin of coins) {
        signals.push({
          coin,
          severity: rule.severity,
          matchedRule: String(rule.pattern),
          headline: item.title,
          detectedAt: item.fetchedAt || Date.now(),
        });
      }
    } else {
      signals.push({
        coin: null, // global systemic threat
        severity: rule.severity,
        matchedRule: String(rule.pattern),
        headline: item.title,
        detectedAt: item.fetchedAt || Date.now(),
      });
    }
  }

  return signals;
}

/** Check if a symbol is blocked by an active threat (freshness: < 30 minutes) */
export function isSymbolThreatened(
  symbol: string,
  activeThreats: ThreatSignal[],
  now = Date.now(),
  freshnessMs = 30 * 60 * 1000
): boolean {
  const cleanSymbol = symbol.toUpperCase().replace('_IDR', '');
  return activeThreats.some((t) => {
    const isTargetCoin = t.coin === null || t.coin.toUpperCase() === cleanSymbol;
    const isFresh = now - t.detectedAt < freshnessMs;
    return isTargetCoin && isFresh;
  });
}
