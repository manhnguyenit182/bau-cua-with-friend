import mongoose from 'mongoose';

const chatMessageSchema = new mongoose.Schema({
  roomCode: { type: String, required: true, index: true },
  userId: { type: String, required: true },
  username: { type: String, required: true },
  message: { type: String, required: true, maxlength: 200 },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model('ChatMessage', chatMessageSchema);
