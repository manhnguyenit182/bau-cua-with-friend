import mongoose from 'mongoose';

const roomSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true }, // Mã phòng 6 ký tự
  hostId: { type: String, required: true },              // UserId của Nhà Cái
  hostName: { type: String, required: true },
  isPublic: { type: Boolean, default: true },
  minBet: { type: Number, default: 100 },                // Số tiền tối thiểu để ở phòng
  maxPlayers: { type: Number, default: 8 },
  status: {
    type: String,
    enum: ['waiting', 'betting', 'rolling', 'result'],
    default: 'waiting',
  },
  players: [{
    userId: String,
    username: String,
    joinedAt: { type: Date, default: Date.now },
    joinOrder: Number, // Thứ tự vào phòng (dùng cho kế nhiệm host)
  }],
  // Trạng thái ván hiện tại
  currentRound: {
    bets: [{
      userId: String,
      username: String,
      symbol: String,       // bau, cua, tom, ca, ga, nai
      amount: Number,
      placedAt: { type: Date, default: Date.now },
    }],
    diceResults: [String],  // Kết quả 3 xúc xắc
    totalBetAmount: { type: Number, default: 0 }, // Tổng tiền cược hiện tại
    readyPlayers: [String], // Danh sách userId đã bấm Xác nhận cược xong
  },
  roundNumber: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

// Tạo mã phòng 6 ký tự ngẫu nhiên
roomSchema.statics.generateCode = function () {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

export default mongoose.model('Room', roomSchema);
