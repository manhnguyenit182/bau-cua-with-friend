import 'dotenv/config';
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

// Health check
app.get('/', (req, res) => {
  res.json({ message: '🎲 Bầu Cua API is running!' });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/wallet', walletRoutes);

// Connect MongoDB và khởi động server
const PORT = process.env.PORT || 5000;

connectMongo().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
  });
});
