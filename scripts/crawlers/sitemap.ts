/**
 * Sitemap Crawler
 * Fetches and parses sitemap.xml to discover URLs
 */

import * as https from 'https';
import * as http from 'http';
import { parseStringPromise } from 'xml2js';

export interface SitemapOptions {
  maxUrls?: number;
  allowDomains?: string[];
  denyPatterns?: string[];
  includeImages?: boolean;
}

export interface SitemapUrl {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: string;
}

export class SitemapCrawler {
  private options: SitemapOptions;

  constructor(options: SitemapOptions = {}) {
    this.options = {
      maxUrls: 100,
      allowDomains: [],
      denyPatterns: [],
      includeImages: false,
      ...options,
    };
  }

  /**
   * Fetch and parse sitemap from a URL
   */
  async crawl(sitemapUrl: string): Promise<string[]> {
    try {
      const content = await this.fetchUrl(sitemapUrl);
      const urls = await this.parseSitemap(content);
      return this.filterUrls(urls);
    } catch (error) {
      console.error(`Failed to fetch sitemap: ${sitemapUrl}`, error);
      return [];
    }
  }

  /**
   * Try to discover sitemap from base URL
   */
  async discover(baseUrl: string): Promise<string[]> {
    const commonLocations = [
      '/sitemap.xml',
      '/sitemap_index.xml',
      '/sitemap/sitemap.xml',
      '/sitemaps/sitemap.xml',
    ];

    const parsedBase = new URL(baseUrl);
    
    for (const location of commonLocations) {
      try {
        const sitemapUrl = `${parsedBase.origin}${location}`;
        const urls = await this.crawl(sitemapUrl);
        if (urls.length > 0) {
          console.log(`Found sitemap at ${sitemapUrl} with ${urls.length} URLs`);
          return urls;
        }
      } catch {
        // Try next location
      }
    }

    // Try robots.txt
    try {
      const robotsUrl = `${parsedBase.origin}/robots.txt`;
      const robotsContent = await this.fetchUrl(robotsUrl);
      const sitemapMatch = robotsContent.match(/Sitemap:\s*(.+)/i);
      if (sitemapMatch) {
        return await this.crawl(sitemapMatch[1].trim());
      }
    } catch {
      // No robots.txt or no sitemap in it
    }

    console.log('No sitemap found, returning base URL only');
    return [baseUrl];
  }

  private async fetchUrl(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;
      
      const request = protocol.get(url, { timeout: 10000 }, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          if (response.headers.location) {
            this.fetchUrl(response.headers.location).then(resolve).catch(reject);
            return;
          }
        }

        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }

        let data = '';
        response.on('data', (chunk) => (data += chunk));
        response.on('end', () => resolve(data));
        response.on('error', reject);
      });

      request.on('error', reject);
      request.on('timeout', () => {
        request.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }

  private async parseSitemap(content: string): Promise<SitemapUrl[]> {
    const urls: SitemapUrl[] = [];

    try {
      const result = await parseStringPromise(content);

      // Handle sitemap index (multiple sitemaps)
      if (result.sitemapindex) {
        const sitemaps = result.sitemapindex.sitemap || [];
        for (const sitemap of sitemaps) {
          if (sitemap.loc && sitemap.loc[0]) {
            const childUrls = await this.crawl(sitemap.loc[0]);
            if (urls.length + childUrls.length >= (this.options.maxUrls || 100)) {
              urls.push(
                ...childUrls
                  .slice(0, (this.options.maxUrls || 100) - urls.length)
                  .map((loc) => ({ loc }))
              );
              break;
            }
            urls.push(...childUrls.map((loc) => ({ loc })));
          }
        }
      }

      // Handle regular sitemap
      if (result.urlset) {
        const urlEntries = result.urlset.url || [];
        for (const entry of urlEntries) {
          if (entry.loc && entry.loc[0]) {
            urls.push({
              loc: entry.loc[0],
              lastmod: entry.lastmod?.[0],
              changefreq: entry.changefreq?.[0],
              priority: entry.priority?.[0],
            });
          }
        }
      }
    } catch (error) {
      console.error('Failed to parse sitemap XML:', error);
    }

    return urls;
  }

  private filterUrls(urls: SitemapUrl[]): string[] {
    let filtered = urls.map((u) => u.loc);

    // Filter by allowed domains
    if (this.options.allowDomains && this.options.allowDomains.length > 0) {
      filtered = filtered.filter((url) => {
        try {
          const parsed = new URL(url);
          return this.options.allowDomains!.some(
            (domain) =>
              parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)
          );
        } catch {
          return false;
        }
      });
    }

    // Filter by deny patterns
    if (this.options.denyPatterns && this.options.denyPatterns.length > 0) {
      filtered = filtered.filter((url) => {
        return !this.options.denyPatterns!.some((pattern) => {
          try {
            const regex = new RegExp(pattern);
            return regex.test(url);
          } catch {
            return url.includes(pattern);
          }
        });
      });
    }

    // Limit to max URLs
    if (this.options.maxUrls && filtered.length > this.options.maxUrls) {
      filtered = filtered.slice(0, this.options.maxUrls);
    }

    // Remove duplicates
    return [...new Set(filtered)];
  }
}

/**
 * Quick function to get URLs from a sitemap
 */
export async function getUrlsFromSitemap(
  baseUrl: string,
  options: SitemapOptions = {}
): Promise<string[]> {
  const crawler = new SitemapCrawler(options);
  return await crawler.discover(baseUrl);
}
