export function getExtraFeedUrls(raw = process.env.AI_TRADING_EXTRA_RSS_FEEDS || ''): string[] {
  return raw
    .split(',')
    .map((url) => url.trim())
    .filter((url) => /^https?:\/\//i.test(url))
    .slice(0, 5);
}

export function feedSourceName(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'Extra RSS';
  }
}
