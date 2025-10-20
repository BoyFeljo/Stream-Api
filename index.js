// index.js — versão GitHub + Vercel ⚡ by Boy Feljo 🇲🇿

import fetch from "node-fetch"; // 👈 Adiciona isso no topo (para funcionar na Vercel)
const m3u_url = "http://asdns.lol/get.php?username=0118689&password=3451067&type=m3u_plus&output=ts";
const githubRepo = "BoyFeljo/Stream-Api";
const githubPath = "public/cache.json";
const CACHE_TTL = 3 * 24 * 60 * 60 * 1000;

let cache = { timestamp: 0, data: null };

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

  const seen = new Set();
  return channels.filter(c => {
    if (!c.url || seen.has(c.url)) return false;
    seen.add(c.url);
    return true;
  });
}

async function fetchCacheFromGitHub() {
  try {
    const url = `https://raw.githubusercontent.com/${githubRepo}/main/${githubPath}`;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;

    const data = await response.json();
    if (Date.now() - data.timestamp < CACHE_TTL) {
      console.log("✅ Cache GitHub ainda válido");
      return data.channels;
    }
    console.log("🕒 Cache GitHub expirado");
    return null;
  } catch (err) {
    console.warn("⚠️ Falha ao carregar cache.json:", err.message);
    return null;
  }
}

async function saveCacheToGitHub(channels) {
  try {
    const url = `https://api.github.com/repos/${githubRepo}/contents/${githubPath}`;
    const getFile = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` },
    });
    const file = await getFile.json();
    const sha = file.sha || null;

    await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: "Atualiza cache IPTV",
        content: Buffer.from(
          JSON.stringify({ timestamp: Date.now(), channels }, null, 2)
        ).toString("base64"),
        sha,
      }),
    });

    console.log("📤 Cache atualizado no GitHub com sucesso!");
  } catch (err) {
    console.warn("⚠️ Falha ao salvar cache.json:", err.message);
  }
}

export default async function handler(req, res) {
  try {
    const now = Date.now();

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(204).end();

    const q = req.query.q ? req.query.q.toLowerCase() : null;

    if (cache.data && now - cache.timestamp < CACHE_TTL) {
      console.log("✅ Cache em memória ativo");
      const filtered = q
        ? cache.data.filter(c => c.name.toLowerCase().includes(q))
        : cache.data;
      return res.status(200).json(filtered);
    }

    const githubCache = await fetchCacheFromGitHub();
    if (githubCache) {
      cache = { timestamp: now, data: githubCache };
      const filtered = q
        ? githubCache.filter(c => c.name.toLowerCase().includes(q))
        : githubCache;
      return res.status(200).json(filtered);
    }

    console.log("⏳ Atualizando cache com nova M3U...");
    const response = await fetch(m3u_url, { cache: "no-store" });
    const text = await response.text();

    if (!text.includes("#EXTM3U")) {
      return res.status(502).json({ error: "Lista M3U inválida" });
    }

    const channels = parseM3UChannels(text);

    cache = { timestamp: now, data: channels };
    await saveCacheToGitHub(channels);

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
