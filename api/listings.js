// api/listings.js
const Parser = require("rss-parser");

// User-Agent per evitare blocchi e timeout ragionevoli
const parser = new Parser({
  headers: {
    "User-Agent":
      "Mozilla/5.0 (compatible; RentFinderBot/1.0; +https://ggsup1.github.io/RENT-FINDER-MANHATTAN/)"
  },
  timeout: 15000
});

const ZIPS = new Set([
  "10001","10002","10003","10004","10005","10006","10007","10009","10010","10011","10012","10013","10014",
  "10016","10017","10018","10019","10021","10022","10023","10024","10025","10026","10027","10028",
  "10029","10030","10031","10032","10033","10034","10035","10036","10037","10038","10039","10040",
  "10044","10065","10069","10075","10280","10282"
]);

module.exports = async (req, res) => {
  // CORS per chiamate dalla tua pagina su GitHub Pages
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
