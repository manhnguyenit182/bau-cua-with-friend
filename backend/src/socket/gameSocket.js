import jwt from 'jsonwebtoken';
import Room from '../models/Room.js';
import ChatMessage from '../models/ChatMessage.js';
import prisma from '../config/prisma.js';

const SYMBOLS = ['nai', 'bau', 'ga', 'ca', 'cua', 'tom'];

/**
 * Xác thực Socket bằng JWT token
 */
const authenticateSocket = (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Vui lòng đăng nhập.'));

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = decoded; // { id, username }
    next();
  } catch (err) {
    next(new Error('Token hết hạn.'));
  }
};

/**
 * Lấy danh sách phòng Public đang mở
 */
const getPublicRooms = async () => {
  const rooms = await Room.find({ isPublic: true }).sort({ createdAt: -1 }).limit(20).lean();
  return rooms.map((r) => ({
    code: r.code,
    hostName: r.hostName,
    playerCount: r.players.length,
    maxPlayers: r.maxPlayers,
    status: r.status,
    minBet: r.minBet,
  }));
};

/**
 * Tung 3 xúc xắc ngẫu nhiên
 */
const rollDice = () => {
  return [
    SYMBOLS[Math.floor(Math.random() * 6)],
    SYMBOLS[Math.floor(Math.random() * 6)],
    SYMBOLS[Math.floor(Math.random() * 6)],
  ];
};

/**
 * Xử lý thanh toán ván cược
 * Luật truyền thống: Nếu ra 1 con trùng -> 1x1, 2 con trùng -> 1x2, 3 con trùng -> 1x3
 * Ví dụ: Đặt 100 vào "Bầu", ra 2 con Bầu -> Thắng 200 (100 x 2)
 * Nếu trượt -> Mất tiền cược
 */
const resolveRound = async (room, io) => {
  const diceResults = rollDice();
  room.currentRound.diceResults = diceResults;
  room.status = 'result';

  const settlements = []; // Kết quả thanh toán cho từng người
  let hostNetChange = 0;  // Số tiền Nhà Cái thay đổi (+ hoặc -)

  // Đếm số lần mỗi biểu tượng xuất hiện trên xúc xắc
  const symbolCount = {};
  for (const s of diceResults) {
    symbolCount[s] = (symbolCount[s] || 0) + 1;
  }

  // Xử lý từng lệnh cược
  for (const bet of room.currentRound.bets) {
    const matches = symbolCount[bet.symbol] || 0;

    if (matches > 0) {
      // THẮNG: Tiền thắng = Tiền cược x Số lần xuất hiện
      const winAmount = bet.amount * matches;
      settlements.push({
        userId: bet.userId,
        username: bet.username,
        symbol: bet.symbol,
        betAmount: bet.amount,
        result: 'win',
        change: +winAmount,
      });
      hostNetChange -= winAmount; // Nhà cái trả tiền
    } else {
      // THUA: Mất tiền cược
      settlements.push({
        userId: bet.userId,
        username: bet.username,
        symbol: bet.symbol,
        betAmount: bet.amount,
        result: 'lose',
        change: -bet.amount,
      });
      hostNetChange += bet.amount; // Nhà cái thu tiền
    }
  }

  // CẬP NHẬT VÍ TIỀN TRONG POSTGRESQL (Transaction an toàn)
  try {
    const dbOps = [];

    // Gộp tiền theo userId (1 người có thể đặt nhiều ô)
    const playerChanges = {};
    for (const s of settlements) {
      if (!playerChanges[s.userId]) playerChanges[s.userId] = 0;
      playerChanges[s.userId] += s.change;
    }

    // Cập nhật ví từng tay con
    for (const [userId, change] of Object.entries(playerChanges)) {
      if (change !== 0) {
        dbOps.push(
          prisma.wallet.update({
            where: { userId },
            data: {
              balance: { increment: change },
              transactions: {
                create: {
                  amount: Math.abs(change),
                  type: change > 0 ? 'WIN' : 'BET',
                  description: change > 0
                    ? `🎉 Thắng ván #${room.roundNumber}`
                    : `💸 Thua ván #${room.roundNumber}`,
                },
              },
            },
          })
        );
      }
    }

    // Cập nhật ví Nhà Cái
    if (hostNetChange !== 0) {
      dbOps.push(
        prisma.wallet.update({
          where: { userId: room.hostId },
          data: {
            balance: { increment: hostNetChange },
            transactions: {
              create: {
                amount: Math.abs(hostNetChange),
                type: hostNetChange > 0 ? 'WIN' : 'BET',
                description: hostNetChange > 0
                  ? `🏦 Nhà cái thu lợi ván #${room.roundNumber}`
                  : `🏦 Nhà cái trả thưởng ván #${room.roundNumber}`,
              },
            },
          },
        })
      );
    }

    await prisma.$transaction(dbOps);
  } catch (err) {
    console.error('[RESOLVE ERROR]', err);
  }

  await room.save();

  // Lấy số dư mới nhất cho tất cả
  const allPlayerIds = room.players.map((p) => p.userId);
  const wallets = await prisma.wallet.findMany({
    where: { userId: { in: allPlayerIds } },
    select: { userId: true, balance: true },
  });
  const balanceMap = {};
  for (const w of wallets) balanceMap[w.userId] = w.balance;

  return { diceResults, settlements, hostNetChange, balanceMap };
};

/**
 * SOCKET EVENT HANDLER CHÍNH
 */
export default function setupSocket(io) {
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    console.log(`🔌 ${socket.user.username} kết nối socket`);

    // =============================================
    // LOBBY: LẤY DANH SÁCH PHÒNG
    // =============================================
    socket.on('lobby:getRooms', async (callback) => {
      const rooms = await getPublicRooms();
      callback({ rooms });
    });

    // =============================================
    // TẠO PHÒNG MỚI
    // =============================================
    socket.on('room:create', async ({ isPublic, minBet }, callback) => {
      try {
        // Kiểm tra người chơi có đủ tiền làm cái không
        const wallet = await prisma.wallet.findUnique({ where: { userId: socket.user.id } });
        if (!wallet || wallet.balance < (minBet || 100)) {
          return callback({ error: 'Số dư không đủ để mở bàn.' });
        }

        let code;
        let exists = true;
        while (exists) {
          code = Room.generateCode();
          exists = await Room.findOne({ code });
        }

        const room = await Room.create({
          code,
          hostId: socket.user.id,
          hostName: socket.user.username,
          isPublic: isPublic !== false,
          minBet: minBet || 100,
          players: [{
            userId: socket.user.id,
            username: socket.user.username,
            joinOrder: 1,
          }],
          currentRound: { bets: [], diceResults: [], totalBetAmount: 0, readyPlayers: [] },
        });

        socket.join(code);
        socket.currentRoom = code;

        // Thông báo lobby phòng mới xuất hiện
        io.emit('lobby:roomUpdate', await getPublicRooms());

        callback({ room: { code: room.code, hostId: room.hostId, hostName: room.hostName, players: room.players, status: room.status, minBet: room.minBet, isPublic: room.isPublic, roundNumber: room.roundNumber } });
      } catch (err) {
        console.error('[CREATE ROOM ERROR]', err);
        callback({ error: 'Không thể tạo phòng.' });
      }
    });

    // =============================================
    // THAM GIA PHÒNG
    // =============================================
    socket.on('room:join', async ({ code }, callback) => {
      try {
        const room = await Room.findOne({ code });
        if (!room) return callback({ error: 'Phòng không tồn tại.' });
        if (room.players.length >= room.maxPlayers) return callback({ error: 'Phòng đã đầy.' });
        if (room.players.some((p) => p.userId === socket.user.id)) {
          // Đã trong phòng rồi, cho vào lại (reconnect)
          socket.join(code);
          socket.currentRoom = code;

          // Lấy chat cũ
          const chatHistory = await ChatMessage.find({ roomCode: code })
            .sort({ createdAt: -1 }).limit(50).lean();

          return callback({ room: formatRoomData(room), chatHistory: chatHistory.reverse() });
        }

        // Kiểm tra số dư tối thiểu
        const wallet = await prisma.wallet.findUnique({ where: { userId: socket.user.id } });
        if (!wallet || wallet.balance < room.minBet) {
          return callback({ error: `Cần ít nhất ${room.minBet} Xu để vào phòng này.` });
        }

        const maxOrder = room.players.reduce((max, p) => Math.max(max, p.joinOrder || 0), 0);
        room.players.push({
          userId: socket.user.id,
          username: socket.user.username,
          joinOrder: maxOrder + 1,
        });
        await room.save();

        socket.join(code);
        socket.currentRoom = code;

        // Thông báo phòng có thành viên mới
        io.to(code).emit('room:playerJoined', {
          player: { userId: socket.user.id, username: socket.user.username },
          players: room.players,
        });

        io.emit('lobby:roomUpdate', await getPublicRooms());

        // Lấy chat history
        const chatHistory = await ChatMessage.find({ roomCode: code })
          .sort({ createdAt: -1 }).limit(50).lean();

        callback({ room: formatRoomData(room), chatHistory: chatHistory.reverse() });
      } catch (err) {
        console.error('[JOIN ROOM ERROR]', err);
        callback({ error: 'Không thể vào phòng.' });
      }
    });

    // =============================================
    // NHÀ CÁI: BẮT ĐẦU VÒNG CƯỢC MỚI
    // =============================================
    socket.on('game:startBetting', async (callback) => {
      try {
        const room = await Room.findOne({ code: socket.currentRoom });
        if (!room) return callback({ error: 'Phòng không tồn tại.' });
        if (room.hostId !== socket.user.id) return callback({ error: 'Chỉ Nhà Cái mới được mở cược.' });
        if (room.status === 'betting') return callback({ error: 'Đang trong vòng cược rồi.' });

        room.status = 'betting';
        room.roundNumber += 1;
        room.currentRound = { bets: [], diceResults: [], totalBetAmount: 0, readyPlayers: [] };
        await room.save();

        io.to(socket.currentRoom).emit('game:bettingStarted', {
          roundNumber: room.roundNumber,
        });

        callback({ success: true });
      } catch (err) {
        console.error('[START BETTING ERROR]', err);
        callback({ error: 'Lỗi mở cược.' });
      }
    });

    // =============================================
    // TAY CON: ĐẶT CƯỢC (FIRST COME FIRST SERVED)
    // =============================================
    socket.on('game:placeBet', async ({ symbol, amount }, callback) => {
      try {
        const room = await Room.findOne({ code: socket.currentRoom });
        if (!room) return callback({ error: 'Phòng không tồn tại.' });
        if (room.status !== 'betting') return callback({ error: 'Chưa mở cược hoặc đã đóng.' });
        if (room.hostId === socket.user.id) return callback({ error: 'Nhà Cái không được đặt cược.' });
        if (!SYMBOLS.includes(symbol)) return callback({ error: 'Biểu tượng không hợp lệ.' });
        if (!amount || amount <= 0) return callback({ error: 'Số tiền cược không hợp lệ.' });

        // Tính tổng tiền người chơi đã cược trong ván này
        const myBetsTotal = room.currentRound.bets
          .filter(b => b.userId === socket.user.id)
          .reduce((sum, b) => sum + b.amount, 0);

        // Kiểm tra số dư tay con
        const playerWallet = await prisma.wallet.findUnique({ where: { userId: socket.user.id } });
        if (!playerWallet || playerWallet.balance < myBetsTotal + amount) {
          return callback({ error: 'Bạn không đủ Xu.' });
        }

        // ★ KIỂM TRA GIỚI HẠN NHÀ CÁI (First Come First Served) ★
        // Tổng cược không được vượt quá số dư Nhà Cái
        const hostWallet = await prisma.wallet.findUnique({ where: { userId: room.hostId } });
        const hostBalance = hostWallet?.balance || 0;

        // Trường hợp xấu nhất: mỗi cược có thể thắng x3 (xúc xắc ra đúng cả 3 mặt)
        // Nhà cái cần đủ tiền trả cho trường hợp tệ nhất
        const potentialMaxPay = amount * 3;
        const currentMaxExposure = room.currentRound.bets.reduce((sum, b) => sum + b.amount * 3, 0);

        if (currentMaxExposure + potentialMaxPay > hostBalance) {
          return callback({ error: 'Hết hạn mức! Nhà Cái không đủ tiền bảo lãnh.' });
        }

        // ĐẶT CƯỢC THÀNH CÔNG
        room.currentRound.bets.push({
          userId: socket.user.id,
          username: socket.user.username,
          symbol,
          amount,
        });
        room.currentRound.totalBetAmount += amount;
        await room.save();

        // Thông báo cho cả phòng
        io.to(socket.currentRoom).emit('game:betPlaced', {
          userId: socket.user.id,
          username: socket.user.username,
          symbol,
          amount,
          totalBetAmount: room.currentRound.totalBetAmount,
        });

        callback({ success: true });
      } catch (err) {
        console.error('[PLACE BET ERROR]', err);
        callback({ error: 'Lỗi đặt cược.' });
      }
    });

    // =============================================
    // TAY CON: HỦY TẤT CẢ CƯỢC TRONG VÁN
    // =============================================
    socket.on('game:clearBets', async (callback) => {
      try {
        const room = await Room.findOne({ code: socket.currentRoom });
        if (!room) return callback({ error: 'Phòng không tồn tại.' });
        if (room.status !== 'betting') return callback({ error: 'Không thể hủy cược lúc này.' });
        
        const userBets = room.currentRound.bets.filter(b => b.userId === socket.user.id);
        if (userBets.length === 0) return callback({ error: 'Bạn chưa đặt cược nào.' });
        
        const refundAmount = userBets.reduce((sum, b) => sum + b.amount, 0);
        
        // Bỏ trạng thái Xác Nhận nếu cố tình Hủy cược (tùy chọn)
        if (room.currentRound.readyPlayers && room.currentRound.readyPlayers.includes(socket.user.id)) {
          room.currentRound.readyPlayers = room.currentRound.readyPlayers.filter(id => id !== socket.user.id);
        }

        // Cập nhật lại list cược và tổng
        room.currentRound.bets = room.currentRound.bets.filter(b => b.userId !== socket.user.id);
        room.currentRound.totalBetAmount -= refundAmount;
        await room.save();
        
        // Emit để UI mọi người lấy list bets mới và cập nhật
        io.to(socket.currentRoom).emit('game:betsCleared', {
          userId: socket.user.id,
          clearedAmount: refundAmount,
          totalBetAmount: room.currentRound.totalBetAmount,
          bets: room.currentRound.bets,
          readyPlayers: room.currentRound.readyPlayers || []
        });
        
        callback({ success: true, refundAmount });
      } catch (err) {
        console.error('[CLEAR BETS ERROR]', err);
        callback({ error: 'Lỗi khi hủy cược.' });
      }
    });

    // =============================================
    // TAY CON: BẤM XÁC NHẬN CƯỢC XONG
    // =============================================
    socket.on('game:playerReady', async (callback) => {
      try {
        const room = await Room.findOne({ code: socket.currentRoom });
        if (!room) return callback({ error: 'Phòng không tồn tại.' });
        if (room.status !== 'betting') return callback({ error: 'Chỉ có thể bấm xong trong vòng cược.' });
        if (room.hostId === socket.user.id) return callback({ error: 'Nhà cái không cần thực hiện.' });

        if (!room.currentRound.readyPlayers) room.currentRound.readyPlayers = [];

        if (!room.currentRound.readyPlayers.includes(socket.user.id)) {
          room.currentRound.readyPlayers.push(socket.user.id);
          await room.save();
          // Broadcast trạng thái mới nhất cho phòng
          io.to(socket.currentRoom).emit('game:readyPlayersUpdate', {
            readyPlayers: room.currentRound.readyPlayers
          });
        }

        callback({ success: true });
      } catch (err) {
        console.error('[PLAYER READY ERROR]', err);
        callback({ error: 'Lỗi hệ thống.' });
      }
    });

    // =============================================
    // NHÀ CÁI: ĐÓNG CƯỢC & LẮC XÚC XẮC
    // =============================================
    socket.on('game:closeBetting', async (callback) => {
      try {
        const room = await Room.findOne({ code: socket.currentRoom });
        if (!room) return callback({ error: 'Phòng không tồn tại.' });
        if (room.hostId !== socket.user.id) return callback({ error: 'Chỉ Nhà Cái mới được lắc.' });
        if (room.status !== 'betting') return callback({ error: 'Chưa mở cược.' });

        room.status = 'rolling';
        await room.save();

        // Thông báo đóng cược
        io.to(socket.currentRoom).emit('game:bettingClosed');

        // Giả lập delay lắc xúc xắc 2 giây
        setTimeout(async () => {
          try {
            const result = await resolveRound(room, io);

            io.to(socket.currentRoom).emit('game:roundResult', {
              diceResults: result.diceResults,
              settlements: result.settlements,
              hostNetChange: result.hostNetChange,
              balanceMap: result.balanceMap,
              roundNumber: room.roundNumber,
            });

            // Kiểm tra kick người dưới minBet
            await checkAndKickPoorPlayers(room, io);
          } catch (err) {
            console.error('[RESOLVE ERROR]', err);
          }
        }, 2000);

        callback({ success: true });
      } catch (err) {
        console.error('[CLOSE BETTING ERROR]', err);
        callback({ error: 'Lỗi đóng cược.' });
      }
    });

    // =============================================
    // CHAT TEXT
    // =============================================
    socket.on('chat:sendMessage', async ({ message }, callback) => {
      if (!message || message.trim().length === 0) return;
      if (!socket.currentRoom) return;

      const msg = await ChatMessage.create({
        roomCode: socket.currentRoom,
        userId: socket.user.id,
        username: socket.user.username,
        message: message.trim().substring(0, 200),
      });

      io.to(socket.currentRoom).emit('chat:newMessage', {
        userId: msg.userId,
        username: msg.username,
        message: msg.message,
        createdAt: msg.createdAt,
      });

      if (callback) callback({ success: true });
    });

    // =============================================
    // THOÁT PHÒNG / NGẮT KẾT NỐI
    // =============================================
    socket.on('room:leave', async () => {
      await handlePlayerLeave(socket, io);
    });

    socket.on('disconnect', async () => {
      console.log(`🔌 ${socket.user.username} ngắt kết nối`);
      await handlePlayerLeave(socket, io);
    });
  });
}

// =============================================
// HÀM PHỤ TRỢ
// =============================================

function formatRoomData(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    hostName: room.hostName,
    players: room.players,
    status: room.status,
    minBet: room.minBet,
    isPublic: room.isPublic,
    roundNumber: room.roundNumber,
    currentRound: {
      bets: room.currentRound.bets,
      totalBetAmount: room.currentRound.totalBetAmount,
      readyPlayers: room.currentRound.readyPlayers || [],
    },
  };
}

/**
 * Xử lý khi người chơi rời phòng
 * - Nếu là Nhà Cái: truyền quyền cho người vào thứ 2
 * - Nếu phòng trống: xóa phòng
 */
async function handlePlayerLeave(socket, io) {
  if (!socket.currentRoom) return;
  const code = socket.currentRoom;

  try {
    const room = await Room.findOne({ code });
    if (!room) return;

    // Xóa người chơi khỏi danh sách
    room.players = room.players.filter((p) => p.userId !== socket.user.id);

    if (room.players.length === 0) {
      // Phòng trống -> Xóa hoàn toàn
      await Room.deleteOne({ code });
      io.emit('lobby:roomUpdate', await getPublicRooms());
      socket.leave(code);
      socket.currentRoom = null;
      return;
    }

    // Nếu Nhà Cái rời bàn -> Truyền quyền cho người vào sớm nhất
    if (room.hostId === socket.user.id) {
      // Sắp xếp theo joinOrder tăng dần và lấy người đầu
      const sorted = [...room.players].sort((a, b) => (a.joinOrder || 0) - (b.joinOrder || 0));
      const newHost = sorted[0];
      room.hostId = newHost.userId;
      room.hostName = newHost.username;

      // Reset ván nếu đang giữa chừng
      if (room.status === 'betting' || room.status === 'rolling') {
        room.status = 'waiting';
        room.currentRound = { bets: [], diceResults: [], totalBetAmount: 0, readyPlayers: [] };
      }

      io.to(code).emit('room:hostChanged', {
        newHostId: newHost.userId,
        newHostName: newHost.username,
        players: room.players,
      });
    }

    await room.save();

    io.to(code).emit('room:playerLeft', {
      userId: socket.user.id,
      username: socket.user.username,
      players: room.players,
    });

    io.emit('lobby:roomUpdate', await getPublicRooms());
    socket.leave(code);
    socket.currentRoom = null;
  } catch (err) {
    console.error('[LEAVE ERROR]', err);
  }
}

/**
 * Kick người chơi có số dư dưới mức tối thiểu sau mỗi ván
 */
async function checkAndKickPoorPlayers(room, io) {
  const freshRoom = await Room.findOne({ code: room.code });
  if (!freshRoom) return;

  const wallets = await prisma.wallet.findMany({
    where: { userId: { in: freshRoom.players.map((p) => p.userId) } },
    select: { userId: true, balance: true },
  });

  const balanceMap = {};
  for (const w of wallets) balanceMap[w.userId] = w.balance;

  const kicked = [];
  freshRoom.players = freshRoom.players.filter((p) => {
    if (balanceMap[p.userId] < freshRoom.minBet) {
      kicked.push(p);
      return false;
    }
    return true;
  });

  if (kicked.length > 0) {
    // Nếu Nhà Cái bị kick, truyền quyền
    if (kicked.some((k) => k.userId === freshRoom.hostId)) {
      if (freshRoom.players.length > 0) {
        const sorted = [...freshRoom.players].sort((a, b) => (a.joinOrder || 0) - (b.joinOrder || 0));
        freshRoom.hostId = sorted[0].userId;
        freshRoom.hostName = sorted[0].username;
      }
    }

    if (freshRoom.players.length === 0) {
      await Room.deleteOne({ code: freshRoom.code });
    } else {
      freshRoom.status = 'waiting';
      await freshRoom.save();
    }

    for (const k of kicked) {
      io.to(freshRoom.code).emit('room:playerKicked', {
        userId: k.userId,
        username: k.username,
        reason: 'Số dư thấp hơn mức tối thiểu.',
      });
    }

    io.emit('lobby:roomUpdate', await getPublicRooms());
  } else {
    // Reset trạng thái chờ cho ván tiếp
    freshRoom.status = 'waiting';
    await freshRoom.save();
  }
}
