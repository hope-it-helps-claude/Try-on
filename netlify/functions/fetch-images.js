// This runs on Netlify's server (not in the browser), so it is NOT blocked
// by the browser's cross-origin (CORS) rules. It fetches the page the user
// pasted a link to, and pulls out likely product-image URLs.

exports.handler = async (event) => {
  const headersCommon = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  const targetUrl = event.queryStringParameters && event.queryStringParameters.url;
  if (!targetUrl) {
    return { statusCode: 400, headers: headersCommon, body: JSON.stringify({ error: 'Missing "url" parameter.' }) };
  }

  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return { statusCode: 400, headers: headersCommon, body: JSON.stringify({ error: 'That is not a valid URL.' }) };
  }

  try {
    const res = await fetch(parsed.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
      }
    });

    if (!res.ok) {
      return {
        statusCode: 502,
        headers: headersCommon,
        body: JSON.stringify({ error: `The site responded with status ${res.status}.` })
      };
    }

    const html = await res.text();
    const found = new Set();

    // 1) Social-preview image tags — often present even on JavaScript-heavy sites,
    //    since they're read by link-preview bots (Facebook, Twitter, etc.)
    const metaRegex = /<meta[^>]+(?:property|name)=["'](?:og:image|og:image:secure_url|twitter:image)["'][^>]+content=["']([^"']+)["']/gi;
    let m;
    while ((m = metaRegex.exec(html))) found.add(m[1]);

    // 2) Plain <img> tags in the raw HTML
    const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
    while ((m = imgRegex.exec(html))) found.add(m[1]);

    // Resolve relative URLs to absolute, and filter out obvious non-product assets
    const images = [...found]
      .map((src) => {
        try { return new URL(src, parsed).toString(); } catch { return null; }
      })
      .filter(Boolean)
      .filter((src) => !/\.(svg|gif)(\?|$)/i.test(src))
      .filter((src) => !/sprite|icon|logo|favicon|pixel|placeholder/i.test(src));

    const unique = [...new Set(images)].slice(0, 24);

    return {
      statusCode: 200,
      headers: headersCommon,
      body: JSON.stringify({ images: unique, count: unique.length })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: headersCommon,
      body: JSON.stringify({ error: 'Could not fetch that page: ' + err.message })
    };
  }
};
