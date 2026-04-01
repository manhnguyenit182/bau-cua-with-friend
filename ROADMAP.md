# BẢN KẾ HOẠCH TRIỂN KHAI (ROADMAP) - GAME BẦU CUA ONLINE

Chào bạn (Project Manager), tôi rất sẵn sàng tham gia dự án này với vai trò Tech Lead. Dưới đây là chiến lược triển khai chi tiết cho dự án từ góc nhìn kỹ thuật, được diễn đạt bằng ngôn ngữ phổ thông, dễ hiểu để bạn nắm được tiến độ và cách hệ thống của chúng ta vận hành.

---

## 1. Kiến Trúc Hệ Thống (Bức Tranh Tổng Thể)

Hãy tưởng tượng hệ thống của chúng ta giống như một Sòng bài (Casino) ngoài đời thật, được chia làm 3 bộ phận chính:

- **Ngân Hàng Điện Tử (PostgreSQL / MySQL):** Đây là két sắt an toàn tuyệt đối. Nó làm nhiệm vụ quản lý thông tin khách hàng (Tài khoản), lưu trữ số dư (Ví điểm), và ghi chép lại mọi giao dịch Tăng/Giảm tiền. Dữ liệu tĩnh như thế này bắt buộc phải dùng CSDL Quan hệ (SQL) để không bao giờ bị thất thoát hay sai số.
- **Sàn Đấu & Quản Quản Trò (MongoDB):** Nơi ghi lại các ván bài đang diễn ra thần tốc: Trạng thái các phòng, thông tin Ai vừa cược con gì, tin nhắn chat. Loại dữ liệu này thay đổi liên tục, dồn dập mỗi giây, nên chúng ta dùng MongoDB vì tính linh hoạt, tốc độ ghi/đọc cực nhanh.
- **Hệ Thống Camera & Bộ Đàm (Socket.io):** Đây là ma thuật giúp game đạt chuẩn "Thời gian thực" (Realtime). Nó giúp Nhà cái và Người chơi thấy ngay lập tức số tiền người khác vừa đặt lên bàn, viên xúc xắc vừa tung ra gì, hay tin nhắn người khác vừa chat... mà **KHÔNG CẦN F5 (TẢI LẠI TRANG)**.
- **Lễ Tân & Kế Toán (Backend API):** Người đứng ra xác thực đăng nhập, kiểm tra mật khẩu, phát tiền thưởng điểm danh và điều phối chung.
- **Mặt Tiền Casino (Frontend UI):** Giao diện Web App hiển thị trên điện thoại/máy tính của khách, được thiết kế đẹp mắt (bàn cược 6 ô, xúc xắc, chip cược).

---

## 2. Kế Hoạch Triển Khai (5 Giai Đoạn)

### Giai đoạn 1: Xây dựng Nền móng & "Ngân hàng" (Database & Authentication)
*Mục tiêu:* Người chơi có thể tạo tài khoản, có tiền vốn, có thể điểm danh để lấy quà.
- **Công việc kỹ thuật:** 
  - Khởi tạo dự án Backend (Node.js).
  - Thiết kế bảng CSDL cho User (Người dùng) và Wallet (Ví tiền) trên PostgreSQL.
  - Lập trình API Đăng xuất/Đăng nhập an toàn.
  - Viết logic cấp 3.000 điểm khi tạo mới và API điểm danh tặng 1.000 điểm mỗi ngày.

### Giai đoạn 2: Trạm trung chuyển & Quản lý Phòng (Room Management)
*Mục tiêu:* Tạo ra không gian bàn chơi, ai được làm cái, ai là tay con. Phòng Public ai cũng thấy, phòng Private phải có link/code.
- **Công việc kỹ thuật:**
  - Thiết kế cấu trúc lưu trữ Phòng (Room) trên MongoDB.
  - Lập trình API tạo phòng mới (Cắm cờ public / private).
  - Lập trình API tham gia phòng, cấp quyền "Nhà Cái" (Host) cho người tạo, "Tay Con" (Player) cho người vào sau (giới hạn 8 ghế).
  - Thiết lập Socket.io để đưa mọi người vào đúng kênh liên lạc tương ứng với phòng họ chọn.

### Giai đoạn 3: Động cơ Game thời gian thực (Realtime Game Engine & Cược)
*Mục tiêu:* Logic ván bài diễn ra suôn sẻ, luật đền tiền chuẩn xác, xử lý tranh giành cược. Đây là giai đoạn cốt lõi.
- **Công việc kỹ thuật:**
  - **Logic Vòng lặp:** Lập trình luồng sự kiện Socket: (1) Nhà cái mở cược -> (2) Người chơi đặt tiền -> (3) Nhà cái đóng cược khóa bàn -> (4) Tung 3 xúc xắc -> (5) Công bố kết quả.
  - **Logic "Nhanh tay thì được":** Viết thuật toán bắt tổng tiền cược. Mỗi khi tay con bấm cược, server đếm tổng tiền của bàn, nếu sắp vượt quá số dư tài khoản của Nhà Cái thì khối lệnh bị từ chối và bắn thông báo báo lỗi cho người cược chậm.
  - **Thuật toán Trả thưởng:** Tự động đối chiếu 3 mặt xúc xắc sinh ngẫu nhiên với vé cược và tự động cộng/trừ tiền trong "Ngân hàng PostgreSQL".
  - **Tương tác:** Ghép khung tính năng Text Chat Real-time trong cùng room.

### Giai đoạn 4: Thiết kế "Mặt tiền" & Trải nghiệm Người dùng (Frontend UI/UX)
*Mục tiêu:* Người chơi nhìn thấy một sòng bài thu nhỏ sống động, Responsive (chuẩn mobile).
- **Công việc kỹ thuật:**
  - Thiết lập dự án React (Vite) + Vanilla CSS để kiểm soát chuyển động và giao diện.
  - Dựng trang Đăng nhập / Sảnh chọn phòng (Sạch sẽ, sang trọng).
  - Dựng Giao diện Bàn cược (Khu vực nhà cái, bàn 6 linh vật, danh sách người chơi, khung chat).
  - Tích hợp hiệu ứng (Micro-animations): Phỉnh cược bay lên bàn, Xúc xắc lắc tưng bừng. 

### Giai đoạn 5: Tích hợp, Kiểm thử & Đánh bóng (Testing & Polish)
*Mục tiêu:* Bảo đảm không có lỗi lòi tiền, không bị lag khi chơi.
- **Công việc kỹ thuật:**
  - Tích hợp ghép nối Frontend (Mặt tiền) với Backend (Lễ tân) và Socket (Camera).
  - Giải lập nhiều người chơi thao tác, đua lệnh cược cùng lúc (Race Condition Test) bảo đảm ví cái không bao giờ bị âm.
  - Căng chỉnh cuối cùng giao diện cho vừa khít các loại điện thoại.
  - Chuẩn bị sẵn sàng thư mục để Deploy (Vận hành).

---
*Nếu bạn (PM) đã xem và hiểu bức tranh này, vui lòng phê duyệt Plan ở công cụ giao tiếp kế bên để tôi bắt đầu nhúng tay vào VIẾT CODE cho Giai đoạn 1.*
