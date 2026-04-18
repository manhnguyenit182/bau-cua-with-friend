<div align="center">
  <h1>🎲 Bầu Cua With Friend 🎲</h1>
  <p>Dự án game Bầu Cua Online thời gian thực với thiết kế sang trọng để chơi cùng bạn bè!</p>
</div>

---

## 🌟 Giới thiệu
Bầu Cua Tôm Cá là một trò chơi dân gian truyền thống quen thuộc, nay được số hóa với giao diện hiện đại và tính năng phòng chơi thời gian thực. Dự án này được thiết kế với mục tiêu mang lại trải nghiệm giống như casino và tối ưu hóa tính tương tác cực mượt!

## ✨ Tính năng nổi bật
- **⚡ Phòng chơi thời gian thực (Real-time)**: Quản lý ván game, cược và tung xúc xắc lập tức đồng bộ giữa mọi người qua Socket.io.
- **🎨 Giao diện đẳng cấp (Premium UI)**: Bàn cược được thiết kế sang trọng, kèm theo các hiệu ứng thả chip (phỉnh), xúc xắc mượt mà chuẩn mobile & desktop.
- **🤖 Tương Tác AI**: Tích hợp trợ lý AI Ollama hỗ trợ người chơi trò chuyện trong sảnh.
- **💼 Hệ Thống Ví & Điểm Danh**: Tích hợp đăng nhập, quản lý tiền vốn, cộng trừ tiền minh bạch.

## 🛠️ Công nghệ sử dụng
### Backend (Lễ tân & Máy chủ Game)
- **Node.js & Express** 
- **Socket.io** (Xử lý giao tiếp thời gian thực)
- **Prisma & Mongoose** (Database ORM/ODM)
- **PostgreSQL** (Lưu ví và thông tin gốc chuẩn ACID)
- **MongoDB** (Trạng thái phòng chơi & lịch sử chat thần tốc)

### Frontend (Giao diện Casino)
- **React 19** với **Vite**
- **Vanilla CSS** & CSS Micro-animations
- **React Router DOM**
- **Socket.io Client**

## 🚀 Hướng dẫn chạy trên Local

Dự án hiện được tối ưu để chạy trong môi trường **Localhost**. Bạn cần chuẩn bị sẵn **Node.js**, **PostgreSQL**, vòng lặp lại **MongoDB Local/Atlas**.

### 1. Cài đặt Backend
```bash
cd backend
npm install

# Đừng quên tạo file .env từ .env.example để cấu hình thông số kết nối Database:
# cp .env.example .env

# Chạy server
npm run dev
```

### 2. Cài đặt Frontend
```bash
cd frontend
npm install

# Khởi chạy frontend server
npm run dev
```

Mở trình duyệt và truy cập `http://localhost:5173` để bắt đầu mở sòng nhé! 🎉

## 📜 Tác giả & Giấy phép
Thiết kế và lập trình: **manhnguyenit182**.
Dự án nhằm phục vụ mục đích giải trí và học tập.