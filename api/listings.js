// api/listings.js
const Parser = require("rss-parser");

const parser = new Parser({
  timeout: 15000,
  requestOptions: {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept": "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": "https://newyork.craigslist.org/search/mnh/apa"
    }
  }
});

const ZIPS = new Set([
  "10001","10002","10003","10004","10005","10006","10007","10009","10010","10011","10012","10013","10014",
  "10016","10017","10018","10019","10021","10022","10023","10024","10025","10026","10027","10028",
  "10029","10030","10031","10032","10033","10034","10035","10036","10037","10038","10039","10040",
  "10044","10065","10069","10075","10280","10282"
]);

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const max  = parseInt(req.query.max || "3000", 10);
    const beds = parseInt(req.query.beds || "0", 10);
    const zip  = (req.query.zip || "").trim();

    let clUrl = `https://newyork.craigslist.org/search/mnh/apa?format=rss&max_price=${max}`;
    if (beds) clUrl += `&min_bedrooms=${beds}`;
    if (zip)  clUrl += `&query=${encodeURIComponent(zip)}`;

    // Unico tentativo: parser con headers
    const feed = await parser.parseURL(clUrl);

    const listings = (feed.items || [])
      .map(it => {
        const text = `${it.title || ""} ${it.contentSnippet || ""}`;
        const pm = /\$([0-9,]+)/.exec(text);
        const price = pm ? parseInt(pm[1].replace(/,/g, ""), 10) : null;
        const zm = /\b(10\d{3})\b/.exec(text);
        const zipcode = zm ? zm[1] : null;
        return { provider: "Craigslist", title: it.title, url: it.link, price, zipcode };
      })
      .filter(l => typeof l.price === "number" && l.price <= max)
      .filter(l => zip ? l.zipcode === zip : (l.zipcode ? ZIPS.has(l.zipcode) : true));

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    res.status(200).json({ data: listings });
  } catch (err) {
    console.error("API /api/listings error:", err);
    res.status(500).json({ error: "upstream_error", detail: String(err && err.message || err) });
  }
};
