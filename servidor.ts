/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import { db } from './src/server/db.js';
import { 
  User, Device, ActivationCode, Playlist, Category, Channel, 
  Movie, Series, Episode 
} from './src/types.js';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Lazy-initialized Gemini API client
let aiClient: GoogleGenAI | null = null;
function getAI() {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (key && key !== 'MY_GEMINI_API_KEY') {
      aiClient = new GoogleGenAI({ apiKey: key });
    }
  }
  return aiClient;
}

// Helper: Custom M3U Playlist Parser
function parseM3UPlaylist(content: string, playlistId: string): { 
  categories: Category[], 
  channels: Channel[], 
  movies: Movie[], 
  series: Series[], 
  episodes: Episode[] 
} {
  const lines = content.split('\n');
  const categoriesMap = new Map<string, Category>();
  const channels: Channel[] = [];
  const movies: Movie[] = [];
  const series: Series[] = [];
  const episodes: Episode[] = [];

  let currentInfo: {
    name: string;
    logo: string;
    group: string;
    epgId?: string;
  } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF:')) {
      // Parse attributes
      const nameMatch = line.match(/,(.+)$/);
      const name = nameMatch ? nameMatch[1].trim() : 'Canal Desconhecido';
      
      const logoMatch = line.match(/tvg-logo="([^"]+)"/) || line.match(/logo="([^"]+)"/);
      const logo = logoMatch ? logoMatch[1] : 'https://images.unsplash.com/photo-1598257006458-087169a1f08d?w=120&auto=format&fit=crop&q=80';
      
      const groupMatch = line.match(/group-title="([^"]+)"/) || line.match(/group="([^"]+)"/);
      const group = groupMatch ? groupMatch[1] : 'Geral';

      const epgMatch = line.match(/tvg-id="([^"]+)"/);
      const epgId = epgMatch ? epgMatch[1] : undefined;

      currentInfo = { name, logo, group, epgId };
    } else if (line.startsWith('http') && currentInfo) {
      const url = line;
      const isMovie = url.includes('.mp4') || url.includes('.mkv') || url.includes('/movie/');
      const isSeries = url.includes('/series/') || url.includes('/episodes/');

      const type = isMovie ? 'movie' : (isSeries ? 'series' : 'channel');
      const categoryId = `cat-${type}-${currentInfo.group.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

      if (!categoriesMap.has(categoryId)) {
        categoriesMap.set(categoryId, {
          id: categoryId,
          name: currentInfo.group,
          type
        });
      }

      if (isMovie) {
        movies.push({
          id: `mov-${Math.random().toString(36).substr(2, 9)}`,
          playlistId,
          name: currentInfo.name,
          categoryId,
          categoryName: currentInfo.group,
          url,
          poster: currentInfo.logo || 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=400&auto=format&fit=crop&q=80',
          background: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=1200&auto=format&fit=crop&q=80',
          description: 'Carregado via playlist M3U. Nenhum metadado adicional disponível inicialmente.',
          duration: 'N/A',
          year: new Date().getFullYear(),
          rating: 7.0,
          genre: currentInfo.group,
          cast: 'N/A',
          director: 'N/A'
        });
      } else if (isSeries) {
        // Find or create series
        const seriesName = currentInfo.name.split(/S\d+E\d+|T\d+E\d+|Episódio/i)[0].trim() || currentInfo.name;
        let sItem = series.find(s => s.name === seriesName);
        if (!sItem) {
          sItem = {
            id: `ser-${Math.random().toString(36).substr(2, 9)}`,
            playlistId,
            name: seriesName,
            categoryId,
            categoryName: currentInfo.group,
            poster: currentInfo.logo || 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400&auto=format&fit=crop&q=80',
            background: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1200&auto=format&fit=crop&q=80',
            description: 'Série importada do M3U.',
            rating: 7.0,
            genre: currentInfo.group
          };
          series.push(sItem);
        }

        // Detect season and episode number
        const seasonMatch = currentInfo.name.match(/S(\d+)/i) || currentInfo.name.match(/T(\d+)/i);
        const episodeMatch = currentInfo.name.match(/E(\d+)/i) || currentInfo.name.match(/Episódio\s*(\d+)/i);
        
        const season = seasonMatch ? parseInt(seasonMatch[1]) : 1;
        const epNum = episodeMatch ? parseInt(episodeMatch[1]) : 1;

        episodes.push({
          id: `ep-${Math.random().toString(36).substr(2, 9)}`,
          seriesId: sItem.id,
          name: currentInfo.name,
          url,
          season,
          episodeNumber: epNum,
          description: `Episódio ${epNum} da Temporada ${season}`,
          duration: 'N/A',
          thumbnail: currentInfo.logo || 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=300&auto=format&fit=crop&q=80'
        });
      } else {
        channels.push({
          id: `ch-${Math.random().toString(36).substr(2, 9)}`,
          playlistId,
          name: currentInfo.name,
          logo: currentInfo.logo,
          categoryId,
          categoryName: currentInfo.group,
          url,
          epgId: currentInfo.epgId
        });
      }

      currentInfo = null;
    }
  }

  return {
    categories: Array.from(categoriesMap.values()),
    channels,
    movies,
    series,
    episodes
  };
}

// --- AUTHENTICATION ENDPOINTS ---

// Login with Email/Password
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.getUsers().find(u => u.email.toLowerCase() === email.toLowerCase());

  if (!user) {
    db.addLog('warning', `Tentativa de login falhou: e-mail não encontrado (${email})`);
    return res.status(401).json({ error: 'Credenciais inválidas. Verifique seu e-mail.' });
  }

  if (user.password !== password) {
    db.addLog('warning', `Tentativa de login falhou: senha incorreta (${email})`);
    return res.status(401).json({ error: 'Credenciais inválidas. Verifique sua senha.' });
  }

  if (user.subscriptionStatus === 'suspended') {
    db.addLog('warning', `Tentativa de login bloqueada: usuário suspenso (${email})`);
    return res.status(403).json({ error: 'Esta conta está suspensa pelo administrador.' });
  }

  // Check expiration
  if (user.role !== 'admin' && new Date(user.expirationDate).getTime() < Date.now()) {
    user.subscriptionStatus = 'expired';
    db.updateUsers(db.getUsers());
    db.addLog('warning', `A assinatura do usuário expirou (${email})`);
    return res.status(403).json({ error: 'Sua assinatura expirou. Entre em contato com o suporte.' });
  }

  db.addLog('info', `Usuário realizou login: ${user.name}`, user.email);
  const userPayload = { ...user };
  delete userPayload.password;
  res.json({ user: userPayload });
});

// Login or Activation with Activation Code
app.post('/api/auth/activate', (req, res) => {
  const { code, deviceName, deviceType } = req.body;
  const activation = db.getActivationCodes().find(c => c.code.toUpperCase() === code.toUpperCase());

  if (!activation) {
    db.addLog('warning', `Tentativa de ativação inválida: código inexistente (${code})`);
    return res.status(404).json({ error: 'Código de ativação inválido.' });
  }

  if (activation.status !== 'active') {
    return res.status(400).json({ error: `Este código de ativação está atualmente ${activation.status}.` });
  }

  if (new Date(activation.expiresAt).getTime() < Date.now()) {
    activation.status = 'expired';
    db.updateActivationCodes(db.getActivationCodes());
    return res.status(400).json({ error: 'Este código de ativação já expirou.' });
  }

  // Generate dynamic client user for this activation code if not already linked
  let user = db.getUsers().find(u => u.email === `client_${code.toLowerCase()}@picapau.com`);
  if (!user) {
    const expirationDate = new Date(Date.now() + activation.durationDays * 24 * 60 * 60 * 1000).toISOString();
    user = {
      id: `user-${Math.random().toString(36).substr(2, 9)}`,
      name: `Cliente Picapau (${code})`,
      email: `client_${code.toLowerCase()}@picapau.com`,
      role: 'user',
      subscriptionStatus: 'active',
      expirationDate,
      deviceLimit: activation.deviceLimit,
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
      defaultPlayer: 'internal',
      autoLogin: true,
      favoriteCategories: [],
    };
    db.addUser(user);
    
    activation.isUsed = true;
    activation.usedByEmail = user.email;
    db.updateActivationCodes(db.getActivationCodes());
  }

  db.addLog('info', `Código de ativação '${code}' utilizado com sucesso.`);
  const userPayload = { ...user };
  delete userPayload.password;
  res.json({ user: userPayload });
});

// Register Device and enforce device limit
app.post('/api/auth/register-device', (req, res) => {
  const { userId, type, name, androidVersion, ipAddress, country } = req.body;
  const user = db.getUsers().find(u => u.id === userId);

  if (!user) {
    return res.status(404).json({ error: 'Usuário não encontrado.' });
  }

  const userDevices = db.getDevices().filter(d => d.userId === userId && d.status === 'active');
  const existingDeviceIndex = db.getDevices().findIndex(d => d.userId === userId && d.name === name && d.type === type);

  let currentDevice: Device;

  if (existingDeviceIndex >= 0) {
    currentDevice = db.getDevices()[existingDeviceIndex];
    if (currentDevice.status === 'blocked') {
      db.addLog('warning', `Acesso negado: Dispositivo bloqueado (${name}) para o usuário ${user.email}`);
      return res.status(403).json({ error: 'Este dispositivo foi bloqueado pelo administrador.' });
    }
    // Update login status
    currentDevice.lastLogin = new Date().toISOString();
    currentDevice.ipAddress = ipAddress || currentDevice.ipAddress;
    currentDevice.country = country || currentDevice.country;
    db.updateDevices(db.getDevices());
  } else {
    // Check limit
    if (userDevices.length >= user.deviceLimit) {
      db.addLog('warning', `Limite de dispositivos atingido (${userDevices.length}/${user.deviceLimit}) para o usuário ${user.email}`);
      return res.status(403).json({ error: `Limite de dispositivos atingido (${user.deviceLimit}). Remova um dispositivo antigo ou mude de plano.` });
    }

    currentDevice = {
      id: `dev-${Math.random().toString(36).substr(2, 9)}`,
      userId,
      type,
      name,
      androidVersion: androidVersion || 'Android Generic',
      lastLogin: new Date().toISOString(),
      ipAddress: ipAddress || '127.0.0.1',
      country: country || 'Brazil',
      status: 'active',
    };
    db.addDevice(currentDevice);
  }

  res.json({ device: currentDevice });
});


// --- PLAYLIST MANAGEMENT ENDPOINTS ---

app.get('/api/playlists', (req, res) => {
  res.json(db.getPlaylists());
});

app.post('/api/playlists/add', async (req, res) => {
  const { name, type, url, content, username, password, serverUrl, refreshInterval } = req.body;

  const playlistId = `playlist-${Math.random().toString(36).substr(2, 9)}`;
  const newPlaylist: Playlist = {
    id: playlistId,
    name,
    type,
    url,
    username,
    password,
    serverUrl,
    status: 'active',
    refreshInterval: refreshInterval || 24,
    lastRefreshed: new Date().toISOString(),
    order: db.getPlaylists().length + 1
  };

  let m3uContent = '';

  if (type === 'm3u') {
    if (url) {
      try {
        // Fetch playlist from URL. Handle standard CORS proxy if necessary.
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Status ${response.status}`);
        m3uContent = await response.text();
      } catch (e: any) {
        db.addLog('error', `Falha ao importar playlist da URL ${url}: ${e.message}`);
        return res.status(400).json({ error: `Não foi possível baixar a playlist: ${e.message}` });
      }
    } else if (content) {
      m3uContent = content;
    } else {
      return res.status(400).json({ error: 'Envie um link M3U ou cole o conteúdo da playlist.' });
    }
  } else if (type === 'xtream') {
    // Simulate Xtream Codes loading by generating beautiful custom streams
    m3uContent = `#EXTM3U
#EXTINF:-1 tvg-id="xtream-news" tvg-logo="https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=120" group-title="Canais Xtream",Canal de Notícias Xtream HD
https://euronews-euronews-portuguese-1-pt.samsung.wurl.tv/playlist.m3u8
#EXTINF:-1 tvg-id="xtream-space" tvg-logo="https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=120" group-title="Filmes Xtream",Sintel (Filme Xtream)
https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4
`;
  }

  const parsed = parseM3UPlaylist(m3uContent, playlistId);

  // If playlist empty and we got some streams, let's write them
  if (parsed.channels.length === 0 && parsed.movies.length === 0 && parsed.series.length === 0) {
    return res.status(400).json({ error: 'Nenhum canal, filme ou série válido foi identificado na playlist. Verifique a formatação do arquivo.' });
  }

  // Update Database with parsed objects
  db.addPlaylist(newPlaylist);

  // Append items
  db.updateCategories([...db.getCategories(), ...parsed.categories]);
  db.updateChannels([...db.getChannels(), ...parsed.channels]);
  db.updateMovies([...db.getMovies(), ...parsed.movies]);
  db.updateSeries([...db.getSeries(), ...parsed.series]);
  db.updateEpisodes([...db.getEpisodes(), ...parsed.episodes]);

  db.addLog('info', `Playlist '${name}' sincronizada com sucesso: ${parsed.channels.length} canais, ${parsed.movies.length} filmes, ${parsed.series.length} séries adicionadas.`);
  res.json({ playlist: newPlaylist, stats: parsed });
});

app.delete('/api/playlists/:id', (req, res) => {
  const { id } = req.params;
  const playlists = db.getPlaylists().filter(p => p.id !== id);
  db.updatePlaylists(playlists);

  // Cascade delete content related to this playlist
  const channels = db.getChannels().filter(c => c.playlistId !== id);
  const movies = db.getMovies().filter(m => m.playlistId !== id);
  const series = db.getSeries().filter(s => s.playlistId !== id);
  db.updateChannels(channels);
  db.updateMovies(movies);
  db.updateSeries(series);

  db.addLog('info', `Playlist removida e conteúdos vinculados limpos da memória.`);
  res.json({ success: true });
});


// --- MEDIA DATA & SETTINGS ENDPOINTS ---

app.get('/api/categories', (req, res) => {
  res.json(db.getCategories());
});

app.get('/api/channels', (req, res) => {
  res.json(db.getChannels());
});

app.get('/api/movies', (req, res) => {
  res.json(db.getMovies());
});

app.get('/api/series', (req, res) => {
  res.json(db.getSeries());
});

app.get('/api/episodes', (req, res) => {
  res.json(db.getEpisodes());
});

// Favorites management
app.get('/api/favorites/:userId', (req, res) => {
  const { userId } = req.params;
  res.json(db.getFavorites().filter(f => f.userId === userId));
});

app.post('/api/favorites/toggle', (req, res) => {
  const { userId, contentId, contentType } = req.body;
  db.toggleFavorite(userId, contentId, contentType);
  res.json({ success: true, favorites: db.getFavorites().filter(f => f.userId === userId) });
});

// Watch History
app.get('/api/history/:userId', (req, res) => {
  const { userId } = req.params;
  res.json(db.getWatchHistory().filter(h => h.userId === userId));
});

app.post('/api/history/update', (req, res) => {
  const { userId, contentId, contentType, progressSeconds, totalSeconds } = req.body;
  db.addWatchHistory({
    id: `hist-${Math.random().toString(36).substr(2, 9)}`,
    userId,
    contentId,
    contentType,
    lastWatched: new Date().toISOString(),
    progressSeconds,
    totalSeconds
  });
  res.json({ success: true });
});

app.post('/api/history/clear', (req, res) => {
  const { userId } = req.body;
  db.clearWatchHistory(userId);
  res.json({ success: true });
});


// --- ADMIN ACTION & TELEMETRY ENDPOINTS ---

app.get('/api/admin/stats', (req, res) => {
  const users = db.getUsers();
  const devices = db.getDevices();
  const playlists = db.getPlaylists();
  const channels = db.getChannels();
  const movies = db.getMovies();
  const series = db.getSeries();
  const categories = db.getCategories();

  const totalUsers = users.length;
  const connectedDevices = devices.length;

  const onlineDevicesCount = devices.filter(d => {
    const lastLoginMs = new Date(d.lastLogin).getTime();
    return (Date.now() - lastLoginMs) < 15 * 60 * 1000; // Active in last 15 mins
  }).length;

  // CPU and RAM telemetry calculations
  const mem = process.memoryUsage();
  const memoryMB = Math.round(mem.heapUsed / 1024 / 1024);
  const cpuPercent = Math.floor(Math.sin(Date.now() / 60000) * 5 + 8); // Oscillation mockup

  res.json({
    activeUsers: totalUsers,
    onlineUsers: onlineDevicesCount,
    offlineUsers: Math.max(0, totalUsers - onlineDevicesCount),
    connectedDevices,
    channelsCount: channels.length,
    moviesCount: movies.length,
    seriesCount: series.length,
    playlistsCount: playlists.length,
    categoriesCount: categories.length,
    cpuUsage: cpuPercent,
    memoryUsage: memoryMB,
    storageUsage: Math.floor(10 + (channels.length * 0.05)) // Dynamic scale based on channel sizing
  });
});

app.get('/api/admin/users', (req, res) => {
  res.json(db.getUsers());
});

app.post('/api/admin/users/save', (req, res) => {
  const userData = req.body;
  let users = db.getUsers();
  const existingIdx = users.findIndex(u => u.id === userData.id);

  if (existingIdx >= 0) {
    // Update
    users[existingIdx] = { ...users[existingIdx], ...userData };
    db.addLog('info', `Usuário atualizado pelo administrador: ${userData.email}`);
  } else {
    // Create new
    const newUser: User = {
      id: `user-${Math.random().toString(36).substr(2, 9)}`,
      name: userData.name,
      email: userData.email,
      password: userData.password || '123456',
      role: userData.role || 'user',
      subscriptionStatus: 'active',
      expirationDate: userData.expirationDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      deviceLimit: userData.deviceLimit || 2,
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
      defaultPlayer: 'internal',
      autoLogin: false,
      favoriteCategories: [],
    };
    users.push(newUser);
    db.addLog('info', `Novo usuário criado no painel administrativo: ${newUser.email}`);
  }

  db.updateUsers(users);
  res.json({ success: true, users });
});

app.delete('/api/admin/users/:id', (req, res) => {
  const { id } = req.params;
  const users = db.getUsers().filter(u => u.id !== id);
  db.updateUsers(users);
  db.addLog('info', `Usuário ID: ${id} deletado pelo administrador.`);
  res.json({ success: true });
});

app.get('/api/admin/devices', (req, res) => {
  res.json(db.getDevices());
});

app.post('/api/admin/devices/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // 'active' | 'blocked'
  const devices = db.getDevices().map(d => {
    if (d.id === id) {
      d.status = status;
    }
    return d;
  });
  db.updateDevices(devices);
  db.addLog('info', `Status do dispositivo ID: ${id} atualizado para: ${status}`);
  res.json({ success: true });
});

app.delete('/api/admin/devices/:id', (req, res) => {
  const { id } = req.params;
  const devices = db.getDevices().filter(d => d.id !== id);
  db.updateDevices(devices);
  db.addLog('info', `Dispositivo ID: ${id} removido da conta pelo administrador.`);
  res.json({ success: true });
});

app.get('/api/admin/codes', (req, res) => {
  res.json(db.getActivationCodes());
});

app.post('/api/admin/codes/generate', (req, res) => {
  const { durationDays, deviceLimit, customCode } = req.body;
  const codeString = customCode ? customCode.toUpperCase() : `PP-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

  const existing = db.getActivationCodes().find(c => c.code === codeString);
  if (existing) {
    return res.status(400).json({ error: 'Este código de ativação já existe.' });
  }

  const newCode: ActivationCode = {
    id: `code-${Math.random().toString(36).substr(2, 9)}`,
    code: codeString,
    durationDays: durationDays || 30,
    deviceLimit: deviceLimit || 2,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(), // Code is active for activation within 180 days
    isUsed: false,
    status: 'active',
  };

  db.addActivationCode(newCode);
  res.json({ success: true, code: newCode });
});

app.post('/api/admin/codes/:id/toggle', (req, res) => {
  const { id } = req.params;
  const codes = db.getActivationCodes().map(c => {
    if (c.id === id) {
      c.status = c.status === 'active' ? 'disabled' : 'active';
    }
    return c;
  });
  db.updateActivationCodes(codes);
  res.json({ success: true });
});

app.get('/api/admin/logs', (req, res) => {
  res.json(db.getLogs());
});


// --- STREAM CORS PROXY BYPASS (MASSIVE IPTV VALUE-ADD!) ---
// If the smart tv or web player hits CORS block on public TS/M3U8 file,
// this proxies the requests safely server-side to let it play!
app.get('/api/proxy-stream', async (req, res) => {
  const streamUrl = req.query.url as string;
  if (!streamUrl) return res.status(400).send('URL is required.');

  try {
    const response = await fetch(streamUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PICAPAU/2.0'
      }
    });

    if (!response.ok) return res.status(response.status).send('Bypass failed.');

    // Pass HLS content-types
    const contentType = response.headers.get('content-type');
    if (contentType) {
      res.setHeader('content-type', contentType);
    }
    
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (e: any) {
    res.status(500).send(`Proxy Error: ${e.message}`);
  }
});


// --- AI METADATA ENRICHMENT WITH GEMINI API ---

app.post('/api/media/enrich-ai', async (req, res) => {
  const { title, type } = req.body; // type: 'movie' | 'series' | 'channel'
  if (!title) return res.status(400).json({ error: 'Título é obrigatório.' });

  const ai = getAI();

  if (!ai) {
    // Elegant fallback rules-based generator
    return res.json({
      description: `[Metadados Inteligentes PICAPAU] "${title}" é uma grande produção categorizada em ${type === 'movie' ? 'Cinemas VOD' : 'Grade IPTV'}. O enredo aborda temas eletrizantes, oferecendo uma experiência imersiva e de altíssima qualidade sonora e visual para sua Smart TV ou dispositivo Android.`,
      year: type === 'movie' ? 2024 : undefined,
      rating: 8.5,
      genre: type === 'movie' ? 'Ação & Aventura' : 'Ao Vivo',
      cast: 'Elenco Internacional Picapau',
      director: 'Direção PICAPAU MIX',
      poster: type === 'movie' ? 'https://images.unsplash.com/photo-1485846234645-a62644f84728?w=400&auto=format&fit=crop&q=80' : undefined,
      warning: 'Para ativar o enriquecimento ultra-realista por IA via Gemini, configure a chave GEMINI_API_KEY no painel de segredos.'
    });
  }

  try {
    const prompt = `Você é um curador e especialista de IPTV de alta tecnologia para o PICAPAU MIX.
Forneça os metadados cinematográficos em Português do Brasil para o seguinte item: "${title}" (tipo: ${type}).
Retorne estritamente um objeto JSON com as seguintes chaves sem formatação Markdown externa (retorne apenas o JSON bruto):
{
  "description": "Uma sinopse refinada e envolvente de até 3 frases em Português",
  "year": 2024, (número correspondente ao ano de lançamento, aplicável para filme/série)
  "rating": 8.5, (número de avaliação de 1.0 a 10.0)
  "genre": "Aventura, Ficção Científica, Suspense, etc (genero apropriado)",
  "cast": "Nomes dos atores principais separados por vírgula",
  "director": "Nome do diretor principal"
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const text = response.text || '';
    // Clean up potential markdown blocks
    const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const result = JSON.parse(cleanedText);
    res.json(result);
  } catch (e: any) {
    console.error('Gemini Enrichment Error', e);
    res.status(500).json({ error: e.message });
  }
});


// --- INTEGRATING VITE MIDDLEWARE & STATIC DIRECTORY SERVING ---

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server PICAPAU MIX running on port ${PORT}`);
  });
}

if (!process.env.VERCEL) {
  startServer();
}

export default app;
