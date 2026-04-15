# 🌐 Hướng Dẫn Deploy Frontend lên AWS S3 + CloudFront
*(Từng bước một - Học qua thực hành - Có chốt kiểm tra)*

> **Mục tiêu của tài liệu này:** Deploy ứng dụng React (Vite) lên S3 để lưu trữ, và CloudFront làm CDN phân phối toàn cầu. CloudFront sẽ đóng vai trò "tổng đài" thông minh: request vào `/api/*` và `/socket.io/*` sẽ được chuyển sang Backend (ALB), còn mọi request khác sẽ được phục vụ bởi file tĩnh trên S3.

---

## 📋 Bản Đồ Hành Trình

```
                        LUỒNG TRAFFIC PRODUCTION
                        
       User / Browser
              │
              ▼
    ┌─────────────────┐
    │   CloudFront    │  ← Cổng duy nhất ra vào (1 domain)
    │   Distribution  │
    └────────┬────────┘
             │
      ┌──────┴────────────────────────────────┐
      │                                       │
      │ Nếu path = /api/*                     │ Nếu path = /*
      │         hoặc /socket.io/*             │ (mọi thứ còn lại)
      ▼                                       ▼
  Backend ALB                           AWS S3 Bucket
  (ECS Fargate)                    (File React tĩnh)
```

**Giai đoạn 1: Chuẩn bị Kho chứa (S3)**
* [Bước 1: Tạo S3 Bucket và Cấu hình Static Website](#bước-1-tạo-s3-bucket-và-cấu-hình-static-website)

**Giai đoạn 2: Thiết lập Tổng đài (CloudFront)**
* [Bước 2: Tạo CloudFront Distribution với Multi-Origin](#bước-2-tạo-cloudfront-distribution-với-multi-origin)
* [Bước 3: Cấu hình Behavior - Luật phân loại request](#bước-3-cấu-hình-behavior---luật-phân-loại-request)

**Giai đoạn 3: Đóng gói và Upload thủ công (Lần đầu)**
* [Bước 4: Build React và Upload thủ công lên S3](#bước-4-build-react-và-upload-thủ-công-lên-s3)

**Giai đoạn 4: Tự động hóa 100% (GitHub Actions)**
* [Bước 5: Khai báo 2 Secrets còn lại cho GitHub](#bước-5-khai-báo-2-secrets-còn-lại-cho-github)
* [Bước 6: Bài thi tốt nghiệp toàn phần](#bước-6-bài-thi-tốt-nghiệp-toàn-phần)

---

## GIAI ĐOẠN 1: CHUẨN BỊ KHO CHỨA

### Bước 1: Tạo S3 Bucket và Cấu hình Static Website

**S3 Bucket là gì?** Hãy tưởng tượng đây là một "ổ cứng trên mây" không bao giờ hỏng. Bạn ném vào đó các file `.html`, `.js`, `.css` của React sau khi build, và S3 sẽ giữ chúng mãi mãi.

**Tại sao không cần Web Server (Nginx)?** Khác với backend cần Node.js xử lý logic, frontend React sau khi build chỉ còn là những file tĩnh (không có code xử lý gì phía server). S3 có khả năng phục vụ file tĩnh trực tiếp mà không cần máy chủ thêm — giúp bạn tiết kiệm tối đa chi phí.

#### 1.1 — Tạo Bucket

1. Vào **AWS Console** → Tìm dịch vụ **S3**.
2. Bấm nút **Create bucket** màu cam.
3. Điền thông tin:
   - **Bucket name**: `baucua-frontend` *(Tên phải là duy nhất toàn cầu — nếu bị báo đã tồn tại, thêm số ngẫu nhiên vào, ví dụ: `baucua-frontend-2026`)*
   - **AWS Region**: Chọn `ap-southeast-1` (Singapore) — **cùng Region với Backend ECS của bạn**.
4. **Block Public Access settings**: Tìm mục này và **BỎ TÍCH** ô `Block all public access`. AWS sẽ hiện cảnh báo màu vàng — bạn tích thêm ô xác nhận bên dưới.
   > 💡 **Tại sao lại bỏ chặn?** Người dùng cuối cần trình duyệt của họ TẢI TRỰC TIẾP file JS/CSS từ S3. Nếu để chặn, không ai tải được gì cả. Đừng lo — chúng ta sẽ cấp quyền truy cập theo cách kiểm soát hơn ở bước sau.
5. Kéo xuống cuối — bấm **Create bucket**.

#### 1.2 — Cấu hình Static Website Hosting

1. Bấm vào bucket vừa tạo.
2. Chọn tab **Properties** (Thuộc tính).
3. Kéo xuống cuối cùng, tìm mục **Static website hosting** → bấm **Edit**.
4. Chọn **Enable**.
5. Điền:
   - **Index document**: `index.html`
   - **Error document**: `index.html` *(Cùng là index.html — giải thích bên dưới)*
6. Bấm **Save changes**.

> 💡 **Tại sao Error document cũng là `index.html`?**
> React dùng **Client-side Routing** (React Router). Khi user vào thẳng `/game/abc123`, S3 sẽ tìm file `game/abc123/index.html` nhưng không tìm thấy, nó báo lỗi 404. Thay vì hiện trang lỗi, ta bảo S3 "cứ trả về `index.html` đi", và React Router sẽ tự xử lý route đó. Nếu không làm bước này, mọi người dùng refresh trang sẽ gặp lỗi trắng toát.

#### 1.3 — Cấp quyền đọc Public (Bucket Policy)

Đây là bước "mở cửa" chính thức, theo đúng chuẩn AWS — tốt hơn cách "Allow Everything" thủ công.

1. Trong bucket, chọn tab **Permissions** (Quyền).
2. Kéo xuống mục **Bucket policy** → bấm **Edit**.
3. Xóa nội dung cũ, paste đoạn JSON sau vào (nhớ thay `baucua-frontend` bằng tên bucket thật của bạn):
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "PublicReadGetObject",
         "Effect": "Allow",
         "Principal": "*",
         "Action": "s3:GetObject",
         "Resource": "arn:aws:s3:::baucua-frontend/*"
       }
     ]
   }
   ```
4. Bấm **Save changes**.

> [!NOTE]
> **Đọc hiểu Policy này:**
> - `"Principal": "*"` = Ai cũng được (public)
> - `"Action": "s3:GetObject"` = Chỉ được **đọc/tải** file, không được xóa hay viết
> - `"Resource": "arn:aws:s3:::baucua-frontend/*"` = Áp dụng cho **mọi file** trong bucket

> 🚦 **Bài Test Số 1: Bucket đã cài đặt thành công?**
> 1. Vào tab **Properties** → kéo xuống cuối → mục **Static website hosting**.
> 2. Thấy chữ **Enabled** và một URL dạng `baucua-frontend.s3-website-ap-southeast-1.amazonaws.com`.
> 3. Click vào URL đó — trình duyệt sẽ báo lỗi **404 Not Found** → **Đó là thành công!** Vì bucket đang trống, chưa có file nào để hiển thị. Nhưng nó đã phản hồi, không phải "Timeout" — nghĩa là Bucket đã hoạt động đúng.

---

## GIAI ĐOẠN 2: THIẾT LẬP TỔNG ĐÀI THÔNG MINH

### Bước 2: Tạo CloudFront Distribution với Multi-Origin

**CloudFront là gì?** CloudFront là mạng CDN (Content Delivery Network) của AWS với hơn 400 điểm phân phối (Edge Locations) trên toàn thế giới. Khi user ở Hà Nội truy cập, họ nhận file từ server ở Singapore thay vì từ AWS Region gốc ở Mỹ — nhanh hơn rất nhiều.

**Multi-Origin là gì?** CloudFront của chúng ta sẽ kết nối với **2 nguồn dữ liệu khác nhau**:
- **Origin 1 - S3 Bucket**: Phục vụ file React (HTML, JS, CSS, ảnh...)
- **Origin 2 - ALB Backend**: Phục vụ API (`/api/*`) và WebSocket (`/socket.io/*`)

Điều này giúp **Frontend và Backend dùng chung 1 domain**. Không còn vấn đề CORS!

#### 2.1 — Mở CloudFront và Tạo Distribution

1. Vào **AWS Console** → Tìm dịch vụ **CloudFront**.
2. Bấm nút **Create a CloudFront distribution** màu cam.

#### 2.2 — Cấu hình Origin đầu tiên (S3 — Default)

Đây là Origin mặc định. Mọi request không khớp luật nào sẽ theo về đây.

1. **Origin domain**: Bấm vào ô này và chọn bucket `baucua-frontend...` từ danh sách.
   > ⚠️ **Quan trọng:** AWS sẽ tự điền và hỏi *"Use website endpoint"*. Bạn phải bấm **Use website endpoint** thay vì dùng endpoint mặc định. Thao tác này đảm bảo tính năng Error Document (`index.html`) hoạt động đúng.
2. **Origin name**: Tự điền, giữ nguyên.
3. **Protocol**: HTTP only *(Vì S3 website endpoint chỉ dùng HTTP — CloudFront sẽ là nơi xử lý HTTPS với user)*.

#### 2.3 — Cấu hình Cache và Viewer Protocol

Kéo tiếp xuống trong cùng trang:

4. **Viewer protocol policy**: Chọn **Redirect HTTP to HTTPS**. *(Người dùng gõ http, CloudFront tự chuyển sang https)*.
5. **Cache policy**: Chọn **CachingOptimized** *(Dành cho nội dung tĩnh — mặc định hợp lý)*.
6. Tất cả phần còn lại của trang: **Giữ nguyên mặc định**.
7. Cuộn xuống cuối → Bấm **Create distribution**.
8. 📋 CloudFront sẽ tạo và trả về một **Distribution ID** và một **Domain name** dạng `d1abc123xyz.cloudfront.net`. **Lưu lại cả hai**.

> ⏰ CloudFront cần **5-15 phút** để khởi tạo. Trạng thái sẽ chuyển từ `Deploying` sang `Enabled`. Bạn có thể tiếp tục Bước 3 trong lúc chờ.

---

### Bước 3: Cấu hình Behavior — Luật Phân Loại Request

**Behavior là gì?** Đây là bộ "luật giao thông" của CloudFront. Nó quyết định: *"Request này đến từ đường nào? Gửi nó đến nguồn nào?"*.

Mặc định, CloudFront đã có 1 Behavior gửi tất cả về S3. Chúng ta cần thêm 2 Behavior đặc biệt cho `/api/*` và `/socket.io/*` để chúng đi về Backend ALB thay vì S3.

#### 3.1 — Thêm Origin thứ 2 (ALB Backend)

Trước khi thêm Behavior, ta phải khai báo Origin thứ 2.

1. Bấm vào Distribution vừa tạo → Tab **Origins** → Bấm **Create origin**.
2. **Origin domain**: Dán Link DNS của ALB Backend vào (dạng `baucua-backend-alb-xxx.ap-southeast-1.elb.amazonaws.com`).
3. **Protocol**: Chọn **HTTP only** (ALB của chúng ta đang lắng nghe cổng 80).
4. **Origin name**: Đặt là `backend-alb` cho dễ nhận biết.
5. Kéo xuống mục **Additional settings** → **Response timeout**: Tăng lên `60` giây.
   > 💡 **Tại sao 60 giây?** Socket.io dùng Long Polling (một kiểu kết nối "nói chuyện dài") trước khi upgrade lên WebSocket. CloudFront mặc định chỉ chờ 30 giây. Tăng lên 60 để WebSocket có đủ thời gian thiết lập kết nối.
6. Bấm **Save changes**.

> [!IMPORTANT]
> **Bước này rất dễ quên.** Nếu bỏ qua việc tăng timeout lên 60 giây, Socket.io sẽ hoạt động chập chờn hoặc không kết nối được liên tục.

#### 3.2 — Tạo Behavior cho `/api/*`

1. Tab **Behaviors** → Bấm **Create behavior**.
2. Cấu hình:
   - **Path pattern**: `/api/*`
   - **Origin and origin groups**: Chọn `backend-alb`
   - **Viewer protocol policy**: `HTTPS only`
   - **Allowed HTTP methods**: Chọn `GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE` (Backend API cần tất cả các method)
   - **Cache policy**: Chọn `CachingDisabled` *(API response không được cache — mỗi lần gọi phải lấy data mới)*
   - **Origin request policy**: Chọn `AllViewer` *(Chuyển tiếp toàn bộ Headers của user lên Backend — cần thiết cho JWT Token)*
3. Bấm **Create behavior**.

#### 3.3 — Tạo Behavior cho `/socket.io/*`

Tương tự, tạo thêm một Behavior nữa:

1. **Create behavior** lần nữa.
2. Cấu hình:
   - **Path pattern**: `/socket.io/*`
   - **Origin and origin groups**: Chọn `backend-alb`
   - **Viewer protocol policy**: `HTTPS only`
   - **Allowed HTTP methods**: `GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE`
   - **Cache policy**: `CachingDisabled`
   - **Origin request policy**: `AllViewer`
3. Bấm **Create behavior**.

> 🚦 **Bài Test Số 3: Behaviors đã đúng chưa?**
> Vào tab **Behaviors**, bạn phải thấy đủ 3 dòng:
> | Priority | Path Pattern | Origin |
> |---|---|---|
> | 0 | `/api/*` | backend-alb |
> | 1 | `/socket.io/*` | backend-alb |
> | Default | `*` | S3 bucket |
> 
> (Thứ tự ưu tiên: CloudFront sẽ kiểm tra từ Priority 0 trở đi. Nếu không khớp gì, sẽ dùng Default.)

---

## GIAI ĐOẠN 3: ĐÓNG GÓI VÀ UPLOAD THỦ CÔNG

### Bước 4: Build React và Upload thủ công lên S3

**Tại sao làm thủ công một lần?** Tương tự như Backend, ta sẽ tự tay làm một lần để xác nhận hệ thống đang hoạt động đúng, trước khi giao cho Robot GitHub tự động.

> [!IMPORTANT]
> **Trước khi Build**, bạn cần kiểm tra file `frontend/src/services/socket.js`.
> Trong production, Socket.io kết nối tới URL `'/'`, nghĩa là nó sẽ kết nối tới cùng domain với trang web (tức là domain CloudFront). Điều này là **đúng** — CloudFront sẽ tự biết chuyển request `/socket.io/*` về ALB Backend.
> **Bạn không cần sửa gì** trong code — config đã chuẩn sẵn.

#### 4.1 — Build React app trên máy local

1. Mở Terminal, vào thư mục frontend:
   ```bash
   cd frontend
   npm run build
   ```
2. Sau khi hoàn thành, thư mục `frontend/dist/` sẽ xuất hiện (hoặc được cập nhật). Đây là những file tĩnh đã được tối ưu hóa để deploy.

#### 4.2 — Upload lên S3 bằng AWS Console

1. Vào **S3** → Bấm vào bucket `baucua-frontend`.
2. Bấm nút **Upload** màu cam.
3. Bấm **Add files** → Chọn tất cả nội dung **bên trong** thư mục `frontend/dist/` *(Chú ý: Chọn các file và thư mục bên trong, không phải kéo cả thư mục `dist/` vào)*.
4. Bấm **Upload** và chờ xong.

> [!WARNING]
> **Lỗi thường gặp:** Nhiều người kéo thả cả thư mục `dist/` vào, dẫn đến S3 lưu file theo đường dẫn `dist/index.html` thay vì `index.html`. CloudFront sẽ không tìm thấy trang chủ. Hãy đảm bảo file `index.html` nằm ngay ở root của bucket, không bị lồng trong thư mục.

> 🚦 **Bài Test Số 4: Website đã hoạt động?**
> 1. Vào CloudFront Console, copy **Distribution domain name** (dạng `d1abc123xyz.cloudfront.net`).
> 2. Dán vào trình duyệt và mở.
> 3. **Kết quả mong đợi:** Trang web Bầu Cua hiện ra!
> 4. **Test thêm:** Bấm vào trang Login/Register và thử đăng ký một tài khoản. Nếu đăng ký thành công → nghĩa là CloudFront đã chuyển request `/api/auth/register` thành công sang Backend.
> 
> Nếu trang web hiện ra nhưng Login thất bại, hãy kiểm tra lại Behavior `/api/*` đã trỏ đúng về ALB Backend chưa.

---

## GIAI ĐOẠN 4: TỰ ĐỘNG HÓA 100%

### Bước 5: Khai báo 2 Secrets còn lại cho GitHub

Bạn đã có 4 Secrets cho Backend từ tài liệu trước. Giờ cần thêm 2 Secrets nữa để GitHub Actions tự upload lên S3 và xóa cache CloudFront.

1. Vào **GitHub Repo** → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
2. Thêm 2 secrets sau:

| Secret Name | Giá trị | Lý do cần |
|---|---|---|
| `S3_BUCKET_NAME` | `baucua-frontend` (hoặc tên bucket thật của bạn) | GitHub biết phải upload lên bucket nào |
| `CLOUDFRONT_DISTRIBUTION_ID` | Distribution ID từ Bước 2 (dạng `E1ABCDEF123456`) | Để xóa cache sau khi upload file mới |

> 💡 **Tại sao cần xóa cache CloudFront?**
> CloudFront lưu cache các file trên các Edge Server khắp thế giới để phục vụ nhanh. Nếu bạn upload file mới lên S3 mà không xóa cache, CloudFront vẫn sẽ phục vụ bản cũ cho user trong nhiều giờ. Việc "Invalidate cache" (xóa cache) buộc CloudFront phải lấy file mới từ S3 về.

---

### Bước 6: Bài thi tốt nghiệp toàn phần

Bây giờ mọi hạ tầng đã sẵn sàng. Hãy để GitHub Actions tự động làm tất cả.

**Nhìn lại workflow đã có sẵn** (`.github/workflows/deploy.yml` Job 1):

```yaml
deploy-frontend:
  name: 🎨 Deploy Frontend (S3 + CDN)
  runs-on: ubuntu-latest

  steps:
    # 1. Lấy code về máy ảo Ubuntu
    - name: 📥 Checkout code
      uses: actions/checkout@v4

    # 2. Cài Node.js và dependencies
    - name: 📦 Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: 20
        cache-dependency-path: frontend/package-lock.json

    - name: 📥 Install dependencies
      working-directory: ./frontend
      run: npm ci

    # 3. Build React → tạo ra thư mục dist/
    - name: 🏗️ Build React app
      working-directory: ./frontend
      run: npm run build

    # 4. Cấp quyền AWS
    - name: 🔑 Configure AWS Credentials
      uses: aws-actions/configure-aws-credentials@v4
      with:
        aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
        aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        aws-region: ${{ secrets.AWS_REGION }}

    # 5a. Upload file tĩnh với cache dài hạn (1 năm) — chỉ thay đổi khi file hash thay đổi
    - name: 📤 Sync static assets to S3
      run: |
        aws s3 sync ./frontend/dist s3://${{ secrets.S3_BUCKET_NAME }} \
          --delete \
          --cache-control "public, max-age=31536000, immutable" \
          --exclude "index.html"

    # 5b. Upload index.html RIÊNG với cache = 0 (không cache)
    # Vì index.html là "cổng vào" — phải luôn là bản mới nhất
    - name: 📤 Upload index.html (no cache)
      run: |
        aws s3 cp ./frontend/dist/index.html s3://${{ secrets.S3_BUCKET_NAME }}/index.html \
          --cache-control "public, max-age=0, must-revalidate"

    # 6. Xóa cache CloudFront để user nhận bản mới ngay lập tức
    - name: 🌐 Invalidate CloudFront Cache
      run: |
        aws cloudfront create-invalidation \
          --distribution-id ${{ secrets.CLOUDFRONT_DISTRIBUTION_ID }} \
          --paths "/*"
```

**Tại sao upload index.html riêng?**
Khi bạn build React, Vite tạo ra các file JS dạng `main-abc123.js` (có hash trong tên). Browser cache file này rất lâu vì hash thay đổi khi code thay đổi → tên file thay đổi → browser tự tải bản mới. Nhưng `index.html` là file điều phối các file JS đó — nó phải luôn cập nhật để "chỉ đường" đến đúng phiên bản JS mới. Vì vậy `index.html` không được cache.

#### Thực hành thử:

1. Mở file `frontend/src/App.jsx` hoặc bất kỳ file nào hiển thị giao diện.
2. Thay đổi một dòng chữ bất kỳ.
3. Commit và push:
   ```bash
   git add .
   git commit -m "test: thay đổi giao diện frontend"
   git push origin main
   ```

> 🚦 **Bài Test Cuối Cùng — Tốt Nghiệp Toàn Phần:**
> 1. Vào GitHub → Tab **Actions** → Quan sát cả 2 Jobs chạy song song: Frontend và Backend.
> 2. Chờ Job `🎨 Deploy Frontend` tick xanh (thường nhanh hơn Backend, khoảng 2-3 phút).
> 3. Mở lại URL CloudFront (`d1abc123xyz.cloudfront.net`) trên trình duyệt.
> 4. Bấm **Ctrl + Shift + R** (Hard Refresh, bỏ qua cache trình duyệt).
> 5. **Kết quả mong đợi:** Thay đổi bạn vừa làm xuất hiện ngay trên web!
> 6. **Test Socket.io:** Mở 2 tab/trình duyệt, đăng nhập 2 tài khoản khác nhau, vào một phòng chơi. Nếu cả 2 tab tương tác được với nhau theo thời gian thực → WebSocket qua CloudFront đang hoạt động hoàn hảo.

---

## 🏆 Tổng Kết — Hệ Thống Bầu Cua Production

Chúc mừng! Bạn đã hoàn thành toàn bộ stack triển khai:

```
                   git push main
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
    GitHub Actions               GitHub Actions
    Job 1: Frontend              Job 2: Backend
              │                     │
              │                     │
    Build React (Vite)       Build Docker Image
              │                     │
    Upload → S3 Bucket        Push → ECR
              │                     │
    Invalidate CloudFront    Update ECS Task Def
    Cache                          │
                             ECS Rolling Update
                             (Zero Downtime)
              │                     │
              └──────────┬──────────┘
                         ▼
              CloudFront Distribution
              (1 Domain cho tất cả)
                    /api/*  ──────► ALB ──► ECS Container
                    /socket.io/* ─► ALB ──► ECS Container
                    /*       ──────► S3 Bucket (React files)
```

| Thành phần | Dịch vụ | Chi phí ước tính |
|---|---|---|
| Lưu trữ Frontend | S3 | ~$0.02/GB/tháng |
| Phân phối CDN | CloudFront | Free tier 1TB/tháng |
| Backend Container | ECS Fargate | ~$14/tháng (0.5vCPU, 1GB) |
| Load Balancer | ALB | ~$16/tháng |
| Database | Prisma Cloud + MongoDB Atlas | Free tier |
| **Tổng cộng** | | **~$30/tháng** |

---

## Xử Lý Sự Cố Thường Gặp

### ❌ Trang web hiện nhưng `Cannot GET /` hoặc trang trắng khi Refresh
- **Nguyên nhân**: S3 chưa cấu hình Error Document là `index.html`, hoặc file nằm trong thư mục `dist/` thay vì root bucket.
- **Fix**: Kiểm tra lại mục 1.2 và đảm bảo `index.html` nằm ở root của bucket (không trong thư mục con).

### ❌ API trả về lỗi 502 Bad Gateway hoặc 503
- **Nguyên nhân**: Behavior `/api/*` trong CloudFront chưa trỏ đúng về ALB Backend.
- **Fix**: Vào CloudFront → Behaviors → Kiểm tra Origin của `/api/*` đang là `backend-alb` và Origin domain là đúng DNS của ALB.

### ❌ Socket.io liên tục ngắt kết nối (reconnecting...)
- **Nguyên nhân**: CloudFront Origin timeout quá thấp (30 giây mặc định).
- **Fix**: Vào CloudFront → Origins → Sửa Origin `backend-alb` → Tăng **Response timeout** lên `60`.

### ❌ User deploy xong nhưng vẫn thấy giao diện cũ
- **Nguyên nhân**: CloudFront cache chưa được xóa, hoặc browser đang cache từ trước.
- **Fix**: 
  1. Thử **Ctrl + Shift + R** (Hard Refresh).
  2. Kiểm tra GitHub Actions Log xem bước "Invalidate CloudFront Cache" có chạy thành công không.
  3. Vào CloudFront Console → Distributions → Tab **Invalidations** → Tạo Invalidation mới với path `/*`.

---

> 📅 Tài liệu cập nhật: 2026-04-07
>
> 🔗 Repository: [BauCuaWithFriend](https://github.com/manhnguyenit182/BauCuaWithFriend)
>
> ⚡ Kiến trúc: S3/CloudFront (Frontend) + ECS Fargate (Backend) + Prisma Cloud + MongoDB Atlas
