// index.js

// URL da sua M3U
const m3u_url = "http://fbld.link:80/get.php?username=17145909&password=49841687&type=m3u_plus&output=ts";

// Cache em memória
let cache = { timestamp: 0, data: null };
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 horas

// Função para parsear todos os canais e categorizar
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

  // Remove duplicados (mesma URL)
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

// Função para categorizar os conteúdos
function categorizeContent(channels) {
  const categories = {
    filmes: [],
    series: [],
    canais: [],
    esportes: []
  };

  // Palavras-chave para categorização
  const filmesKeywords = ["filme", "movie", "cinema", "film"];
  const seriesKeywords = ["série", "serie", "series", "season", "temporada"];
  const esportesKeywords = ["futebol", "sport", "sports", "esporte", "futbol", "soccer"];

  channels.forEach(channel => {
    const name = channel.name.toLowerCase();
    const group = channel.group.toLowerCase();

    // Verifica se é filme
    if (filmesKeywords.some(keyword => name.includes(keyword) || group.includes(keyword))) {
      categories.filmes.push(channel);
    }
    // Verifica se é série
    else if (seriesKeywords.some(keyword => name.includes(keyword) || group.includes(keyword))) {
      categories.series.push(channel);
    }
    // Verifica se é esporte
    else if (esportesKeywords.some(keyword => name.includes(keyword) || group.includes(keyword))) {
      categories.esportes.push(channel);
    }
    // Se não for nenhum dos acima, é considerado canal
    else {
      categories.canais.push(channel);
    }
  });

  return categories;
}

// Função principal para Vercel
export default async function handler(req, res) {
  try {
    const { path } = req.query;
    const now = Date.now();

    // Busca dados se cache expirou
    if (!cache.data || now - cache.timestamp > CACHE_TTL) {
      const response = await fetch(m3u_url);
      const text = await response.text();

      if (!text || (!text.includes("#EXTM3U") && !text.includes("#EXTINF"))) {
        return res.status(502).json({ error: "Conteúdo não parece M3U" });
      }

      const allChannels = parseM3UChannels(text);
      const categorized = categorizeContent(allChannels);
      
      cache.data = categorized;
      cache.timestamp = now;
    }

    // Roteamento baseado no path
    switch (path) {
      case 'filmes':
        return res.status(200).json(cache.data.filmes);
      
      case 'series':
        return res.status(200).json(cache.data.series);
      
      case 'canais':
        return res.status(200).json(cache.data.canais);
      
      case 'esportes':
        return res.status(200).json(cache.data.esportes);
      
      case 'todos':
        return res.status(200).json({
          filmes: cache.data.filmes,
          series: cache.data.series,
          canais: cache.data.canais,
          esportes: cache.data.esportes,
          estatisticas: {
            total_filmes: cache.data.filmes.length,
            total_series: cache.data.series.length,
            total_canais: cache.data.canais.length,
            total_esportes: cache.data.esportes.length,
            total_geral: cache.data.filmes.length + cache.data.series.length + cache.data.canais.length + cache.data.esportes.length
          }
        });
      
      default:
        return res.status(200).json({
          message: "API de Conteúdo M3U",
          endpoints: [
            "/api?path=filmes",
            "/api?path=series", 
            "/api?path=canais",
            "/api?path=esportes",
            "/api?path=todos"
          ]
        });
    }

  } catch (err) {
    res.status(502).json({ error: "Falha ao carregar a lista M3U", details: err.message });
  }
}
