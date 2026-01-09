/**
 * BFS Crawler
 * Breadth-first crawling of pages by following internal links
 */

import { Page } from 'playwright';

export interface BfsCrawlerOptions {
  maxPages: number;
  maxDepth: number;
  allowDomains?: string[];
  denyPatterns?: string[];
  respectRobotsTxt?: boolean;
  sameDomainOnly?: boolean;
}

interface CrawlQueueItem {
  url: string;
  depth: number;
  referrer?: string;
}

export class BfsCrawler {
  private options: BfsCrawlerOptions;
  private visited: Set<string> = new Set();
  private disallowedPaths: Set<string> = new Set();

  constructor(options: Partial<BfsCrawlerOptions> = {}) {
    this.options = {
      maxPages: 50,
      maxDepth: 3,
      respectRobotsTxt: true,
      sameDomainOnly: true,
      ...options,
    };
  }

  /**
   * Crawl starting from a seed URL
   */
  async crawl(
    startUrl: string,
    page: Page,
    onPageVisited?: (url: string, depth: number) => void
  ): Promise<string[]> {
    const discoveredUrls: string[] = [];
    const queue: CrawlQueueItem[] = [{ url: startUrl, depth: 0 }];

    // Parse start URL for domain filtering
    const startParsed = new URL(startUrl);
    const startDomain = startParsed.hostname;

    // Fetch robots.txt if needed
    if (this.options.respectRobotsTxt) {
      await this.fetchRobotsTxt(startParsed.origin);
    }

    while (queue.length > 0 && discoveredUrls.length < this.options.maxPages) {
      const item = queue.shift()!;
      const normalizedUrl = this.normalizeUrl(item.url);

      // Skip if already visited
      if (this.visited.has(normalizedUrl)) continue;

      // Skip if exceeds max depth
      if (item.depth > this.options.maxDepth) continue;

      // Skip if disallowed by robots.txt
      if (this.isDisallowed(item.url)) continue;

      // Skip if doesn't match allowed domains
      if (!this.isAllowed(item.url, startDomain)) continue;

      // Mark as visited
      this.visited.add(normalizedUrl);
      discoveredUrls.push(item.url);

      // Notify callback
      if (onPageVisited) {
        onPageVisited(item.url, item.depth);
      }

      // Stop if we've reached max pages
      if (discoveredUrls.length >= this.options.maxPages) break;

      // Don't crawl deeper if at max depth
      if (item.depth >= this.options.maxDepth) continue;

      // Extract links from the page
      try {
        await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        const links = await this.extractLinks(page, startDomain);

        // Add new links to queue
        for (const link of links) {
          const normalizedLink = this.normalizeUrl(link);
          if (!this.visited.has(normalizedLink)) {
            queue.push({
              url: link,
              depth: item.depth + 1,
              referrer: item.url,
            });
          }
        }
      } catch (error) {
        console.error(`Failed to crawl ${item.url}:`, error);
      }
    }

    return discoveredUrls;
  }

  /**
   * Extract internal links from a page
   */
  private async extractLinks(page: Page, baseDomain: string): Promise<string[]> {
    const links = await page.evaluate((domain) => {
      const anchors = document.querySelectorAll('a[href]');
      const urls: string[] = [];

      anchors.forEach((anchor) => {
        try {
          const href = anchor.getAttribute('href');
          if (!href) return;

          // Skip non-http links
          if (
            href.startsWith('mailto:') ||
            href.startsWith('tel:') ||
            href.startsWith('javascript:') ||
            href.startsWith('#')
          ) {
            return;
          }

          // Resolve relative URLs
          const resolved = new URL(href, window.location.href);

          // Only include http/https
          if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
            return;
          }

          urls.push(resolved.href);
        } catch {
          // Invalid URL, skip
        }
      });

      return urls;
    }, baseDomain);

    // Filter links
    return links.filter((url) => {
      try {
        const parsed = new URL(url);

        // Same domain only (if enabled)
        if (this.options.sameDomainOnly && parsed.hostname !== baseDomain) {
          return false;
        }

        // Check allowed domains
        if (this.options.allowDomains && this.options.allowDomains.length > 0) {
          const isAllowed = this.options.allowDomains.some(
            (domain) =>
              parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)
          );
          if (!isAllowed) return false;
        }

        // Check deny patterns
        if (this.options.denyPatterns && this.options.denyPatterns.length > 0) {
          const isDenied = this.options.denyPatterns.some((pattern) => {
            try {
              return new RegExp(pattern).test(url);
            } catch {
              return url.includes(pattern);
            }
          });
          if (isDenied) return false;
        }

        return true;
      } catch {
        return false;
      }
    });
  }

  /**
   * Fetch and parse robots.txt
   */
  private async fetchRobotsTxt(origin: string): Promise<void> {
    try {
      const response = await fetch(`${origin}/robots.txt`);
      if (!response.ok) return;

      const text = await response.text();
      const lines = text.split('\n');

      let appliesToUs = false;
      for (const line of lines) {
        const trimmed = line.trim().toLowerCase();

        if (trimmed.startsWith('user-agent:')) {
          const agent = trimmed.replace('user-agent:', '').trim();
          appliesToUs = agent === '*' || agent.includes('bot');
        }

        if (appliesToUs && trimmed.startsWith('disallow:')) {
          const path = line.replace(/disallow:/i, '').trim();
          if (path) {
            this.disallowedPaths.add(path);
          }
        }
      }
    } catch {
      // Ignore robots.txt errors
    }
  }

  /**
   * Check if a URL is disallowed by robots.txt
   */
  private isDisallowed(url: string): boolean {
    try {
      const parsed = new URL(url);
      const path = parsed.pathname;

      for (const disallowed of this.disallowedPaths) {
        if (disallowed.endsWith('*')) {
          const prefix = disallowed.slice(0, -1);
          if (path.startsWith(prefix)) return true;
        } else if (path.startsWith(disallowed)) {
          return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Check if a URL is allowed by configuration
   */
  private isAllowed(url: string, baseDomain: string): boolean {
    try {
      const parsed = new URL(url);

      // Same domain check
      if (this.options.sameDomainOnly && parsed.hostname !== baseDomain) {
        return false;
      }

      // Allowed domains check
      if (this.options.allowDomains && this.options.allowDomains.length > 0) {
        return this.options.allowDomains.some(
          (domain) =>
            parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)
        );
      }

      // Deny patterns check
      if (this.options.denyPatterns && this.options.denyPatterns.length > 0) {
        return !this.options.denyPatterns.some((pattern) => {
          try {
            return new RegExp(pattern).test(url);
          } catch {
            return url.includes(pattern);
          }
        });
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Normalize URL for deduplication
   */
  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      
      // Remove trailing slash
      let path = parsed.pathname;
      if (path.endsWith('/') && path.length > 1) {
        path = path.slice(0, -1);
      }

      // Remove common tracking params
      const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'ref', 'fbclid'];
      for (const param of trackingParams) {
        parsed.searchParams.delete(param);
      }

      // Sort remaining params for consistency
      parsed.searchParams.sort();

      return `${parsed.origin}${path}${parsed.search}`;
    } catch {
      return url;
    }
  }

  /**
   * Reset crawler state for reuse
   */
  reset(): void {
    this.visited.clear();
    this.disallowedPaths.clear();
  }
}

/**
 * Quick function to discover URLs via BFS
 */
export async function crawlBfs(
  startUrl: string,
  page: Page,
  options: Partial<BfsCrawlerOptions> = {}
): Promise<string[]> {
  const crawler = new BfsCrawler(options);
  return await crawler.crawl(startUrl, page);
}
