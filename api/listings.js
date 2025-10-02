const Parser = require("rss-parser");
const parser = new Parser();

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

    // Proxy AllOrigins
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(clUrl)}`;
    const resp = await fetch(proxyUrl);
    if (!resp.ok) throw new Error(`proxy_http_${resp.status}`);
    const data = await resp.json();

    const xml = data.contents || "";

    // --- DEBUG: loggo il primo pezzo della risposta ---
    console.log("DEBUG raw startsWith:", xml.slice(0, 200));

    // Se non sembra XML RSS, ritorno errore esplicito
    if (!xml.includes("<rss") && !xml.includes("<channel")) {
      throw new Error("Craigslist non ha restituito RSS (probabile HTML / blocco bot)");
    }

    const feed = await parser.parseString(xml);

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

    res.status(200).json({ data: listings, debugCount: feed.items?.length || 0 });
  } catch (err) {
    console.error("API /api/listings error:", err);
    res.status(500).json({ error: "upstream_error", detail: String(err && err.message || err) });
  }
};
