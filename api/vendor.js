const SOURCES = {
  supabase: [
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.109.0/dist/umd/supabase.js",
    "https://unpkg.com/@supabase/supabase-js@2.109.0/dist/umd/supabase.js"
  ],
  jspdf: [
    "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js",
    "https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js"
  ]
};

module.exports = async function handler(req, res) {
  const lib = String(req.query?.lib || "");
  const urls = SOURCES[lib];
  if (!urls) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.end("Biblioteca invalida");
  }

  let lastError = null;
  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const r = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!r.ok) throw new Error("HTTP " + r.status);
      const body = await r.text();
      if (!body || body.length < 1000) throw new Error("Resposta incompleta");
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/javascript; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800");
      res.setHeader("X-Content-Type-Options", "nosniff");
      return res.end(body);
    } catch (e) {
      lastError = e;
    }
  }

  res.statusCode = 502;
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.end('throw new Error("Falha ao carregar biblioteca '+lib+' pelo servidor Vaporeasy");');
};
