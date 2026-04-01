import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../config/prisma.js';

const router = express.Router();

const INITIAL_BALANCE = 3000;

// POST /api/auth/register — Tạo tài khoản mới
router.post('/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Vui lòng nhập đủ tên người dùng và mật khẩu.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: 'Mật khẩu phải có ít nhất 6 ký tự.' });
  }

  try {
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return res.status(409).json({ message: 'Tên người dùng này đã tồn tại. Vui lòng chọn tên khác.' });
    }

    const hashed = await bcrypt.hash(password, 10);

    // Tạo User kèm Wallet (3.000 điểm vốn khởi điểm)
    const user = await prisma.user.create({
      data: {
        username,
        password: hashed,
        wallet: {
          create: {
            balance: INITIAL_BALANCE,
            transactions: {
              create: {
                amount: INITIAL_BALANCE,
                type: 'BONUS',
                description: '🎉 Vốn khởi điểm khi tạo tài khoản',
              },
            },
          },
        },
      },
    });

    const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, {
      expiresIn: '7d',
    });

    return res.status(201).json({
      message: `Chào mừng ${user.username}! Bạn đã nhận được ${INITIAL_BALANCE} điểm khởi điểm.`,
      token,
      user: { id: user.id, username: user.username, balance: INITIAL_BALANCE },
    });
  } catch (err) {
    console.error('[REGISTER ERROR]', err);
    return res.status(500).json({ message: 'Lỗi máy chủ. Vui lòng thử lại.' });
  }
});

// POST /api/auth/login — Đăng nhập
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Vui lòng nhập đủ tên người dùng và mật khẩu.' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { username },
      include: { wallet: true },
    });

    if (!user) {
      return res.status(401).json({ message: 'Tên đăng nhập hoặc mật khẩu không đúng.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Tên đăng nhập hoặc mật khẩu không đúng.' });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, {
      expiresIn: '7d',
    });

    return res.json({
      message: `Chào mừng trở lại, ${user.username}!`,
      token,
      user: {
        id: user.id,
        username: user.username,
        balance: user.wallet?.balance ?? 0,
      },
    });
  } catch (err) {
    console.error('[LOGIN ERROR]', err);
    return res.status(500).json({ message: 'Lỗi máy chủ. Vui lòng thử lại.' });
  }
});

export default router;
