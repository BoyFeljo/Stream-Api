// api/index.js
const m3u_url = "http://fbld.link:80/get.php?username=17145909&password=49841687&type=m3u_plus&output=ts";

let cache = { timestamp: 0, data: null };
const CACHE_TTL = 24 * 60 * 60 * 1000;

function parseM3UChannels(m3uContent) {
  const lines = m3uContent.split(/\r?\n/);
  const channels = [];
  let current = null;

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    if (line.startsWith("#EXTINF:")) {
      let name = null;
      let group = "Desconhecido";
      let logo = null;

      const nameMatch = line.match(/tvg-name="([^"]*)"/i);
      if (nameMatch) name = nameMatch[1];

      const groupMatch = line.match(/group-title="([^"]*)"/i);
      if (groupMatch) group = groupMatch[1];

      const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
      if (logoMatch) logo = logoMatch[1];

      if (!name) {
        const parts = line.split(",", 2);
        name = parts[1] ? parts[1].trim() : "Sem nome";
      }

      current = { name, group, logo: logo || null };
    } else if (line.startsWith("http")) {
      if (!current) current = { name: line, group: "Desconhecido", logo: null };
      current.url = line;
      channels.push(current);
      current = null;
    }
  }

  const seen = new Set();
  const clean = [];
  for (const c of channels) {
    if (!c.url) continue;
    if (seen.has(c.url)) continue;
    seen.add(c.url);
    clean.push(c);
  }

  return clean;
}

function filterOnlyChannels(channels) {
  const removeKeywords = [
    "filme", "movie", "cinema", "film", 
    "série", "serie", "series", "season", "temporada", "episódio", "episodio",
    "mp4", "vod", "video on demand", "on demand"
  ];

  return channels.filter(channel => {
    const name = channel.name.toLowerCase();
    const group = channel.group.toLowerCase();
    const url = channel.url.toLowerCase();

    const shouldRemove = removeKeywords.some(keyword => 
      name.includes(keyword) || 
      group.includes(keyword) ||
      url.includes(keyword)
    );

    const hasMP4 = url.includes('.mp4') || url.includes('type=mp4');
    return !shouldRemove && !hasMP4;
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const now = Date.now();

    if (cache.data && now - cache.timestamp < CACHE_TTL) {
      return res.status(200).json({
        success: true,
        total: cache.data.length,
        channels: cache.data
      });
    }

    const response = await fetch(m3u_url);
    const text = await response.text();

    if (!text || (!text.includes("#EXTM3U") && !text.includes("#EXTINF"))) {
      return res.status(502).json({ 
        success: false,
        error: "Conteúdo M3U inválido" 
      });
    }

    const allChannels = parseM3UChannels(text);
    const onlyChannels = filterOnlyChannels(allChannels);

    onlyChannels.sort((a, b) => {
      if (a.group !== b.group) {
        return a.group.localeCompare(b.group);
      }
      return a.name.localeCompare(b.name);
    });

    cache.data = onlyChannels;
    cache.timestamp = now;

    res.status(200).json({
      success: true,
      total: onlyChannels.length,
      last_update: new Date().toISOString(),
      channels: onlyChannels
    });

  } catch (err) {
    res.status(502).json({ 
      success: false,
      error: "Falha ao carregar canais",
      details: err.message 
    });
  }
    }
