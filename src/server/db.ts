/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import { 
  User, Device, ActivationCode, Playlist, Category, Channel, 
  Movie, Series, Episode, WatchHistory, Favorite, SystemLog 
} from '../types.js';

const DB_PATH = process.env.VERCEL 
  ? path.join('/tmp', 'db_store.json')
  : path.join(process.cwd(), 'db_store.json');

interface DatabaseSchema {
  users: User[];
  devices: Device[];
  activationCodes: ActivationCode[];
  playlists: Playlist[];
  categories: Category[];
  channels: Channel[];
  movies: Movie[];
  series: Series[];
  episodes: Episode[];
  watchHistory: WatchHistory[];
  favorites: Favorite[];
  logs: SystemLog[];
}

// Preloaded Premium Legal Streams & Content
const INITIAL_CATEGORIES: Category[] = [
  { id: 'cat-live-news', name: 'Notícias Ao Vivo', type: 'channel' },
  { id: 'cat-live-space', name: 'Ciência & Espaço', type: 'channel' },
  { id: 'cat-live-ent', name: 'Entretenimento', type: 'channel' },
  { id: 'cat-mov-scifi', name: 'Ficção Científica', type: 'movie' },
  { id: 'cat-mov-anim', name: 'Animação', type: 'movie' },
  { id: 'cat-ser-nat', name: 'Documentários', type: 'series' },
];

const INITIAL_CHANNELS: Channel[] = [
  {
    id: 'ch-euronews',
    playlistId: 'playlist-default',
    name: 'Euronews Português',
    logo: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=120&auto=format&fit=crop&q=80',
    categoryId: 'cat-live-news',
    categoryName: 'Notícias Ao Vivo',
    url: 'https://euronews-euronews-portuguese-1-pt.samsung.wurl.tv/playlist.m3u8',
  },
  {
    id: 'ch-nasa',
    playlistId: 'playlist-default',
    name: 'NASA TV Live',
    logo: 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=120&auto=format&fit=crop&q=80',
    categoryId: 'cat-live-space',
    categoryName: 'Ciência & Espaço',
    url: 'https://ntvlive.nasa.gov/hls/live.m3u8',
  },
  {
    id: 'ch-aljazeera',
    playlistId: 'playlist-default',
    name: 'Al Jazeera News',
    logo: 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=120&auto=format&fit=crop&q=80',
    categoryId: 'cat-live-news',
    categoryName: 'Notícias Ao Vivo',
    url: 'https://live-amg-ch01.media.aljazeera.com/v1/master/9d01246d601d848ee124c6ef46ec39d568c07e0b/Channel-1/master.m3u8',
  },
  {
    id: 'ch-redbull',
    playlistId: 'playlist-default',
    name: 'Red Bull TV',
    logo: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=120&auto=format&fit=crop&q=80',
    categoryId: 'cat-live-ent',
    categoryName: 'Entretenimento',
    url: 'https://rbmn-live.akamaized.net/hls/live/590964/global/master.m3u8',
  },
];

const INITIAL_MOVIES: Movie[] = [
  {
    id: 'mov-sintel',
    playlistId: 'playlist-default',
    name: 'Sintel (Filme Aberto)',
    categoryId: 'cat-mov-anim',
    categoryName: 'Animação',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
    poster: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=400&auto=format&fit=crop&q=80',
    background: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=1200&auto=format&fit=crop&q=80',
    description: 'Sintel é um filme de animação aberto da Blender Foundation. Conta a tocante jornada de uma guerreira solitária que resgata e cria um filhote de dragão, apenas para ter seu amigo roubado por uma fera gigante, iniciando uma busca incessante repleta de perigos e revelações.',
    duration: '14 min',
    year: 2010,
    rating: 8.4,
    genre: 'Fantasia, Aventura, Animação',
    cast: 'Halina Reijn, Albert de Bruijn',
    director: 'Colin Levy',
  },
  {
    id: 'mov-bbb',
    playlistId: 'playlist-default',
    name: 'Big Buck Bunny',
    categoryId: 'cat-mov-anim',
    categoryName: 'Animação',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    poster: 'https://images.unsplash.com/photo-1484704849700-f032a568e944?w=400&auto=format&fit=crop&q=80',
    background: 'https://images.unsplash.com/photo-1484704849700-f032a568e944?w=1200&auto=format&fit=crop&q=80',
    description: 'A história de um coelho gigante e adorável, cujos hábitos diários são bruscamente interrompidos por três roedores travessos da floresta. Cansado das provocações, ele decide criar uma série de armadilhas divertidas e hilárias para dar uma lição aos arruaceiros.',
    duration: '10 min',
    year: 2008,
    rating: 7.9,
    genre: 'Comédia, Infantil, Animação',
    cast: 'Animação Computadorizada',
    director: 'Sacha Goedegebure',
  },
  {
    id: 'mov-tos',
    playlistId: 'playlist-default',
    name: 'Tears of Steel (Sci-Fi)',
    categoryId: 'cat-mov-scifi',
    categoryName: 'Ficção Científica',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
    poster: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400&auto=format&fit=crop&q=80',
    background: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1200&auto=format&fit=crop&q=80',
    description: 'Em um futuro distópico, uma equipe de cientistas e combatentes militares se reúne na histórica praça da igreja de Oude Kerk, em Amsterdã, para realizar um experimento de viagem no tempo e salvar o mundo da destruição iminente causada por robôs gigantes gigantescos liderados por uma inteligência cibernética quebrada.',
    duration: '12 min',
    year: 2012,
    rating: 8.1,
    genre: 'Ficção Científica, Ação',
    cast: 'Derek de Lint, Rogier Schippers',
    director: 'Ian Hubert',
  },
];

const INITIAL_SERIES: Series[] = [
  {
    id: 'ser-wildlife',
    playlistId: 'playlist-default',
    name: 'Vida Selvagem Extrema',
    categoryId: 'cat-ser-nat',
    categoryName: 'Documentários',
    poster: 'https://images.unsplash.com/photo-1546182990-dffeafbe841d?w=400&auto=format&fit=crop&q=80',
    background: 'https://images.unsplash.com/photo-1546182990-dffeafbe841d?w=1200&auto=format&fit=crop&q=80',
    description: 'Uma série documental de tirar o fôlego que explora os habitats mais perigosos e belos da Terra, acompanhando de perto o comportamento de predadores e presas em sua luta diária pela sobrevivência e evolução.',
    rating: 9.1,
    genre: 'Documentário, Natureza',
  },
];

const INITIAL_EPISODES: Episode[] = [
  {
    id: 'ep-wild-1',
    seriesId: 'ser-wildlife',
    name: 'O Reino das Savanas',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    season: 1,
    episodeNumber: 1,
    description: 'Acompanhe as alcateias de leões no Serengeti durante o início da grande migração e descubra as táticas de caça que garantem o sustento de seus filhotes.',
    duration: '15 min',
    thumbnail: 'https://images.unsplash.com/photo-1546182990-dffeafbe841d?w=300&auto=format&fit=crop&q=80',
  },
  {
    id: 'ep-wild-2',
    seriesId: 'ser-wildlife',
    name: 'Nas Profundezas do Oceano',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    season: 1,
    episodeNumber: 2,
    description: 'Uma expedição submarina às fossas abissais, revelando criaturas bioluminescentes fascinantes que prosperam no breu absoluto sob pressões extremas.',
    duration: '14 min',
    thumbnail: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=300&auto=format&fit=crop&q=80',
  },
];

const INITIAL_PLAYLISTS: Playlist[] = [
  {
    id: 'playlist-default',
    name: 'PICAPAU Premium Oficial (Legal)',
    type: 'm3u',
    url: 'https://raw.githubusercontent.com/picapau/iptv/main/legal_sample.m3u',
    status: 'active',
    refreshInterval: 24,
    lastRefreshed: new Date().toISOString(),
    order: 1,
  },
];

const INITIAL_ACTIVATION_CODES: ActivationCode[] = [
  {
    id: 'code-1',
    code: 'PICAPAU50',
    durationDays: 30,
    deviceLimit: 3,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    isUsed: false,
    status: 'active',
  },
  {
    id: 'code-2',
    code: 'PREMIUM99',
    durationDays: 365,
    deviceLimit: 5,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    isUsed: false,
    status: 'active',
  },
  {
    id: 'code-expired',
    code: 'EXPIRED12',
    durationDays: 30,
    deviceLimit: 2,
    createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(),
    expiresAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    isUsed: false,
    status: 'expired',
  },
];

const INITIAL_USERS: User[] = [
  {
    id: 'user-admin',
    name: 'PicaPau Admin',
    email: 'admin@picapau.com',
    password: 'admin123', // Encrypted ideally, but readable for mock panel test
    role: 'admin',
    subscriptionStatus: 'active',
    expirationDate: '2029-12-31T23:59:59.000Z',
    deviceLimit: 999,
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
    defaultPlayer: 'internal',
    autoLogin: true,
    favoriteCategories: [],
  },
  {
    id: 'user-client',
    name: 'Amigo IPTV',
    email: 'cliente@picapau.com',
    password: 'cliente123',
    role: 'user',
    subscriptionStatus: 'active',
    expirationDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    deviceLimit: 3,
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
    defaultPlayer: 'internal',
    autoLogin: false,
    favoriteCategories: ['cat-live-news', 'cat-mov-anim'],
  },
];

const INITIAL_DEVICES: Device[] = [
  {
    id: 'dev-tvbox',
    userId: 'user-client',
    type: 'tvbox',
    name: 'Xiaomi Mi Box S',
    androidVersion: 'Android 9.0',
    lastLogin: new Date().toISOString(),
    ipAddress: '192.168.1.102',
    country: 'Brazil',
    status: 'active',
  },
  {
    id: 'dev-phone',
    userId: 'user-client',
    type: 'android',
    name: 'Samsung Galaxy S22 Ultra',
    androidVersion: 'Android 13',
    lastLogin: new Date(Date.now() - 120000).toISOString(),
    ipAddress: '189.120.45.10',
    country: 'Brazil',
    status: 'active',
  },
];

const INITIAL_LOGS: SystemLog[] = [
  {
    id: 'log-1',
    timestamp: new Date(Date.now() - 3600000 * 3).toISOString(),
    type: 'info',
    message: 'Servidor PICAPAU MIX iniciado com sucesso.',
  },
  {
    id: 'log-2',
    timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
    type: 'info',
    message: 'Playlist PICAPAU Premium carregada e processada automaticamente. 4 canais, 3 filmes, 1 série identificados.',
  },
  {
    id: 'log-3',
    timestamp: new Date(Date.now() - 1800000).toISOString(),
    type: 'info',
    message: 'Sincronização de metadados realizada: 8 registros atualizados.',
  },
];

const DEFAULT_DATABASE: DatabaseSchema = {
  users: INITIAL_USERS,
  devices: INITIAL_DEVICES,
  activationCodes: INITIAL_ACTIVATION_CODES,
  playlists: INITIAL_PLAYLISTS,
  categories: INITIAL_CATEGORIES,
  channels: INITIAL_CHANNELS,
  movies: INITIAL_MOVIES,
  series: INITIAL_SERIES,
  episodes: INITIAL_EPISODES,
  watchHistory: [],
  favorites: [],
  logs: INITIAL_LOGS,
};

export class Database {
  private data: DatabaseSchema;

  constructor() {
    this.data = { ...DEFAULT_DATABASE };
    this.load();
  }

  private load() {
    try {
      if (process.env.VERCEL) {
        const bundledPath = path.join(process.cwd(), 'db_store.json');
        if (!fs.existsSync(DB_PATH)) {
          if (fs.existsSync(bundledPath)) {
            try {
              fs.copyFileSync(bundledPath, DB_PATH);
            } catch (copyErr) {
              console.error('Failed to copy bundled database to /tmp', copyErr);
            }
          }
        }
      }

      if (fs.existsSync(DB_PATH)) {
        const fileContent = fs.readFileSync(DB_PATH, 'utf-8');
        this.data = JSON.parse(fileContent);
      } else {
        this.save();
      }
    } catch (e) {
      console.error('Error loading database, resetting to default', e);
      this.data = { ...DEFAULT_DATABASE };
      this.save();
    }
  }

  public save() {
    try {
      fs.writeFileSync(DB_PATH, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (e) {
      console.error('Error saving database', e);
    }
  }

  // Getters
  public getUsers(): User[] { return this.data.users; }
  public getDevices(): Device[] { return this.data.devices; }
  public getActivationCodes(): ActivationCode[] { return this.data.activationCodes; }
  public getPlaylists(): Playlist[] { return this.data.playlists; }
  public getCategories(): Category[] { return this.data.categories; }
  public getChannels(): Channel[] { return this.data.channels; }
  public getMovies(): Movie[] { return this.data.movies; }
  public getSeries(): Series[] { return this.data.series; }
  public getEpisodes(): Episode[] { return this.data.episodes; }
  public getWatchHistory(): WatchHistory[] { return this.data.watchHistory; }
  public getFavorites(): Favorite[] { return this.data.favorites; }
  public getLogs(): SystemLog[] { return this.data.logs; }

  // Setters / Push helpers
  public addUser(user: User) {
    this.data.users.push(user);
    this.addLog('info', `Novo usuário registrado: ${user.email}`, user.email);
    this.save();
  }

  public updateUsers(users: User[]) {
    this.data.users = users;
    this.save();
  }

  public addDevice(device: Device) {
    this.data.devices.push(device);
    this.addLog('info', `Novo dispositivo registrado: ${device.name} (${device.type})`);
    this.save();
  }

  public updateDevices(devices: Device[]) {
    this.data.devices = devices;
    this.save();
  }

  public addActivationCode(code: ActivationCode) {
    this.data.activationCodes.push(code);
    this.addLog('info', `Novo código de ativação gerado: ${code.code}`);
    this.save();
  }

  public updateActivationCodes(codes: ActivationCode[]) {
    this.data.activationCodes = codes;
    this.save();
  }

  public addPlaylist(playlist: Playlist) {
    this.data.playlists.push(playlist);
    this.addLog('info', `Nova playlist adicionada: ${playlist.name}`);
    this.save();
  }

  public updatePlaylists(playlists: Playlist[]) {
    this.data.playlists = playlists;
    this.save();
  }

  public updateCategories(categories: Category[]) {
    this.data.categories = categories;
    this.save();
  }

  public updateChannels(channels: Channel[]) {
    this.data.channels = channels;
    this.save();
  }

  public updateMovies(movies: Movie[]) {
    this.data.movies = movies;
    this.save();
  }

  public updateSeries(series: Series[]) {
    this.data.series = series;
    this.save();
  }

  public updateEpisodes(episodes: Episode[]) {
    this.data.episodes = episodes;
    this.save();
  }

  public addWatchHistory(history: WatchHistory) {
    // Check if entry already exists for user and content, if so update progress
    const idx = this.data.watchHistory.findIndex(h => h.userId === history.userId && h.contentId === history.contentId);
    if (idx >= 0) {
      this.data.watchHistory[idx] = history;
    } else {
      this.data.watchHistory.push(history);
    }
    this.save();
  }

  public clearWatchHistory(userId: string) {
    this.data.watchHistory = this.data.watchHistory.filter(h => h.userId !== userId);
    this.save();
  }

  public toggleFavorite(userId: string, contentId: string, contentType: 'movie' | 'series' | 'channel') {
    const idx = this.data.favorites.findIndex(f => f.userId === userId && f.contentId === contentId);
    if (idx >= 0) {
      this.data.favorites.splice(idx, 1);
    } else {
      this.data.favorites.push({
        id: `fav-${Math.random().toString(36).substr(2, 9)}`,
        userId,
        contentId,
        contentType
      });
    }
    this.save();
  }

  public addLog(type: 'info' | 'warning' | 'error', message: string, userEmail?: string) {
    this.data.logs.unshift({
      id: `log-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      type,
      message,
      userEmail
    });
    // Cap at 200 logs
    if (this.data.logs.length > 200) {
      this.data.logs.pop();
    }
    this.save();
  }
}

export const db = new Database();
