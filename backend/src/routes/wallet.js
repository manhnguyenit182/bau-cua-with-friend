import express from 'express';
import prisma from '../config/prisma.js';
import authenticate from '../middleware/authenticate.js';

const router = express.Router();

const CHECKIN_REWARD = 1000;

// GET /api/wallet/me — Xem số dư ví + lịch sử giao dịch
router.get('/me', authenticate, async (req, res) => {
  try {
    const wallet = await prisma.wallet.findUnique({
      where: { userId: req.user.id },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 20, // Lấy 20 giao dịch gần nhất
        },
      },
    });

    if (!wallet) {
      return res.status(404).json({ message: 'Không tìm thấy ví của bạn.' });
    }

    return res.json({ balance: wallet.balance, transactions: wallet.transactions });
  } catch (err) {
    console.error('[WALLET ME ERROR]', err);
    return res.status(500).json({ message: 'Lỗi máy chủ.' });
  }
});

// POST /api/wallet/checkin — Điểm danh nhận 1.000 điểm mỗi ngày
router.post('/checkin', authenticate, async (req, res) => {
  try {
    const wallet = await prisma.wallet.findUnique({
      where: { userId: req.user.id },
    });

    if (!wallet) {
      return res.status(404).json({ message: 'Không tìm thấy ví của bạn.' });
    }

    // Kiểm tra xem hôm nay đã điểm danh chưa
    const now = new Date();
    if (wallet.lastCheckIn) {
      const lastCI = new Date(wallet.lastCheckIn);
      const isSameDay =
        lastCI.getFullYear() === now.getFullYear() &&
        lastCI.getMonth() === now.getMonth() &&
        lastCI.getDate() === now.getDate();

      if (isSameDay) {
        // Tính thời gian còn lại đến nửa đêm
        const midnight = new Date(now);
        midnight.setHours(24, 0, 0, 0);
        const minutesLeft = Math.ceil((midnight - now) / 60000);
        const hoursLeft = Math.floor(minutesLeft / 60);
        const minsLeft = minutesLeft % 60;

        return res.status(429).json({
          message: `Bạn đã điểm danh hôm nay rồi! Quay lại sau ${hoursLeft} giờ ${minsLeft} phút nữa nhé.`,
          nextCheckIn: midnight.toISOString(),
        });
      }
    }

    // Cộng tiền và cập nhật thời gian điểm danh trong 1 transaction DB
    const [updatedWallet] = await prisma.$transaction([
      prisma.wallet.update({
        where: { userId: req.user.id },
        data: {
          balance: { increment: CHECKIN_REWARD },
          lastCheckIn: now,
          transactions: {
            create: {
              amount: CHECKIN_REWARD,
              type: 'CHECKIN',
              description: '📅 Thưởng điểm danh hàng ngày',
            },
          },
        },
      }),
    ]);

    return res.json({
      message: `🎁 Điểm danh thành công! +${CHECKIN_REWARD} điểm`,
      newBalance: updatedWallet.balance,
    });
  } catch (err) {
    console.error('[CHECKIN ERROR]', err);
    return res.status(500).json({ message: 'Lỗi máy chủ.' });
  }
});

export default router;
