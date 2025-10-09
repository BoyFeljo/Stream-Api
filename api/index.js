// api/index.js
const m3u_url = "http://fbld.link:80/get.php?username=17145909&password=49841687&type=m3u_plus&output=ts";

let cache = { timestamp: 0, data: null };
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos para teste

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const now = Date.now();

    // Retorna cache se ainda válido
    if (cache.data && now - cache.timestamp < CACHE_TTL) {
      return res.status(200).json({
        success: true,
        total: cache.data.length,
        channels: cache.data.slice(0, 10), // Apenas 10 para teste
        message: "Em breve: Filmes e Séries!"
      });
    }

    // Busca a M3U
    const response = await fetch(m3u_url);
    const text = await response.text();

    if (!text) {
      return res.status(502).json({ 
        success: false,
        error: "Não foi possível carregar a lista" 
      });
    }

    // Parse simples da M3U
    const channels = [];
    const lines = text.split('\n');
    let currentChannel = null;

    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('#EXTINF:')) {
        const nameMatch = trimmed.match(/tvg-name="([^"]*)"/i);
        const groupMatch = trimmed.match(/group-title="([^"]*)"/i);
        const logoMatch = trimmed.match(/tvg-logo="([^"]*)"/i);
        
        const name = nameMatch ? nameMatch[1] : trimmed.split(',')[1] || 'Canal';
        const group = groupMatch ? groupMatch[1] : 'Geral';
        const logo = logoMatch ? logoMatch[1] : null;

        currentChannel = { name, group, logo };
      } 
      else if (trimmed.startsWith('http') && currentChannel) {
        currentChannel.url = trimmed;
        
        // Filtra apenas canais (remove filmes/séries)
        const nameLower = currentChannel.name.toLowerCase();
        const groupLower = currentChannel.group.toLowerCase();
        
        const isMovie = nameLower.includes('filme') || nameLower.includes('movie') || groupLower.includes('filme');
        const isSeries = nameLower.includes('série') || nameLower.includes('serie') || groupLower.includes('série');
        
        if (!isMovie && !isSeries) {
          channels.push(currentChannel);
        }
        
        currentChannel = null;
      }
    }

    // Atualiza cache
    cache.data = channels;
    cache.timestamp = now;

    // Retorna sucesso
    res.status(200).json({
      success: true,
      total: channels.length,
      channels: channels.slice(0, 10), // Apenas primeiros 10 para teste
      last_update: new Date().toISOString(),
      message: "🎬 Filmes e Séries em breve!"
    });

  } catch (err) {
    console.error('Erro:', err);
    res.status(500).json({ 
      success: false,
      error: "Erro interno do servidor",
      message: "Tente novamente em alguns instantes"
    });
  }
}
