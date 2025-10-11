import express from 'express';
import axios from 'axios';

const app = express();
const PORT = process.env.PORT || 3000;

// Cache em memória
const cache = new Map();

// Configuração da lista M3U
const M3U_URL = 'http://brx.si/get.php?username=magnun&password=magnun10&type=m3u_plus';

// Middleware
app.use(express.json());
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// Função para remover duplicados baseado no nome e logo
function removeDuplicateChannels(channels) {
    const seen = new Set();
    const uniqueChannels = [];
    
    for (const channel of channels) {
        const key = `${channel.name.toLowerCase()}_${channel.logo || 'no-logo'}`;
        if (!seen.has(key)) {
            seen.add(key);
            uniqueChannels.push(channel);
        }
    }
    
    return uniqueChannels;
}

// Função para parsear M3U e extrair apenas canais
function parseM3UChannels(content) {
    const lines = content.split('\n');
    const channels = [];
    let currentItem = {};

    for (const line of lines) {
        const trimmedLine = line.trim();
        
        if (trimmedLine.startsWith('#EXTINF:')) {
            const match = trimmedLine.match(/#EXTINF:(-?\d+)\s*(.*?),(.*)/);
            if (match) {
                const [_, duration, attributes, name] = match;
                
                // Extrair atributos
                const attrs = {};
                const attrMatches = attributes.match(/(\w+)="([^"]*)"/g) || [];
                
                attrMatches.forEach(attr => {
                    const [key, value] = attr.split('=');
                    if (key && value) {
                        attrs[key] = value.replace(/"/g, '');
                    }
                });

                currentItem = {
                    id: attrs.tvg_id || Math.random().toString(36).substr(2, 9),
                    name: name.trim(),
                    duration: parseInt(duration),
                    group: attrs.group_title || 'Geral',
                    logo: attrs.tvg_logo || null, // null se não existir
                    tvgId: attrs.tvg_id || '',
                    tvgName: attrs.tvg_name || '',
                    tvgLogo: attrs.tvg_logo || null,
                    type: 'channel'
                };
            }
        } else if (trimmedLine && !trimmedLine.startsWith('#') && currentItem.name) {
            currentItem.url = trimmedLine;
            
            // Adicionar links próprios da API
            currentItem.api_links = {
                self: `https://stream-api-mu.vercel.app/api/canais/${encodeURIComponent(currentItem.name)}`,
                json: `https://stream-api-mu.vercel.app/api/canais?channel=${encodeURIComponent(currentItem.name)}`,
                group: `https://stream-api-mu.vercel.app/api/canais?group=${encodeURIComponent(currentItem.group)}`
            };
            
            channels.push(currentItem);
            currentItem = {};
        }
    }

    // Remover canais duplicados
    const uniqueChannels = removeDuplicateChannels(channels);
    
    // Organizar por grupos
    const groups = {};
    uniqueChannels.forEach(channel => {
        if (!groups[channel.group]) {
            groups[channel.group] = [];
        }
        groups[channel.group].push(channel);
    });

    return {
        metadata: {
            total_canais: uniqueChannels.length,
            total_grupos: Object.keys(groups).length,
            last_updated: new Date().toISOString(),
            api_version: "1.0",
            creator: "Boy Feljo"
        },
        groups: groups,
        all_channels: uniqueChannels
    };
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

        if (response.data && response.data.includes('#EXTM3U')) {
            const parsedData = parseM3UChannels(response.data);
            
            // Salvar no cache
            cache.set('channels_data', parsedData);
            cache.set('last_update', new Date().toISOString());
            
            console.log('✅ Canais atualizados com sucesso!');
            console.log(`📊 ${parsedData.metadata.total_canais} canais únicos em ${parsedData.metadata.total_grupos} grupos`);
            
            return parsedData;
        } else {
            throw new Error('Resposta não contém lista M3U válida');
        }
    } catch (error) {
        console.error('❌ Erro ao baixar lista M3U:', error.message);
        
        // Se já existir dados em cache, mantém eles
        if (cache.get('channels_data')) {
            console.log('🔄 Mantendo dados em cache devido ao erro');
            return cache.get('channels_data');
        }
        return null;
    }
}

// ROTAS DA API

// Página inicial
app.get('/', (req, res) => {
    const data = cache.get('channels_data');
    
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
                    <p>${data ? data.metadata.total_canais : 'Carregando...'}</p>
                </div>
                <div class="stat-card">
                    <h3>📁 Grupos</h3>
                    <p>${data ? data.metadata.total_grupos : 'Carregando...'}</p>
                </div>
                <div class="stat-card">
                    <h3>🕐 Última Atualização</h3>
                    <p>${data ? new Date(data.metadata.last_updated).toLocaleString('pt-BR') : 'N/A'}</p>
                </div>
            </div>

            <h2>🔗 Endpoints Disponíveis:</h2>
            
            <div class="endpoint">
                <strong>📡 Todos os Canais (JSON):</strong>
                <code><a href="/api/canais" target="_blank">https://stream-api-mu.vercel.app/api/canais</a></code>
            </div>
            
            <div class="endpoint">
                <strong>🔍 Buscar Canal por Nome:</strong>
                <code>https://stream-api-mu.vercel.app/api/canais?channel=NOME_DO_CANAL</code>
                <small>Exemplo: <a href="/api/canais?channel=globo" target="_blank">/api/canais?channel=globo</a></small>
            </div>
            
            <div class="endpoint">
                <strong>📂 Canais por Grupo:</strong>
                <code>https://stream-api-mu.vercel.app/api/canais?group=NOME_DO_GRUPO</code>
                <small>Exemplo: <a href="/api/canais?group=Esportes" target="_blank">/api/canais?group=Esportes</a></small>
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
            </div>
        </div>
    </body>
    </html>
    `;
    
    res.send(html);
});

// Todos os canais (JSON puro)
app.get('/api/canais', (req, res) => {
    const data = cache.get('channels_data');
    if (!data) {
        return res.status(404).json({ error: 'Canais não carregados ainda. Tente /api/update primeiro.' });
    }

    const channelName = req.query.channel;
    const groupName = req.query.group;

    // Filtro por nome do canal
    if (channelName) {
        const filteredChannels = data.all_channels.filter(channel => 
            channel.name.toLowerCase().includes(channelName.toLowerCase())
        );
        return res.json({
            metadata: {
                search_query: channelName,
                total_results: filteredChannels.length,
                search_type: "channel_name"
            },
            results: filteredChannels
        });
    }

    // Filtro por grupo
    if (groupName) {
        const filteredChannels = data.all_channels.filter(channel => 
            channel.group.toLowerCase().includes(groupName.toLowerCase())
        );
        return res.json({
            metadata: {
                search_query: groupName,
                total_results: filteredChannels.length,
                search_type: "group"
            },
            results: filteredChannels
        });
    }

    // Retorna todos os canais
    res.json(data);
});

// Canal específico por nome
app.get('/api/canais/:name', (req, res) => {
    const data = cache.get('channels_data');
    if (!data) {
        return res.status(404).json({ error: 'Canais não carregados ainda.' });
    }

    const channelName = decodeURIComponent(req.params.name);
    const channel = data.all_channels.find(ch => 
        ch.name.toLowerCase() === channelName.toLowerCase()
    );

    if (!channel) {
        return res.status(404).json({ error: 'Canal não encontrado' });
    }

    res.json(channel);
});

// Estatísticas
app.get('/api/stats', (req, res) => {
    const data = cache.get('channels_data');
    const lastUpdate = cache.get('last_update');
    
    res.json({
        api: "Stream API - Canais TV",
        creator: "Boy Feljo",
        status: data ? "active" : "loading",
        last_update: lastUpdate || "never",
        cache_size: cache.size,
        statistics: data ? data.metadata : null,
        features: [
            "Canais únicos sem duplicação",
            "Capas (null se não existir)",
            "Links próprios da API",
            "Busca por nome e grupo",
            "JSON puro e otimizado",
            "Extremamente rápido ⚡"
        ]
    });
});

// Forçar atualização
app.get('/api/update', async (req, res) => {
    try {
        console.log('🔄 Atualização manual solicitada...');
        const result = await updateM3UList();
        
        if (result) {
            res.json({ 
                success: true, 
                message: 'Canais atualizados com sucesso! ⚡',
                creator: "Boy Feljo",
                statistics: result.metadata
            });
        } else {
            res.status(500).json({ 
                success: false, 
                error: 'Falha ao atualizar os canais' 
            });
        }
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Inicializar servidor
async function startServer() {
    try {
        console.log('🚀 Iniciando Stream API - Canais TV...');
        console.log('👨‍💻 Criado por: Boy Feljo');
        await updateM3UList();
        
        app.listen(PORT, () => {
            console.log(`✅ Stream API rodando na porta ${PORT}`);
            console.log(`📺 Especializada em canais TV`);
            console.log(`⚡ Extremamente leve e rápida`);
            console.log(`🌐 Acesse: https://stream-api-mu.vercel.app`);
        });
    } catch (error) {
        console.error('❌ Erro ao iniciar servidor:', error);
    }
}

// Atualizar a cada 6 horas
setInterval(async () => {
    console.log('🔄 Atualização automática dos canais...');
    await updateM3UList();
}, 6 * 60 * 60 * 1000);

startServer();

export default app;
