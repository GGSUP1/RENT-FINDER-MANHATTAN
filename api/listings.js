// api/listings.js
// Strict results via Craigslist RSS, con supporto area: manhattan (mnh), brooklyn (brk), queens (que)

const Parser = require("rss-parser");

// ---- Header anti-blocco (fondamentale su Vercel) ----
const parser = new Parser({
  timeout: 15000,
  requestOptions: {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept": "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": "https://newyork.craigslist.org/"
    }
  }
});

// ---- ZIP whitelists per filtrare *solo* l’area corretta ----
const ZIPS = {
  mnh: new Set([
    "10001","10002","10003","10004","10005","10006","10007","10009","10010","10011","10012","10013","10014",
    "10016","10017","10018","10019","10021","10022","10023","10024","10025","10026","10027","10028","10029",
    "10030","10031","10032","10033","10034","10035","10036","10037","10038","10039","10040","10044","10065",
    "10069","10075","10280","10282"
  ]),
  brk: new Set([
    "11201","11203","11204","11205","11206","11207","11208","11209","11210","11211","11212","11213","11214","11215","11216","11217",
    "11218","11219","11220","11221","11222","11223","11224","11225","11226","11228","11229","11230","11231","11232","11233","11234",
    "11235","11236","11237","11238","11239"
  ]),
  que: new Set([
    "11101","11102","11103","11104","11105","11106",
    "11354","11355","11356","11357","11358","11360","11361","11362","11363","11364","11365","11366","11367",
    "11368","11369","11370","11372","11373","11374","11375","11377","11378","11379","11385",
    "11411","11412","11413","11414","11415","11416","11417","11418","11419","11420","11421","11422","11423","11426","11427","11428","11429","11432","11433","11434","11435","11436",
    "11691","11692","11693","11694","11697"
  ])
};

// Mappa aree UI -> cl board path
const AREA_TO_CL = {
  manhattan: "mnh",
  harlem: "mnh",           // “district” di Manhattan
  upper_manhattan: "mnh",  // idem
  brooklyn: "brk",
  queens: "que"
};

module.exports = async (req, res) => {
  // CORS per chiamate dalla tua pagina (anche GitHub Pages)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    // ---- Query params ----
    const uiArea = (req.query.area || "manhattan").toLowerCase();
    const area = AREA_TO_CL[uiArea] || "mnh"; // mnh | brk | que
    const max  = Math.max(0, parseInt(req.query.max || "3000", 10));
    const beds = Math.max(0, parseInt(req.query.beds || "0", 10));
    const zip  = (req.query.zip || "").trim();
    // opzionale: parole chiave libere (se vuoi passarle in futuro)
    const q    = (req.query.q || "").trim();

    // ---- Costruzione URL RSS Craigslist ----
    // Esempio: https://newyork.craigslist.org/search/mnh/apa?format=rss&max_price=3000&min_bedrooms=1&query=10027
    const params = new URLSearchParams();
    params.set("format", "rss");
    if (max)  params.set("max_price", String(max));
    if (beds) params.set("min_bedrooms", String(beds));

    // query: se passo sia zip che q, li unisco come testo (es. "10027 lease takeover")
    if (zip || q) {
      const queryText = [zip, q].filter(Boolean).join(" ");
      params.set("query", queryText);
    }

    const clUrl = `https://newyork.craigslist.org/search/${area}/apa?${params.toString()}`;

    // ---- Parser con fallback manuale ----
    let feed;
    try {
      feed = await parser.parseURL(clUrl);
    } catch (e) {
      // Fallback: fetch + parseString per superare blocchi strani
      const resp = await fetch(clUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          "Accept": "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Referer": `https://newyork.craigslist.org/search/${area}/apa`
        }
      });
      if (!resp.ok) {
        throw new Error(`upstream_http_${resp.status}`);
      }
      const xml = await resp.text();
      feed = await parser.parseString(xml);
    }

    // ---- Parse items ----
    const AREA_ZIPS = ZIPS[area] || ZIPS.mnh;
    const items = Array.isArray(feed.items) ? feed.items : [];

    const listings = items
      .map(it => {
        const text = `${it.title || ""} ${it.contentSnippet || ""}`;
        // prezzo (prima occorrenza)
        const pm = /\$([0-9,]+)/.exec(text);
        const price = pm ? parseInt(pm[1].replace(/,/g, ""), 10) : null;
        // zip 10xxx / 11xxx / 112xx / 1169x ecc.
        const zm = /\b(10\d{3}|1110[1-6]|11[3-4]\d{2}|1169[1-4]|11697|112\d{2})\b/.exec(text);
        const zipcode = zm ? zm[1] : null;
        return {
          provider: "Craigslist",
          title: it.title,
          url: it.link,
          price,
          zipcode
        };
      })
      // prezzo valido e ≤ max
      .filter(l => typeof l.price === "number" && l.price <= max)
      // se l'utente ha indicato uno ZIP, match esatto; altrimenti filtra per l’area tramite whitelist
      .filter(l => zip ? (l.zipcode === zip) : (l.zipcode ? AREA_ZIPS.has(l.zipcode) : true));

    // Cache edge (5 min) + SWR (10 min)
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    res.status(200).json({ area, data: listings, source: "craigslist_rss", url: clUrl });
  } catch (err) {
    console.error("API /api/listings error:", err);
    res.status(500).json({ error: "upstream_error", detail: String(err && err.message || err) });
  }
};
