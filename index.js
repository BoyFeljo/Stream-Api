import express from 'express';
import axios from 'axios';

const app = express();
const PORT = process.env.PORT || 3000;

const M3U_URL = "http://asdns.lol/get.php?username=0118689&password=3451067&type=m3u_plus&output=ts";

// Cache para dados e URLs originais
let cache = { 
    timestamp: 0, 
    data: null,
    urlMap: new Map() // Mapeia slug -> URL original
};
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 horas

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// Função para criar slug do canal
function createSlug(name) {
    return name.toLowerCase()
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, '-')
        .substring(0, 50);
}

// Função para parsear apenas canais
function parseM3UChannels(m3uContent) {
    const lines = m3uContent.split(/\r?\n/);
    const channels = [];
    let current = null;
    let currentUrl = null;

    for (let line of lines) {
        line = line.trim();
        if (!line) continue;

        if (line.startsWith("#EXTINF:")) {
            let name = null;
            let group = "Geral";
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

            current = { 
                name: name.trim(),
                group: group.trim(),
                logo: logo || null
            };
        } else if (line.startsWith("http")) {
            currentUrl = line;
            
            if (!current) {
                current = { 
                    name: "Canal sem nome", 
                    group: "Geral", 
                    logo: null
                };
            }
            
            // Ignora links de vídeo direto (filmes/episódios)
            if (!line.match(/\.(mp4|mkv|avi|mov|flv|webm)$/i)) {
                const slug = createSlug(current.name);
                
                // SALVA APENAS: nome, capa, grupo e player (com link do domínio)
                const channelData = {
                    nome: current.name,
                    capa: current.logo ? `https://stream-api-mu.vercel.app/logo/${slug}` : null,
                    grupo: current.group,
                    player: `https://stream-api-mu.vercel.app/play/${slug}`
                };

                // Salva o mapeamento slug -> URL original
                cache.urlMap.set(slug, currentUrl);
                
                channels.push(channelData);
            }

            current = null;
            currentUrl = null;
        }
    }

    // Remove duplicados baseado no nome
    const seen = new Set();
    const uniqueChannels = channels.filter(channel => {
        if (seen.has(channel.nome.toLowerCase())) return false;
        seen.add(channel.nome.toLowerCase());
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
            console.log(`🗺️ ${cache.urlMap.size} URLs mapeados`);
            
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

// Página inicial com player e busca
app.get('/', (req, res) => {
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>🚀 Stream API - Canais TV</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
            }
            
            .container { 
                max-width: 1200px; 
                margin: 0 auto; 
                padding: 20px;
            }
            
            .header {
                text-align: center;
                margin-bottom: 30px;
                padding: 20px;
                background: rgba(255,255,255,0.1);
                border-radius: 15px;
                backdrop-filter: blur(10px);
            }
            
            .search-box {
                background: rgba(255,255,255,0.15);
                padding: 20px;
                border-radius: 10px;
                margin-bottom: 20px;
            }
            
            .search-input {
                width: 100%;
                padding: 12px 20px;
                border: none;
                border-radius: 25px;
                background: rgba(255,255,255,0.9);
                font-size: 16px;
                outline: none;
            }
            
            .player-section {
                background: rgba(0,0,0,0.3);
                border-radius: 10px;
                padding: 20px;
                margin-bottom: 20px;
            }
            
            .video-player {
                width: 100%;
                height: 400px;
                background: #000;
                border-radius: 10px;
                margin-bottom: 15px;
            }
            
            .channel-list {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                gap: 15px;
                margin-top: 20px;
            }
            
            .channel-card {
                background: rgba(255,255,255,0.1);
                border-radius: 10px;
                padding: 15px;
                text-align: center;
                cursor: pointer;
                transition: transform 0.2s;
            }
            
            .channel-card:hover {
                transform: translateY(-5px);
                background: rgba(255,255,255,0.2);
            }
            
            .channel-logo {
                width: 80px;
                height: 80px;
                border-radius: 10px;
                object-fit: cover;
                margin: 0 auto 10px;
                background: rgba(255,255,255,0.1);
            }
            
            .channel-name {
                font-weight: bold;
                margin-bottom: 5px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            
            .channel-group {
                font-size: 12px;
                opacity: 0.8;
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
            
            .endpoints {
                background: rgba(255,255,255,0.1);
                padding: 20px;
                border-radius: 10px;
                margin-top: 20px;
            }
            
            .endpoint {
                background: rgba(255,255,255,0.2);
                padding: 10px;
                margin: 10px 0;
                border-radius: 5px;
                border-left: 4px solid #4CAF50;
            }
            
            code {
                background: rgba(0,0,0,0.3);
                padding: 8px;
                border-radius: 5px;
                font-family: 'Courier New', monospace;
                font-size: 14px;
                display: block;
                margin: 5px 0;
            }
            
            .creator {
                text-align: center;
                margin-top: 30px;
                padding: 20px;
                opacity: 0.8;
            }
            
            .hidden {
                display: none;
            }
            
            .no-results {
                text-align: center;
                padding: 40px;
                opacity: 0.7;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🎬 STREAM API - CANAIS TV</h1>
                <p><strong>API criada por Boy Feljo</strong> - Player completo com suporte M3U8/TS ⚡</p>
            </div>

            <div class="search-box">
                <input type="text" class="search-input" id="searchInput" 
                       placeholder="🔍 Buscar canal por nome...">
            </div>

            <div class="player-section">
                <h3>📺 Player de Canais</h3>
                <video class="video-player" id="videoPlayer" controls>
                    Seu navegador não suporta o elemento de vídeo.
                </video>
                <div id="playerInfo">
                    <p>Selecione um canal para começar a assistir</p>
                </div>
            </div>

            <div class="stats">
                <div class="stat-card">
                    <h3>📺 Total de Canais</h3>
                    <p id="totalChannels">${cache.data ? cache.data.length : 'Carregando...'}</p>
                </div>
                <div class="stat-card">
                    <h3>🕐 Última Atualização</h3>
                    <p id="lastUpdate">${cache.timestamp ? new Date(cache.timestamp).toLocaleString('pt-BR') : 'N/A'}</p>
                </div>
                <div class="stat-card">
                    <h3>⚡ Status</h3>
                    <p id="apiStatus">${cache.data ? '✅ Ativo' : '🔄 Carregando'}</p>
                </div>
            </div>

            <h3>📡 Lista de Canais</h3>
            <div class="channel-list" id="channelList">
                <div class="no-results" id="loadingMessage">
                    🔄 Carregando canais...
                </div>
            </div>

            <div class="endpoints">
                <h3>🔗 Endpoints da API</h3>
                <div class="endpoint">
                    <strong>📡 Todos os Canais (JSON):</strong>
                    <code><a href="/api/canais" target="_blank">https://stream-api-mu.vercel.app/api/canais</a></code>
                </div>
                <div class="endpoint">
                    <strong>🔍 Buscar Canal:</strong>
                    <code>https://stream-api-mu.vercel.app/api/canais?search=NOME</code>
                </div>
                <div class="endpoint">
                    <strong>📂 Por Grupo:</strong>
                    <code>https://stream-api-mu.vercel.app/api/canais?group=GRUPO</code>
                </div>
            </div>

            <div class="creator">
                <p>🚀 Desenvolvido por <strong>Boy Feljo</strong> - Player completo com suporte M3U8/TS</p>
            </div>
        </div>

        <script>
            let allChannels = [];
            const videoPlayer = document.getElementById('videoPlayer');
            const playerInfo = document.getElementById('playerInfo');
            const searchInput = document.getElementById('searchInput');
            const channelList = document.getElementById('channelList');
            const loadingMessage = document.getElementById('loadingMessage');

            // Carregar canais
            async function loadChannels() {
                try {
                    const response = await fetch('/api/canais');
                    if (!response.ok) throw new Error('Falha ao carregar canais');
                    
                    allChannels = await response.json();
                    displayChannels(allChannels);
                    updateStats();
                } catch (error) {
                    loadingMessage.innerHTML = '❌ Erro ao carregar canais';
                    console.error(error);
                }
            }

            // Exibir canais
            function displayChannels(channels) {
                if (channels.length === 0) {
                    channelList.innerHTML = '<div class="no-results">Nenhum canal encontrado</div>';
                    return;
                }

                channelList.innerHTML = channels.map(channel => \`
                    <div class="channel-card" onclick="playChannel('\${channel.nome}', '\${channel.player}')">
                        <img src="\${channel.capa || 'https://via.placeholder.com/80/667eea/ffffff?text=TV'}" 
                             alt="\${channel.nome}" 
                             class="channel-logo"
                             onerror="this.src='https://via.placeholder.com/80/667eea/ffffff?text=TV'">
                        <div class="channel-name">\${channel.nome}</div>
                        <div class="channel-group">\${channel.grupo}</div>
                    </div>
                \`).join('');
            }

            // Reproduzir canal
            async function playChannel(channelName, playerUrl) {
                try {
                    playerInfo.innerHTML = \`<p>🔄 Carregando: \${channelName}</p>\`;
                    
                    // Extrai o slug da URL do player
                    const slug = playerUrl.split('/').pop();
                    
                    // Faz requisição para o endpoint de play
                    const response = await fetch(\`/play/\${slug}\`);
                    const data = await response.json();
                    
                    if (data.streamUrl) {
                        videoPlayer.src = data.streamUrl;
                        videoPlayer.load();
                        
                        playerInfo.innerHTML = \`
                            <p>🎥 <strong>\${channelName}</strong></p>
                            <p>📡 Tipo: \${data.streamType}</p>
                            <p>⚡ Status: Pronto para reproduzir</p>
                        \`;
                        
                        // Tenta reproduzir automaticamente
                        videoPlayer.play().catch(e => {
                            console.log('Reprodução automática bloqueada, clique para iniciar');
                        });
                    } else {
                        playerInfo.innerHTML = \`<p>❌ Erro ao carregar o canal: \${channelName}</p>\`;
                    }
                } catch (error) {
                    playerInfo.innerHTML = \`<p>❌ Erro ao carregar: \${channelName}</p>\`;
                    console.error('Erro no player:', error);
                }
            }

            // Buscar canais
            function searchChannels() {
                const searchTerm = searchInput.value.toLowerCase();
                
                if (searchTerm === '') {
                    displayChannels(allChannels);
                    return;
                }

                const filtered = allChannels.filter(channel =>
                    channel.nome.toLowerCase().includes(searchTerm) ||
                    channel.grupo.toLowerCase().includes(searchTerm)
                );
                
                displayChannels(filtered);
            }

            // Atualizar estatísticas
            function updateStats() {
                document.getElementById('totalChannels').textContent = allChannels.length;
                document.getElementById('apiStatus').textContent = '✅ Ativo';
            }

            // Event listeners
            searchInput.addEventListener('input', searchChannels);
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') searchChannels();
            });

            // Inicializar
            loadChannels();
        </script>
    </body>
    </html>
    `;
    
    res.send(html);
});

// Todos os canais - RETORNA ARRAY JSON PURO []
app.get('/api/canais', (req, res) => {
    const now = Date.now();
    
    if (!cache.data || now - cache.timestamp > CACHE_TTL) {
        return res.status(503).json({ 
            error: 'Dados em atualização', 
            message: 'Tente novamente em alguns segundos',
            update_url: 'https://stream-api-mu.vercel.app/api/update'
        });
    }

    const search = req.query.search;
    const group = req.query.group;
    
    let filteredChannels = cache.data;

    if (search) {
        filteredChannels = filteredChannels.filter(channel => 
            channel.nome.toLowerCase().includes(search.toLowerCase())
        );
    }

    if (group) {
        filteredChannels = filteredChannels.filter(channel => 
            channel.grupo.toLowerCase().includes(group.toLowerCase())
        );
    }

    res.json(filteredChannels);
});

// Player do canal - FUNCIONA COM M3U8/TS
app.get('/play/:slug', async (req, res) => {
    try {
        const slug = req.params.slug;
        const originalUrl = cache.urlMap.get(slug);

        if (!originalUrl) {
            return res.status(404).json({ 
                error: 'Canal não encontrado',
                slug: slug
            });
        }

        // Detecta o tipo de stream
        let streamType = 'm3u8';
        if (originalUrl.includes('.ts')) {
            streamType = 'ts';
        } else if (originalUrl.includes('.m3u8')) {
            streamType = 'm3u8';
        }

        // Retorna a URL do stream para o player
        res.json({
            success: true,
            channel: slug,
            streamUrl: originalUrl,
            streamType: streamType,
            player: 'https://stream-api-mu.vercel.app/',
            supported: ['m3u8', 'ts', 'mp4']
        });

    } catch (error) {
        res.status(500).json({
            error: 'Erro no player',
            message: error.message
        });
    }
});

// Logo do canal (redireciona para imagem original)
app.get('/logo/:slug', async (req, res) => {
    try {
        const slug = req.params.slug;
        
        // Encontra o canal pelo slug
        const channel = cache.data?.find(ch => {
            const channelSlug = createSlug(ch.nome);
            return channelSlug === slug;
        });

        if (!channel || !channel.capa) {
            // Retorna placeholder se não tiver logo
            return res.redirect('https://via.placeholder.com/300/667eea/ffffff?text=TV');
        }

        // Se a capa já for uma URL completa, redireciona
        if (channel.capa.startsWith('http')) {
            return res.redirect(channel.capa);
        }

        // Para URLs relativas, constrói a URL completa
        res.redirect(channel.capa);

    } catch (error) {
        res.redirect('https://via.placeholder.com/300/667eea/ffffff?text=TV');
    }
});

// Estatísticas
app.get('/api/stats', (req, res) => {
    const groups = {};
    let withLogos = 0;
    
    if (cache.data) {
        cache.data.forEach(channel => {
            if (!groups[channel.grupo]) {
                groups[channel.grupo] = 0;
            }
            groups[channel.grupo]++;
            
            if (channel.capa) withLogos++;
        });
    }
    
    res.json({
        api: "Stream API - Canais TV",
        creator: "Boy Feljo",
        status: cache.data ? "active" : "loading",
        last_update: cache.timestamp ? new Date(cache.timestamp).toISOString() : "never",
        statistics: {
            total_canais: cache.data ? cache.data.length : 0,
            canais_com_capa: withLogos,
            total_grupos: Object.keys(groups).length,
            grupos: groups,
            urls_mapeados: cache.urlMap.size
        }
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
        channels_loaded: cache.data ? cache.data.length : 0,
        urls_mapeados: cache.urlMap.size
    });
});

// Inicializar servidor
async function startServer() {
    try {
        console.log('🚀 Iniciando Stream API - Canais TV...');
        console.log('👨‍💻 Criado por: Boy Feljo');
        console.log('🎬 Player completo com suporte M3U8/TS');
        
        await updateM3UList();
        
        app.listen(PORT, () => {
            console.log(`✅ Stream API rodando na porta ${PORT}`);
            console.log(`📺 Player funcionando com links reais`);
            console.log(`🌐 Acesse: https://stream-api-mu.vercel.app`);
            console.log(`🔄 Atualização automática a cada 6 horas`);
        });
    } catch (error) {
        console.error('❌ Erro ao iniciar servidor:', error);
    }
}

// Atualizar automaticamente
setInterval(async () => {
    console.log('🔄 Atualização automática dos canais...');
    await updateM3UList();
}, CACHE_TTL);

startServer();

export default app;
