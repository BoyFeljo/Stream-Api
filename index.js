import express from 'express';
import axios from 'axios';

const app = express();
const PORT = process.env.PORT || 3000;

const M3U_URL = "http://brx.si/get.php?username=magnun&password=magnun10&type=m3u_plus";

// Cache
let cache = { timestamp: 0, data: null };
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 horas

// Middleware
app.use(express.json());
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// Função para parsear apenas canais (baseado no seu exemplo)
function parseM3UChannels(m3uContent) {
    const lines = m3uContent.split(/\r?\n/);
    const channels = [];
    let current = null;

    for (let line of lines) {
        line = line.trim();
        if (!line) continue;

        if (line.startsWith("#EXTINF:")) {
            let name = null;
            let group = "Geral";
            let logo = null;
            let tvgId = null;

            const nameMatch = line.match(/tvg-name="([^"]*)"/i);
            if (nameMatch) name = nameMatch[1];

            const groupMatch = line.match(/group-title="([^"]*)"/i);
            if (groupMatch) group = groupMatch[1];

            const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
            if (logoMatch) logo = logoMatch[1];

            const idMatch = line.match(/tvg-id="([^"]*)"/i);
            if (idMatch) tvgId = idMatch[1];

            if (!name) {
                const parts = line.split(",", 2);
                name = parts[1] ? parts[1].trim() : "Sem nome";
            }

            current = { 
                name, 
                group, 
                logo: logo || null,
                tvgId: tvgId || null
            };
        } else if (line.startsWith("http")) {
            if (!current) {
                current = { 
                    name: "Canal sem nome", 
                    group: "Geral", 
                    logo: null,
                    tvgId: null 
                };
            }
            
            current.url = line;

            // Ignora links de vídeo direto (filmes/episódios)
            if (!current.url.match(/\.(mp4|mkv|avi|mov|flv|webm)$/i)) {
                // Adicionar links próprios da API
                const channelSlug = current.name.toLowerCase()
                    .replace(/[^\w\s]/g, '')
                    .replace(/\s+/g, '-');
                
                current.api_links = {
                    self: `https://stream-api-mu.vercel.app/canal/${channelSlug}`,
                    image: current.logo ? `https://stream-api-mu.vercel.app/logo/${channelSlug}` : null,
                    json: `https://stream-api-mu.vercel.app/api/canais?channel=${encodeURIComponent(current.name)}`
                };

                channels.push(current);
            }

            current = null;
        }
    }

    // Remove duplicados baseado no nome e URL
    const seen = new Set();
    const uniqueChannels = channels.filter(channel => {
        const key = `${channel.name.toLowerCase()}_${channel.url}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    return uniqueChannels;
}

// Baixar e processar lista M3U
async function updateM3UList() {
    try {
        console.log('📥 Baixando lista M3U...');
        const response = await axios.get(M3U_URL, { 
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (response.data && (response.data.includes('#EXTM3U') || response.data.includes('#EXTINF'))) {
            const channels = parseM3UChannels(response.data);
            
            cache.data = channels;
            cache.timestamp = Date.now();
            
            console.log('✅ Canais atualizados com sucesso!');
            console.log(`📊 ${channels.length} canais únicos carregados`);
            
            return channels;
        } else {
            throw new Error('Resposta não contém lista M3U válida');
        }
    } catch (error) {
        console.error('❌ Erro ao baixar lista M3U:', error.message);
        
        // Se já existir dados em cache, mantém eles
        if (cache.data && cache.timestamp > 0) {
            console.log('🔄 Mantendo dados em cache devido ao erro');
            return cache.data;
        }
        return [];
    }
}

// ROTAS DA API

// Página inicial
app.get('/', (req, res) => {
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>🚀 Stream API - Canais TV</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body { 
                font-family: 'Arial', sans-serif; 
                max-width: 1200px; 
                margin: 0 auto; 
                padding: 20px; 
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
            }
            .container { 
                background: rgba(255,255,255,0.1); 
                padding: 30px; 
                border-radius: 15px; 
                backdrop-filter: blur(10px);
            }
            h1 { color: #fff; text-align: center; }
            .endpoint { 
                background: rgba(255,255,255,0.2); 
                padding: 15px; 
                margin: 10px 0; 
                border-radius: 8px; 
                border-left: 4px solid #4CAF50;
            }
            code { 
                background: rgba(0,0,0,0.3); 
                padding: 10px; 
                border-radius: 5px; 
                display: block; 
                margin: 10px 0;
                font-family: 'Courier New', monospace;
            }
            .stats { 
                display: grid; 
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); 
                gap: 15px; 
                margin: 20px 0;
            }
            .stat-card { 
                background: rgba(255,255,255,0.15); 
                padding: 15px; 
                border-radius: 10px; 
                text-align: center;
            }
            .creator { 
                text-align: center; 
                margin-top: 30px; 
                font-style: italic; 
                opacity: 0.8;
            }
            a { color: #4CAF50; text-decoration: none; }
            a:hover { text-decoration: underline; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🎬 STREAM API - CANAIS TV</h1>
            <p><strong>API criada por Boy Feljo</strong> - Extremamente leve e rápida ⚡</p>
            
            <div class="stats">
                <div class="stat-card">
                    <h3>📺 Total de Canais</h3>
                    <p>${cache.data ? cache.data.length : 'Carregando...'}</p>
                </div>
                <div class="stat-card">
                    <h3>🕐 Última Atualização</h3>
                    <p>${cache.timestamp ? new Date(cache.timestamp).toLocaleString('pt-BR') : 'N/A'}</p>
                </div>
                <div class="stat-card">
                    <h3>⚡ Status</h3>
                    <p>${cache.data ? '✅ Ativo' : '🔄 Carregando'}</p>
                </div>
            </div>

            <h2>🔗 Endpoints Disponíveis:</h2>
            
            <div class="endpoint">
                <strong>📡 Todos os Canais (JSON Array):</strong>
                <code><a href="/api/canais" target="_blank">https://stream-api-mu.vercel.app/api/canais</a></code>
                <small>Retorna array JSON puro: [{"name": "...", "url": "...", "logo": "..."}, ...]</small>
            </div>
            
            <div class="endpoint">
                <strong>🔍 Buscar Canal por Nome:</strong>
                <code>https://stream-api-mu.vercel.app/api/canais?search=NOME_DO_CANAL</code>
                <small>Exemplo: <a href="/api/canais?search=globo" target="_blank">/api/canais?search=globo</a></small>
            </div>
            
            <div class="endpoint">
                <strong>📺 Canal Específico:</strong>
                <code>https://stream-api-mu.vercel.app/canal/NOME-DO-CANAL</code>
                <small>Exemplo: <a href="/canal/sbt" target="_blank">/canal/sbt</a></small>
            </div>
            
            <div class="endpoint">
                <strong>🖼️ Logo do Canal:</strong>
                <code>https://stream-api-mu.vercel.app/logo/NOME-DO-CANAL</code>
                <small>Redireciona para a imagem original</small>
            </div>
            
            <div class="endpoint">
                <strong>📊 Estatísticas:</strong>
                <code><a href="/api/stats" target="_blank">https://stream-api-mu.vercel.app/api/stats</a></code>
            </div>
            
            <div class="endpoint">
                <strong>🔄 Forçar Atualização:</strong>
                <code><a href="/api/update" target="_blank">https://stream-api-mu.vercel.app/api/update</a></code>
            </div>

            <div class="creator">
                <p>🚀 Desenvolvido por <strong>Boy Feljo</strong> - API super leve e rápida!</p>
                <p>⚡ JSON puro em array • 🖼️ Links próprios para imagens • 🔍 Busca inteligente</p>
            </div>
        </div>
    </body>
    </html>
    `;
    
    res.send(html);
});

// Todos os canais - RETORNA ARRAY JSON PURO []
app.get('/api/canais', (req, res) => {
    const now = Date.now();
    
    // Verifica se precisa atualizar o cache
    if (!cache.data || now - cache.timestamp > CACHE_TTL) {
        return res.status(503).json({ 
            error: 'Dados em atualização', 
            message: 'Tente novamente em alguns segundos',
            update_url: 'https://stream-api-mu.vercel.app/api/update'
        });
    }

    const search = req.query.search;
    
    // Filtro por busca
    if (search) {
        const filteredChannels = cache.data.filter(channel => 
            channel.name.toLowerCase().includes(search.toLowerCase())
        );
        return res.json(filteredChannels); // Retorna array []
    }

    // Retorna todos os canais como array []
    res.json(cache.data);
});

// Canal específico por slug
app.get('/canal/:slug', (req, res) => {
    if (!cache.data) {
        return res.status(503).json({ error: 'Dados não carregados' });
    }

    const channelSlug = req.params.slug.toLowerCase();
    const channel = cache.data.find(ch => {
        const chSlug = ch.name.toLowerCase()
            .replace(/[^\w\s]/g, '')
            .replace(/\s+/g, '-');
        return chSlug === channelSlug;
    });

    if (!channel) {
        return res.status(404).json({ error: 'Canal não encontrado' });
    }

    res.json(channel);
});

// Redirecionar para logo
app.get('/logo/:slug', (req, res) => {
    if (!cache.data) {
        return res.status(503).json({ error: 'Dados não carregados' });
    }

    const channelSlug = req.params.slug.toLowerCase();
    const channel = cache.data.find(ch => {
        const chSlug = ch.name.toLowerCase()
            .replace(/[^\w\s]/g, '')
            .replace(/\s+/g, '-');
        return chSlug === channelSlug;
    });

    if (!channel || !channel.logo) {
        return res.status(404).json({ error: 'Logo não encontrada' });
    }

    // Redireciona para a imagem original
    res.redirect(channel.logo);
});

// Estatísticas
app.get('/api/stats', (req, res) => {
    const groups = {};
    let withLogos = 0;
    
    if (cache.data) {
        cache.data.forEach(channel => {
            if (!groups[channel.group]) {
                groups[channel.group] = 0;
            }
            groups[channel.group]++;
            
            if (channel.logo) withLogos++;
        });
    }
    
    res.json({
        api: "Stream API - Canais TV",
        creator: "Boy Feljo",
        status: cache.data ? "active" : "loading",
        last_update: cache.timestamp ? new Date(cache.timestamp).toISOString() : "never",
        statistics: {
            total_canais: cache.data ? cache.data.length : 0,
            canais_com_logo: withLogos,
            total_grupos: Object.keys(groups).length,
            grupos: groups
        },
        features: [
            "JSON array puro []",
            "Canais únicos sem duplicação",
            "Capas (null se não existir)",
            "Links próprios da API",
            "Busca por nome",
            "Extremamente rápido ⚡"
        ],
        endpoints: [
            "GET /api/canais - Todos os canais (array)",
            "GET /api/canais?search=nome - Buscar",
            "GET /canal/{nome} - Canal específico",
            "GET /logo/{nome} - Logo do canal",
            "GET /api/stats - Estatísticas",
            "GET /api/update - Atualizar"
        ]
    });
});

// Forçar atualização
app.get('/api/update', async (req, res) => {
    try {
        console.log('🔄 Atualização manual solicitada...');
        const result = await updateM3UList();
        
        res.json({ 
            success: true, 
            message: 'Canais atualizados com sucesso! ⚡',
            creator: "Boy Feljo",
            statistics: {
                total_canais: result.length,
                timestamp: new Date(cache.timestamp).toISOString()
            }
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        cache_age: cache.timestamp ? Date.now() - cache.timestamp : 'never',
        channels_loaded: cache.data ? cache.data.length : 0
    });
});

// Inicializar servidor
async function startServer() {
    try {
        console.log('🚀 Iniciando Stream API - Canais TV...');
        console.log('👨‍💻 Criado por: Boy Feljo');
        
        // Carregar dados na inicialização
        await updateM3UList();
        
        app.listen(PORT, () => {
            console.log(`✅ Stream API rodando na porta ${PORT}`);
            console.log(`📺 Especializada em canais TV`);
            console.log(`⚡ Extremamente leve e rápida`);
            console.log(`🌐 Acesse: https://stream-api-mu.vercel.app`);
            console.log(`🔄 Atualização automática a cada 6 horas`);
        });
    } catch (error) {
        console.error('❌ Erro ao iniciar servidor:', error);
    }
}

// Atualizar automaticamente a cada 6 horas
setInterval(async () => {
    console.log('🔄 Atualização automática dos canais...');
    await updateM3UList();
}, CACHE_TTL);

startServer();

export default app;
