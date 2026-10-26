import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { SUBAGENT_DEFINITIONS } from '../src/services/agents/index.js';
import { feedSourceName, getExtraFeedUrls } from '../src/services/agents/extraFeeds.js';

describe('AI subagent source honesty', () => {
  test('all definitions advertise only implemented data sources', () => {
    assert.strictEqual(SUBAGENT_DEFINITIONS.length, 10);
    for (const agent of SUBAGENT_DEFINITIONS) {
      const text = agent.sources.join(' ');
      assert.doesNotMatch(
        text,
        /Twitter|Reddit|on-chain|Whale|CoinGecko|LunarCrush|Bappebti|Binance|Bybit/i,
        `${agent.name} advertises an unimplemented source`
      );
      assert.ok(agent.sources.length > 0);
    }
  });

  test('extra feed parser accepts only http(s) URLs', () => {
    assert.deepStrictEqual(
      getExtraFeedUrls('https://a.example/rss, ftp://bad.example, http://b.example/feed, javascript:alert(1),\n'),
      ['https://a.example/rss', 'http://b.example/feed']
    );
  });

  test('extra feed parser caps configured feeds at five', () => {
    const raw = Array.from({ length: 8 }, (_, i) => `https://feed${i}.example/rss`).join(',');
    const urls = getExtraFeedUrls(raw);
    assert.strictEqual(urls.length, 5);
    assert.deepStrictEqual(urls, raw.split(',').slice(0, 5));
  });

  test('feed source labels use the hostname', () => {
    assert.strictEqual(feedSourceName('https://www.reddit.com/r/CryptoCurrency/.rss'), 'www.reddit.com');
    assert.strictEqual(feedSourceName('not a url'), 'Extra RSS');
  });
});
