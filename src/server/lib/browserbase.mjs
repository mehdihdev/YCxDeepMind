/**
 * Browserbase Integration for Forge RDE
 *
 * Uses Browserbase headless browser API for reliable web scraping
 * and datasheet discovery. Replaces fragile DuckDuckGo HTML parsing.
 *
 * Environment variables required:
 * - BROWSERBASE_API_KEY: API key for Browserbase service
 * - BROWSERBASE_PROJECT_ID: Project ID for Browserbase
 */

const BROWSERBASE_API_URL = "https://www.browserbase.com/v1";

async function parseJsonResponse(response, contextLabel) {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${contextLabel} failed (${response.status}): ${text.slice(0, 180)}`);
  }

  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("application/json")) {
    throw new Error(
      `${contextLabel} returned non-JSON response (content-type: ${contentType || "unknown"}).`
    );
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${contextLabel} returned invalid JSON.`);
  }
}

/**
 * Search for robot parts using Google via Browserbase
 * @param {string} query - Search query (e.g., "6-channel servo controller USB")
 * @param {object} options - Search options
 * @returns {Promise<Array<{rank: number, url: string, title: string, snippet: string}>>}
 */
export async function searchParts(query, options = {}) {
  const apiKey = process.env.BROWSERBASE_API_KEY;
  const projectId = process.env.BROWSERBASE_PROJECT_ID;

  // Fallback to DuckDuckGo if no API key (development mode)
  if (!apiKey || !projectId) {
    console.warn(
      "BROWSERBASE_API_KEY or BROWSERBASE_PROJECT_ID not set, falling back to DuckDuckGo search"
    );
    return searchDuckDuckGoFallback(query);
  }

  const maxResults = options.maxResults || 6;

  try {
    // Create a new browser session
    const sessionResponse = await fetch(`${BROWSERBASE_API_URL}/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-BB-API-Key": apiKey
      },
      body: JSON.stringify({
        projectId,
        browserSettings: {
          fingerprint: {
            devices: ["desktop"],
            operatingSystems: ["macos"]
          }
        }
      })
    });

    const session = await parseJsonResponse(sessionResponse, "Browserbase session creation");
    const sessionId = session.id;

    // Use Playwright to connect and perform search
    // For now, we'll use a simplified approach with the REST API
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query + " datasheet buy robotics")}`;

    // Navigate and extract results
    const pageResponse = await fetch(`${BROWSERBASE_API_URL}/sessions/${sessionId}/pages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-BB-API-Key": apiKey
      },
      body: JSON.stringify({
        url: searchUrl,
        waitUntil: "networkidle"
      })
    });

    await parseJsonResponse(pageResponse, "Browserbase navigation");

    // Extract search results using DOM evaluation
    const extractResponse = await fetch(`${BROWSERBASE_API_URL}/sessions/${sessionId}/evaluate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-BB-API-Key": apiKey
      },
      body: JSON.stringify({
        expression: `
          Array.from(document.querySelectorAll('.g')).slice(0, ${maxResults}).map((el, i) => {
            const link = el.querySelector('a');
            const title = el.querySelector('h3');
            const snippet = el.querySelector('.VwiC3b, .IsZvec');
            return {
              rank: i + 1,
              url: link?.href || '',
              title: title?.textContent || '',
              snippet: snippet?.textContent || ''
            };
          }).filter(r => r.url && r.title)
        `
      })
    });

    // Clean up session
    await fetch(`${BROWSERBASE_API_URL}/sessions/${sessionId}`, {
      method: "DELETE",
      headers: { "X-BB-API-Key": apiKey }
    });

    const extractResult = await parseJsonResponse(extractResponse, "Browserbase extraction");
    return extractResult.result || [];

  } catch (error) {
    console.error("Browserbase search error:", error.message);
    // Fallback to DuckDuckGo on error
    return searchDuckDuckGoFallback(query);
  }
}

/**
 * Fetch and extract content from a datasheet URL
 * @param {string} url - URL to fetch
 * @returns {Promise<{type: string, url: string, content?: string, specs?: object}>}
 */
export async function fetchDatasheet(url) {
  const apiKey = process.env.BROWSERBASE_API_KEY;
  const projectId = process.env.BROWSERBASE_PROJECT_ID;

  // Simple fetch for non-Browserbase mode
  if (!apiKey || !projectId) {
    return fetchDatasheetSimple(url);
  }

  try {
    // Create session
    const sessionResponse = await fetch(`${BROWSERBASE_API_URL}/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-BB-API-Key": apiKey
      },
      body: JSON.stringify({ projectId })
    });

    const session = await parseJsonResponse(sessionResponse, "Browserbase session creation");
    const sessionId = session.id;

    // Navigate to page
    const pageResponse = await fetch(`${BROWSERBASE_API_URL}/sessions/${sessionId}/pages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-BB-API-Key": apiKey
      },
      body: JSON.stringify({
        url,
        waitUntil: "networkidle"
      })
    });
    await parseJsonResponse(pageResponse, "Browserbase page navigation");

    // Check for PDF links and extract specs
    const extractResponse = await fetch(`${BROWSERBASE_API_URL}/sessions/${sessionId}/evaluate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-BB-API-Key": apiKey
      },
      body: JSON.stringify({
        expression: `
          (() => {
            // Look for PDF download links
            const pdfLinks = Array.from(document.querySelectorAll('a[href$=".pdf"], a[href*="datasheet"], a[href*="spec"]'))
              .map(a => ({ href: a.href, text: a.textContent.trim() }))
              .filter(l => l.href.includes('.pdf') || l.text.toLowerCase().includes('datasheet'));

            // Extract specification tables
            const specs = {};
            document.querySelectorAll('table').forEach(table => {
              table.querySelectorAll('tr').forEach(row => {
                const cells = row.querySelectorAll('td, th');
                if (cells.length === 2) {
                  const key = cells[0].textContent.trim();
                  const value = cells[1].textContent.trim();
                  if (key && value && key.length < 50) {
                    specs[key] = value;
                  }
                }
              });
            });

            // Extract key product info
            const title = document.querySelector('h1, .product-title, [class*="title"]')?.textContent?.trim();
            const description = document.querySelector('[class*="description"], .product-description, meta[name="description"]')?.textContent?.trim() ||
                               document.querySelector('meta[name="description"]')?.content;

            return {
              pdfLinks: pdfLinks.slice(0, 3),
              specs,
              title,
              description: description?.slice(0, 500)
            };
          })()
        `
      })
    });

    // Clean up
    await fetch(`${BROWSERBASE_API_URL}/sessions/${sessionId}`, {
      method: "DELETE",
      headers: { "X-BB-API-Key": apiKey }
    });

    const result = await parseJsonResponse(extractResponse, "Browserbase datasheet extraction");
    const extracted = result.result || {};

    // Determine type and return
    if (extracted.pdfLinks?.length > 0) {
      return {
        type: "pdf",
        url: extracted.pdfLinks[0].href,
        title: extracted.title,
        description: extracted.description,
        specs: extracted.specs
      };
    }

    return {
      type: "html",
      url,
      title: extracted.title,
      description: extracted.description,
      specs: extracted.specs
    };

  } catch (error) {
    console.error("Browserbase datasheet fetch error:", error.message);
    return fetchDatasheetSimple(url);
  }
}

/**
 * DuckDuckGo fallback search (when Browserbase is unavailable)
 */
async function searchDuckDuckGoFallback(query) {
  const endpoint = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

  try {
    const response = await fetch(endpoint, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
      }
    });

    if (!response.ok) {
      return [];
    }

    const html = await response.text();
    const matches = Array.from(
      html.matchAll(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)
    );

    return matches.slice(0, 6).map((match, index) => ({
      rank: index + 1,
      url: normalizeUrl(match[1]),
      title: stripHtml(match[2]),
      snippet: ""
    }));
  } catch (error) {
    console.error("DuckDuckGo fallback search error:", error.message);
    return [];
  }
}

/**
 * Simple datasheet fetch without Browserbase
 */
async function fetchDatasheetSimple(url) {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
      }
    });

    if (!response.ok) {
      return { type: "unavailable", url };
    }

    const contentType = String(response.headers.get("content-type") || "").toLowerCase();

    if (contentType.includes("pdf")) {
      return { type: "pdf", url };
    }

    const html = await response.text();
    const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
    const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
    const ogDescMatch = html.match(
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i
    );
    const pdfHrefMatch = html.match(
      /<a[^>]+href=["']([^"']+\.pdf(?:\?[^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/i
    );
    const specs = {};

    const tableRows = Array.from(
      html.matchAll(
        /<tr[^>]*>\s*<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>\s*<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>[\s\S]*?<\/tr>/gi
      )
    );

    for (const row of tableRows) {
      const key = stripHtml(row[1]).slice(0, 80);
      const value = stripHtml(row[2]).slice(0, 200);
      if (!key || !value || key.length > 60) continue;
      specs[key] = value;
      if (Object.keys(specs).length >= 24) break;
    }

    if (!Object.keys(specs).length) {
      const listItems = Array.from(html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi))
        .map((match) => stripHtml(match[1]))
        .filter((text) => text.length >= 10 && text.length <= 220)
        .slice(0, 12);
      listItems.forEach((item, index) => {
        specs[`Feature ${index + 1}`] = item;
      });
    }

    return {
      type: "html",
      url,
      title: stripHtml(titleMatch?.[1] || ""),
      description: stripHtml(descMatch?.[1] || ogDescMatch?.[1] || "").slice(0, 700),
      specs,
      pdfUrl: pdfHrefMatch ? normalizeUrl(pdfHrefMatch[1]) : null
    };
  } catch {
    return { type: "unavailable", url };
  }
}

/**
 * Normalize URLs from search results
 */
function normalizeUrl(rawUrl) {
  let withProtocol = rawUrl;
  if (!rawUrl.startsWith("http")) {
    withProtocol = "https://" + rawUrl.replace(/^\/\//, "");
  }
  try {
    const url = new URL(withProtocol);
    const redirected = url.searchParams.get("uddg");
    return redirected ? decodeURIComponent(redirected) : withProtocol;
  } catch {
    return withProtocol;
  }
}

/**
 * Strip HTML tags from text
 */
function stripHtml(text) {
  return decodeHtmlEntities(
    String(text || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  );
}

function decodeHtmlEntities(text) {
  return String(text || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/gi, "/");
}

export default {
  searchParts,
  fetchDatasheet
};
