// index.js — versão GitHub + Vercel ⚡ by Boy Feljo 🇲🇿

const m3u_url = "http://asdns.lol/get.php?username=0118689&password=3451067&type=m3u_plus&output=ts";

// Cache global (memória da instância — dura até 3 dias)
let cache = { timestamp: 0, data: null };
const CACHE_TTL = 3 * 24 * 60 * 60 * 1000; // 3 dias

// Função de parsing rápida
function parseM3UChannels(m3uContent) {
  const lines = m3uContent.split(/\r?\n/);
  const channels = [];
  let name = "", group = "Desconhecido", logo = "", url = "";

  for (let line of lines) {
    if (line.startsWith("#EXTINF:")) {
      name = line.match(/tvg-name="([^"]*)"/i)?.[1] || line.split(",")[1]?.trim() || "Sem nome";
      group = line.match(/group-title="([^"]*)"/i)?.[1] || "Desconhecido";
      logo = line.match(/tvg-logo="([^"]*)"/i)?.[1] || "";
    } else if (line.startsWith("http")) {
      url = line.trim();
      if (!url.match(/\.(mp4|mkv|avi|mov|flv|webm)$/i)) {
        channels.push({ name, group, logo, url });
      }
    }
  }

  // Remove duplicados
  const seen = new Set();
  return channels.filter(c => {
    if (!c.url || seen.has(c.url)) return false;
    seen.add(c.url);
    return true;
  });
}

// 🧠 Função principal — handler Vercel
export default async function handler(req, res) {
  try {
    const now = Date.now();

    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(204).end();

    const q = req.query.q ? req.query.q.toLowerCase() : null;

    // ⚡ Usa cache se ainda válido
    if (cache.data && now - cache.timestamp < CACHE_TTL) {
      console.log("✅ Cache ativo");
      const filtered = q
        ? cache.data.filter(c => c.name.toLowerCase().includes(q))
        : cache.data;
      return res.status(200).json(filtered);
    }

    console.log("⏳ Atualizando cache...");
    const response = await fetch(m3u_url, { cache: "no-store" });
    const text = await response.text();

    if (!text.includes("#EXTM3U")) {
      return res.status(502).json({ error: "Lista M3U inválida" });
    }

    const channels = parseM3UChannels(text);

    // 🧩 Atualiza cache em memória
    cache = { timestamp: now, data: channels };

    // 💡 Opcional: gerar JSON público
    // Pode exportar via GitHub Actions para servir direto como arquivo
    // await fetch('https://api.github.com/repos/teu-usuario/teu-repo/contents/public/cache.json', {
    //   method: 'PUT',
    //   headers: {
    //     'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
    //     'Content-Type': 'application/json',
    //   },
    //   body: JSON.stringify({
    //     message: 'Atualiza cache IPTV',
    //     content: Buffer.from(JSON.stringify(channels, null, 2)).toString('base64'),
    //   }),
    // });

    const filtered = q
      ? channels.filter(c => c.name.toLowerCase().includes(q))
      : channels;

    res.status(200).json(filtered);
  } catch (err) {
    res.status(502).json({
      error: "Falha ao carregar lista M3U",
      details: err.message,
    });
  }
        }
