// index.js
import { createServer } from 'http';

const m3u_url = "http://fbld.link:80/get.php?username=17145909&password=49841687&type=m3u_plus&output=ts";
let cache = { timestamp: 0, data: null };
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 horas

// Função para processar a M3U
async function loadChannels() {
  try {
    console.log('📥 Buscando lista M3U...');
    const response = await fetch(m3u_url);
    const text = await response.text();

    if (!text) {
      throw new Error('Lista M3U vazia');
    }

    if (!text.includes('#EXTM3U') && !text.includes('#EXTINF')) {
      throw new Error('Formato M3U inválido');
    }

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
        const urlLower = currentChannel.url.toLowerCase();
        
        const isMovie = nameLower.includes('filme') || nameLower.includes('movie') || groupLower.includes('filme');
        const isSeries = nameLower.includes('série') || nameLower.includes('serie') || nameLower.includes('series') || groupLower.includes('série');
        const isMP4 = urlLower.includes('.mp4') || urlLower.includes('type=mp4');
        
        if (!isMovie && !isSeries && !isMP4) {
          channels.push(currentChannel);
        }
        
        currentChannel = null;
      }
    }

    console.log(`✅ ${channels.length} canais carregados`);
    return channels;
  } catch (error) {
    console.error('❌ Erro ao carregar canais:', error.message);
    return [];
  }
}

// Função para verificar status do cache
function getCacheStatus() {
  if (!cache.data) return 'vazio';
  
  const now = Date.now();
  const age = now - cache.timestamp;
  const hours = Math.floor(age / (60 * 60 * 1000));
  const minutes = Math.floor((age % (60 * 60 * 1000)) / (60 * 1000));
  
  return `${hours}h ${minutes}m`;
}

// HTML da página inicial
const HTML_PAGE = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Stream API - Sua API de Streaming</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Arial', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            min-height: 100vh;
            padding: 20px;
        }

        .container {
            max-width: 900px;
            margin: 0 auto;
            text-align: center;
        }

        .header {
            padding: 40px 0;
        }

        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
        }

        .header p {
            font-size: 1.2rem;
            opacity: 0.9;
        }

        .cards {
            display: grid;
            gap: 20px;
            margin: 30px 0;
        }

        .card {
            background: rgba(255,255,255,0.1);
            backdrop-filter: blur(10px);
            border-radius: 15px;
            padding: 30px;
            border: 1px solid rgba(255,255,255,0.2);
        }

        .card h2 {
            margin-bottom: 15px;
            font-size: 1.5rem;
        }

        .endpoint {
            background: rgba(0,0,0,0.2);
            padding: 15px;
            border-radius: 10px;
            margin: 15px 0;
            text-align: left;
        }

        .endpoint code {
            background: rgba(0,0,0,0.3);
            padding: 8px 12px;
            border-radius: 5px;
            display: block;
            font-family: monospace;
            word-break: break-all;
            margin: 5px 0;
        }

        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 20px;
            margin: 20px 0;
        }

        .stat {
            text-align: center;
            padding: 15px;
            background: rgba(255,255,255,0.1);
            border-radius: 10px;
        }

        .stat .number {
            font-size: 1.8rem;
            font-weight: bold;
            display: block;
        }

        .stat .label {
            font-size: 0.9rem;
            opacity: 0.8;
        }

        .status {
            display: inline-block;
            padding: 5px 15px;
            border-radius: 20px;
            margin-bottom: 10px;
            font-weight: bold;
        }

        .online { background: #4CAF50; }
        .soon { background: #FF9800; }
        .cache { background: #2196F3; }

        .footer {
            margin-top: 40px;
            opacity: 0.8;
        }

        .channel-list {
            max-height: 300px;
            overflow-y: auto;
            margin: 15px 0;
            text-align: left;
            background: rgba(0,0,0,0.2);
            border-radius: 10px;
            padding: 10px;
        }

        .channel-item {
            padding: 8px 12px;
            border-bottom: 1px solid rgba(255,255,255,0.1);
            font-size: 0.9rem;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .channel-item:last-child {
            border-bottom: none;
        }

        .channel-logo {
            width: 24px;
            height: 24px;
            border-radius: 4px;
            object-fit: cover;
        }

        .cache-info {
            background: rgba(33, 150, 243, 0.2);
            padding: 10px;
            border-radius: 8px;
            margin: 10px 0;
            font-size: 0.9rem;
        }

        @media (max-width: 600px) {
            .header h1 { font-size: 2rem; }
            .stats { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎬 Stream API</h1>
            <p>Sua API para conteúdo de streaming</p>
        </div>

        <div class="cards">
            <div class="card">
                <span class="status online">✅ CANAIS ONLINE</span>
                <h2>📺 Canais de TV</h2>
                <p>API de canais de TV ao vivo funcionando com cache de 24h:</p>
                
                <div class="endpoint">
                    <strong>Endpoint da API:</strong>
                    <code>https://stream-api-mu.vercel.app/api</code>
                </div>

                <div class="cache-info">
                    🕒 <strong>Cache:</strong> 24 horas | 
                    <strong>Status:</strong> <span id="cacheStatus">Carregando...</span>
                </div>

                <div class="stats">
                    <div class="stat">
                        <span id="totalChannels" class="number">-</span>
                        <span class="label">Canais Totais</span>
                    </div>
                    <div class="stat">
                        <span id="cacheAge" class="number">-</span>
                        <span class="label">Cache Atual</span>
                    </div>
                    <div class="stat">
                        <span id="nextUpdate" class="number">-</span>
                        <span class="label">Próxima Atualização</span>
                    </div>
                </div>

                <div id="channelList" class="channel-list">
                    <div class="channel-item">📡 Carregando canais...</div>
                </div>
            </div>

            <div class="card">
                <span class="status soon">🚀 EM BREVE</span>
                <h2>🎬 Filmes & Séries</h2>
                <p>Estamos trabalhando para trazer catálogo completo de filmes e séries em breve!</p>
                
                <div class="endpoint">
                    <strong>Próximos endpoints:</strong>
                    <code>https://stream-api-mu.vercel.app/api/filmes</code>
                    <code>https://stream-api-mu.vercel.app/api/series</code>
                </div>

                <p style="margin-top: 15px; color: #FF9800; font-weight: bold;">
                    ⏳ Disponível em breve! Aguarde...
                </p>
            </div>
        </div>

        <div class="footer">
            <p>Stream API &copy; 2024 - stream-api-mu.vercel.app | Cache: 24h</p>
        </div>
    </div>

    <script>
        async function loadStats() {
            try {
                const response = await fetch('/api');
                const data = await response.json();
                
                if (data.success) {
                    // Estatísticas principais
                    document.getElementById('totalChannels').textContent = data.total.toLocaleString();
                    document.getElementById('cacheAge').textContent = data.cache_age || '0h';
                    document.getElementById('cacheStatus').textContent = data.cache_status || 'Ativo';
                    document.getElementById('nextUpdate').textContent = data.next_update || '24h';
                    
                    // Lista de canais
                    const channelList = document.getElementById('channelList');
                    if (data.channels && data.channels.length > 0) {
                        channelList.innerHTML = data.channels.slice(0, 6).map(channel => {
                            const logo = channel.logo ? 
                                `<img src="${channel.logo}" alt="Logo" class="channel-logo" onerror="this.style.display='none'">` : 
                                '📺';
                            return `
                                <div class="channel-item">
                                    ${logo}
                                    <div>
                                        <strong>${channel.name}</strong>
                                        <div style="font-size: 0.8rem; opacity: 0.7;">${channel.group}</div>
                                    </div>
                                </div>
                            `;
                        }).join('');
                    }
                }
            } catch (error) {
                document.getElementById('totalChannels').textContent = 'Erro';
                document.getElementById('cacheAge').textContent = '---';
                document.getElementById('cacheStatus').textContent = 'Offline';
                document.getElementById('nextUpdate').textContent = '---';
            }
        }

        loadStats();
    </script>
</body>
</html>
`;

// Servidor
const server = createServer(async (req, res) => {
  const url = req.url;
  const method = req.method;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Roteamento
  if (url === '/' || url === '/index.html') {
    // Página inicial
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML_PAGE);
    
  } else if (url === '/api') {
    // API de canais
    try {
      const now = Date.now();
      let fromCache = true;

      // Verifica cache (24 horas)
      if (!cache.data || now - cache.timestamp > CACHE_TTL) {
        console.log('🔄 Atualizando cache (24h expirado)...');
        cache.data = await loadChannels();
        cache.timestamp = now;
        fromCache = false;
      }

      // Calcula informações do cache
      const cacheAge = now - cache.timestamp;
      const cacheHours = Math.floor(cacheAge / (60 * 60 * 1000));
      const cacheMinutes = Math.floor((cacheAge % (60 * 60 * 1000)) / (60 * 1000));
      
      const nextUpdate = CACHE_TTL - cacheAge;
      const nextUpdateHours = Math.floor(nextUpdate / (60 * 60 * 1000));

      res.writeHead(200, { 
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=86400', // 24 horas
        'X-Cache-Status': fromCache ? 'HIT' : 'MISS',
        'X-Cache-Age': `${cacheHours}h ${cacheMinutes}m`
      });

      res.end(JSON.stringify({
        success: true,
        total: cache.data.length,
        channels: cache.data.slice(0, 50), // Primeiros 50 canais
        last_update: new Date(cache.timestamp).toISOString(),
        cache_info: {
          age: `${cacheHours}h ${cacheMinutes}m`,
          status: fromCache ? 'cache' : 'fresh',
          next_update_in: `${nextUpdateHours}h`,
          ttl_hours: 24
        },
        cache_age: `${cacheHours}h ${cacheMinutes}m`,
        cache_status: fromCache ? 'Ativo' : 'Recém-atualizado',
        next_update: `${nextUpdateHours}h`,
        message: "🎬 Filmes e Séries em breve!",
        endpoints: {
          canais: "https://stream-api-mu.vercel.app/api",
          filmes: "Em breve...",
          series: "Em breve..."
        }
      }));

    } catch (error) {
      console.error('❌ Erro na API:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: "Erro ao carregar canais",
        message: "Tente novamente em alguns minutos",
        cache_status: "error"
      }));
    }
    
  } else {
    // 404 - Não encontrado
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: "Endpoint não encontrado",
      available_endpoints: [
        "GET / - Página inicial",
        "GET /api - API de canais (cache 24h)"
      ]
    }));
  }
});

// Inicia o servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📺 Página: http://localhost:${PORT}/`);
  console.log(`🔗 API: http://localhost:${PORT}/api`);
  console.log(`⏰ Cache: 24 horas`);
  console.log(`🕒 Iniciado em: ${new Date().toLocaleString()}`);
});

// Carrega cache na inicialização
console.log('🔄 Carregando cache inicial...');
loadChannels().then(channels => {
  cache.data = channels;
  cache.timestamp = Date.now();
  console.log(`✅ Cache inicial carregado: ${channels.length} canais`);
});

export default server;
