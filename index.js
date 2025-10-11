import express from 'express';
import axios from 'axios';
import nodeCron from 'node-cron';

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

// Função para parsear M3U
function parseM3U(content) {
    const lines = content.split('\n');
    const items = [];
    let currentItem = {};
    let categories = {
        filmes: [],
        series: [],
        canais: [],
        outros: []
    };

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
                    logo: attrs.tvg_logo || '',
                    tvgId: attrs.tvg_id || '',
                    tvgName: attrs.tvg_name || '',
                    tvgLogo: attrs.tvg_logo || '',
                    type: classifyType(name, attrs.group_title)
                };
            }
        } else if (trimmedLine && !trimmedLine.startsWith('#') && currentItem.name) {
            currentItem.url = trimmedLine;
            
            // Classificar por tipo
            const type = currentItem.type;
            if (categories[type]) {
                categories[type].push({
                    id: currentItem.id,
                    name: currentItem.name,
                    logo: currentItem.logo,
                    group: currentItem.group,
                    url: currentItem.url,
                    type: currentItem.type
                });
            }
            
            items.push(currentItem);
            currentItem = {};
        }
    }

    // Organizar categorias únicas
    const uniqueCategories = {
        filmes: getUniqueCategories(categories.filmes),
        series: getUniqueCategories(categories.series),
        canais: getUniqueCategories(categories.canais),
        outros: getUniqueCategories(categories.outros)
    };

    return {
        metadata: {
            totalItems: items.length,
            totalFilmes: categories.filmes.length,
            totalSeries: categories.series.length,
            totalCanais: categories.canais.length,
            totalOutros: categories.outros.length,
            lastUpdated: new Date().toISOString()
        },
        categories: uniqueCategories,
        allItems: items
    };
}

// Classificar tipo de conteúdo
function classifyType(name, group) {
    const lowerName = name.toLowerCase();
    const lowerGroup = (group || '').toLowerCase();

    if (lowerName.includes('filme') || lowerName.includes('movie') || 
        lowerGroup.includes('filmes') || lowerGroup.includes('movie')) {
        return 'filmes';
    }
    
    if (lowerName.includes('série') || lowerName.includes('serie') || 
        lowerName.includes('temp') || lowerName.includes('epis') || 
        lowerName.includes('season') || lowerGroup.includes('series')) {
        return 'series';
    }
    
    if (lowerName.includes('hd') || lowerName.includes('fhd') || 
        lowerGroup.includes('tv') || lowerGroup.includes('canal')) {
        return 'canais';
    }
    
    return 'outros';
}

// Obter categorias únicas
function getUniqueCategories(items) {
    const categories = {};
    items.forEach(item => {
        if (!categories[item.group]) {
            categories[item.group] = [];
        }
        categories[item.group].push(item);
    });
    return categories;
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
            const parsedData = parseM3U(response.data);
            
            // Salvar no cache por 24 horas
            cache.set('m3u_data', parsedData);
            cache.set('last_update', new Date().toISOString());
            
            console.log('✅ Lista M3U atualizada com sucesso!');
            console.log(`📊 Estatísticas: ${parsedData.metadata.totalFilmes} filmes, ${parsedData.metadata.totalSeries} séries, ${parsedData.metadata.totalCanais} canais`);
            
            return parsedData;
        } else {
            throw new Error('Resposta não contém lista M3U válida');
        }
    } catch (error) {
        console.error('❌ Erro ao baixar lista M3U:', error.message);
        
        // Se já existir dados em cache, mantém eles
        if (cache.get('m3u_data')) {
            console.log('🔄 Mantendo dados em cache devido ao erro');
            return cache.get('m3u_data');
        }
        return null;
    }
}

// Agendar atualização automática a cada 6 horas (Vercel tem limites)
nodeCron.schedule('0 */6 * * *', async () => {
    console.log('🔄 Atualização automática da lista M3U...');
    await updateM3UList();
});

// ROTAS DA API

// Health check
app.get('/', (req, res) => {
    const data = cache.get('m3u_data');
    res.json({ 
        message: '🚀 Stream API Online - M3U Processor',
        status: data ? 'active' : 'loading',
        lastUpdate: cache.get('last_update') || 'never',
        endpoints: {
            '/api/all': 'Todos os itens',
            '/api/filmes': 'Lista de filmes',
            '/api/series': 'Lista de séries', 
            '/api/canais': 'Lista de canais',
            '/api/categories': 'Categorias organizadas',
            '/api/update': 'Forçar atualização',
            '/api/stats': 'Estatísticas',
            '/api/search?q=nome': 'Buscar por nome'
        },
        statistics: data ? data.metadata : null
    });
});

// Todos os itens
app.get('/api/all', (req, res) => {
    const data = cache.get('m3u_data');
    if (!data) {
        return res.status(404).json({ error: 'Lista não carregada ainda. Tente /api/update primeiro.' });
    }
    res.json(data);
});

// Apenas filmes
app.get('/api/filmes', (req, res) => {
    const data = cache.get('m3u_data');
    if (!data) {
        return res.status(404).json({ error: 'Lista não carregada ainda. Tente /api/update primeiro.' });
    }
    res.json({
        metadata: {
            total: data.metadata.totalFilmes,
            lastUpdated: data.metadata.lastUpdated
        },
        categories: data.categories.filmes,
        items: data.allItems.filter(item => item.type === 'filmes')
    });
});

// Apenas séries
app.get('/api/series', (req, res) => {
    const data = cache.get('m3u_data');
    if (!data) {
        return res.status(404).json({ error: 'Lista não carregada ainda. Tente /api/update primeiro.' });
    }
    res.json({
        metadata: {
            total: data.metadata.totalSeries,
            lastUpdated: data.metadata.lastUpdated
        },
        categories: data.categories.series,
        items: data.allItems.filter(item => item.type === 'series')
    });
});

// Apenas canais
app.get('/api/canais', (req, res) => {
    const data = cache.get('m3u_data');
    if (!data) {
        return res.status(404).json({ error: 'Lista não carregada ainda. Tente /api/update primeiro.' });
    }
    res.json({
        metadata: {
            total: data.metadata.totalCanais,
            lastUpdated: data.metadata.lastUpdated
        },
        categories: data.categories.canais,
        items: data.allItems.filter(item => item.type === 'canais')
    });
});

// Categorias organizadas
app.get('/api/categories', (req, res) => {
    const data = cache.get('m3u_data');
    if (!data) {
        return res.status(404).json({ error: 'Lista não carregada ainda. Tente /api/update primeiro.' });
    }
    res.json(data.categories);
});

// Estatísticas
app.get('/api/stats', (req, res) => {
    const data = cache.get('m3u_data');
    const lastUpdate = cache.get('last_update');
    
    res.json({
        status: data ? 'loaded' : 'not_loaded',
        lastUpdate: lastUpdate || 'never',
        cacheSize: cache.size,
        statistics: data ? data.metadata : null
    });
});

// Buscar por nome
app.get('/api/search', (req, res) => {
    const data = cache.get('m3u_data');
    if (!data) {
        return res.status(404).json({ error: 'Lista não carregada ainda. Tente /api/update primeiro.' });
    }

    const query = (req.query.q || '').toLowerCase();
    if (!query) {
        return res.status(400).json({ error: 'Parâmetro "q" é obrigatório' });
    }

    const results = data.allItems.filter(item => 
        item.name.toLowerCase().includes(query) ||
        (item.group && item.group.toLowerCase().includes(query))
    );

    res.json({
        query,
        total: results.length,
        results
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
                message: 'Lista atualizada com sucesso!',
                statistics: result.metadata
            });
        } else {
            res.status(500).json({ 
                success: false, 
                error: 'Falha ao atualizar a lista' 
            });
        }
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Item por ID
app.get('/api/item/:id', (req, res) => {
    const data = cache.get('m3u_data');
    if (!data) {
        return res.status(404).json({ error: 'Lista não carregada ainda. Tente /api/update primeiro.' });
    }

    const item = data.allItems.find(i => i.id === req.params.id);
    if (!item) {
        return res.status(404).json({ error: 'Item não encontrado' });
    }

    res.json(item);
});

// Inicializar servidor
async function startServer() {
    try {
        // Tentar carregar a lista na inicialização
        console.log('🚀 Iniciando Stream API na Vercel...');
        await updateM3UList();
        
        app.listen(PORT, () => {
            console.log(`✅ Stream API rodando na porta ${PORT}`);
            console.log(`📊 Endpoints disponíveis em https://stream-api-mu.vercel.app`);
            console.log('🔄 Atualização automática agendada a cada 6 horas');
        });
    } catch (error) {
        console.error('❌ Erro ao iniciar servidor:', error);
        // Não sair do processo na Vercel
    }
}

startServer();

export default app;
