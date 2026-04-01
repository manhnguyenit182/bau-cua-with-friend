import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import authRoutes from './routes/auth.js';
import walletRoutes from './routes/wallet.js';
import connectMongo from './config/mongo.js';
import setupSocket from './socket/gameSocket.js';

const app = express();
const httpServer = http.createServer(app);

// Socket.io setup
export const io = new Server(httpServer, {
  cors: { origin: '*' },
});

// Gắn game engine vào Socket
setupSocket(io);

// Middleware
app.use(cors());
app.use(express.json());

// Health check API
app.get('/api/health', (req, res) => {
  res.json({ message: '🎲 Bầu Cua API is running!' });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/wallet', walletRoutes);

// Phục vụ giao diện Frontend (Hữu ích khi dùng Ngrok hoặc Deploy)
app.use(express.static(path.join(__dirname, '../../frontend/dist')));
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
});

// Connect MongoDB và khởi động server
const PORT = process.env.PORT || 5000;

connectMongo().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
  });
});
