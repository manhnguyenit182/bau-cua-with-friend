# 🎓 Hướng Dẫn Thực Hành Deploy Backend AWS ECS Fargate
*(Từng bước một - Học qua thực hành - Có chốt kiểm tra)*

> **Mục tiêu của tài liệu này:** Xây dựng hướng dẫn theo sát thực tế. Thay vì cấu hình một lèo từ đầu đến cuối dễ gây hoang mang, chúng ta sẽ làm từng chặng. Ở mỗi chặng, bạn sẽ có một bài **Test** để chứng minh cấu hình của bạn đang hoạt động đúng.

---

## 📋 Bản Đồ Hành Trình
**Giai đoạn 1: Đóng gói và Lưu trữ (Docker & ECR)**
* [Bước 1: Chạy thử Docker trên máy tính (Local)](#bước-1-chạy-thử-docker-trên-máy-tính-local)
* [Bước 2: Sở hữu Kho chứa trên mây (AWS ECR)](#bước-2-sở-hữu-kho-chứa-trên-mây-aws-ecr)

**Giai đoạn 2: Sân bãi, Bảo vệ và Lễ tân (Mạng lưới & Bảo mật)**
* [Bước 3: Cất giấu bí mật (Parameter Store)](#bước-3-cất-giấu-bí-mật-parameter-store)
* [Bước 4: Tuyển Lễ tân (ALB) và Bảo vệ (Security Groups)](#bước-4-tuyển-lễ-tân-alb-và-bảo-vệ-security-groups)

**Giai đoạn 3: Nhà máy vân hành (Triển khai ECS thủ công)**
* [Bước 5: Xây nhà xưởng (Cluster) và Lắp hệ thống Camera (CloudWatch Logs)](#bước-5-xây-nhà-xưởng-cluster-và-lắp-hệ-thống-camera-cloudwatch-logs)
* [Bước 6: Vẽ bản thiết kế (Task Definition)](#bước-6-vẽ-bản-thiết-kế-task-definition)
* [Bước 7: Thuê công nhân (ECS Service)](#bước-7-thuê-công-nhân-ecs-service)

**Giai đoạn 4: Tự động hóa 100% (GitHub Actions)**
* [Bước 8: Giao chìa khóa cho Robot (GitHub Secrets)](#bước-8-giao-chìa-khóa-cho-robot-github-secrets)
* [Bước 9: Bài thi tốt nghiệp toàn phần](#bước-9-bài-thi-tốt-nghiệp-toàn-phần)

---

## GIAI ĐOẠN 1: ĐÓNG GÓI VÀ LƯU TRỮ

### Bước 1: Chạy thử Docker trên máy tính (Local)
**Mục đích:** Trước khi quăng code lên mây, ta phải đóng gói nó thành 1 kiện hàng (Docker Image) và chắc chắn kiện hàng này không bị lủng đáy.

**Hướng dẫn:**
1. Mở Terminal (Git Bash / PowerShell), đi vào thư mục `backend`.
2. Chạy lệnh: `docker build -t baucua-test .` (Nhớ có dấu chấm ở cuối).
3. Đợi nó cài đặt Node, pull image, generate Prisma...

> 🚦 **Bài Test Số 1:**
> Chạy lệnh: `docker run -p 5000:5000 baucua-test`
> **Kết quả mong đợi:** Nó sẽ báo lỗi! Đại loại như `MongoDB connection error` hoặc `Prisma Client ... missing url`.
> **Thành công:** Việc báo lỗi là CHÍNH XÁC. Vì trong máy local ta đang dùng biến môi trường `.env`, nhưng Docker image không được copy `.env` vào (nhờ file `.dockerignore`). Điều này chứng tỏ Image đã sạch sẽ, và khi lên mây, nó sẽ xin AWS cấp biến môi trường sau.

### Bước 2: Sở hữu Kho chứa trên mây (AWS ECR)
**Mục đích:** Github Actions sau này build Image xong thì phải có chỗ ném lên. Đó là ECR (Elastic Container Registry).

**Hướng dẫn:**
1. Đăng nhập **AWS Console**, tìm **ECR (Elastic Container Registry)**.
2. Bấm **Create repository**:
   - Chọn **Private**.
   - Repository name: `baucua/backend`
3. Kéo xuống bấm **Create repository**.
4. Truy cập **IAM** -> **Users** -> Tạo User tên `github-actions-deployer`.
   - Cấp policy: `AmazonEC2ContainerRegistryPowerUser`, `AmazonECS_FullAccess`, `AmazonSSMReadOnlyAccess`.
   - Sang tab `Security credentials` -> **Create access key** (chọn CLI) -> Lưu lại `Access Key ID` và `Secret Access Key`.

> 🚦 **Bài Test Số 2:**
> Vào lại kho ECR `baucua/backend` mới tạo. Nhìn lên góc phải bấm **View push commands**. Sao chép dòng số 1 (lệnh `aws ecr get-login-password...`) và chạy trong Terminal máy bạn (nếu đã cài AWS CLI). Nếu hiện `Login Succeeded` là tài khoản IAM đã chuẩn chỉnh.
> *Lưu ý: Bạn copy URL kho (bắt đầu bằng số, kết thúc bằng `baucua/backend`) để dùng cho các bước sau.*

---

## GIAI ĐOẠN 2: SÂN BÃI, BẢO VỆ VÀ LỄ TÂN

### Bước 3: Cất giấu bí mật (Parameter Store)
**Mục đích:** Dấu kín Pass database.

**Hướng dẫn:**
1. Mở **AWS Console** -> Tìm **Systems Manager** -> Bấm **Parameter Store** ở menu trái.
2. Tạo 3 tham số bằng cách bấm **Create parameter**, luôn chọn type là **SecureString**:
   - `/baucua/DATABASE_URL` (Giá trị: URL Prisma Cloud)
   - `/baucua/MONGODB_URI` (Giá trị: URL MongoDB Atlas)
   - `/baucua/JWT_SECRET` (Giá trị: Tùy bạn đặt)

> 🚦 **Bài Test Số 3:**
> Màn hình Parameter Store phải hiển thị đủ 3 dòng trên, type là SecureString. Không ai làm sai bước này được cả!

### Bước 4: Tuyển Lễ tân (ALB) và Bảo vệ (Security Groups)
**Mục đích:** Tạo một địa chỉ Web cố định mở cửa 24/7 đón user, và tạo hàng rào ngăn tà khí.

**Hướng dẫn:**
1. Mở **EC2 Console** -> **Security Groups**. Tạo 2 cái:
   - `baucua-alb-sg`: Type HTTP, Port 80, Source `0.0.0.0/0`. (Bảo vệ cổng chính, cho mọi người vào).
   - `baucua-ecs-sg`: Type Custom TCP, Port 5000, Source là cái `baucua-alb-sg` ở trên. (Bảo vệ phòng sếp, chỉ Lễ tân mới được vào).
2. Xống menu **Load Balancers** -> **Create Load Balancer** -> **Application Load Balancer**.
   - Name: `baucua-backend-alb`
   - Mapping: Tích 2 Availability Zones (subnets) bất kỳ.
   - Security Group: Trỏ vào `baucua-alb-sg`.
3. Phía dưới chỗ Listeners port 80 -> Bấm **Create target group** (Nó mở Tab mới).
   - Choose target type: **IP addresses**.
   - Name: `baucua-backend-tg`, Port 5000.
   - Health check path: `/api/health`.
   - Bấm Create (Bạn sẽ thấy Tab Targets báo "No targets" - đó là bình thường).
4. Quay lại màn hình tạo ALB (Tab cũ), refresh danh sách và chọn `baucua-backend-tg`. Bấm **Create load balancer**.

> 🚦 **Bài Test Số 4 (CỰC QUAN TRỌNG):**
> Nhấp vào `baucua-backend-alb`, mục Details tìm chữ **DNS name** (VD: `baucua-backend-alb-xxx.elb.amazonaws.com`).
> Bật tab trình duyệt mới, gõ vào `<DNS_NAME_CỦA_BẠN>/api/health`.
> **Kết quả:** Trình duyệt xoay xoay rồi báo lỗi `503 Service Temporarily Unavailable` hoặc `502 Bad Gateway`.
> **Chúc mừng bạn:** Hệ thống Lễ tân (ALB) đã chạy! Nhưng nó báo 503/502 vì phía sau phòng chưa có anh Dev (Container) nào nhận việc cả. Chúng ta sẽ tuyển Dev ở bước sau.

---

## GIAI ĐOẠN 3: NHÀ MÁY VẬN HÀNH (TRIỂN KHAI THỦ CÔNG)
*Đáng lẽ đến bước này ta đưa ngay cho Robot Github chạy. Nhưng để hiểu rõ bản chất, ta tự tay khởi động container 1 lần bằng AWS.*

### Bước 5: Xây nhà xưởng (Cluster) và Lắp Camera (CloudWatch Logs)
**Hướng dẫn:**
1. AWS Console -> **CloudWatch** -> **Log groups** -> **Create log group** với tên `/ecs/baucua`. (Lắp camera).
2. AWS Console -> **ECS** -> **Clusters** -> **Create cluster** tên `baucua-cluster`, chọn Fargate. (Xây nhà xưởng).

### Bước 6: Vẽ bản thiết kế (Task Definition)
**Hướng dẫn:**
1. Tại AWS Console -> **IAM** -> **Roles**. Tạo 1 Role chọn usecase "Elastic Container Task".
   - Tích 2 policy: `AmazonECSTaskExecutionRolePolicy` và `AmazonSSMReadOnlyAccess`.
   - Đặt tên: `ecsTaskExecutionRole`.
2. Chuyển sang console **ECS** -> **Task definitions** -> **Create new task definition** (Tạo bằng JSON luôn cho lẹ).
3. Copy đoạn JSON trong thư mục code của bạn (file `ecs-task-definition.json`), chú ý chỉnh lại 3 chỗ quan trọng:
   - Thay `312157985071` thành mã số Account ID AWS của bạn thật sự.
   - Tại dòng `image`: Để nguyên chuỗi ECR repository URL của bạn, thêm đuôi `:latest`.
   - Paste vào, bấm **Create**.

> 🚦 **Bài Test Số 6:**
> Xem giao diện Task Definition. Nếu nó hiện trạng thái ACTIVE, có 1 container tên `backend` đòi port 5000 là xong.

### Bước 7: Thuê công nhân (ECS Service) - Phép màu xuất hiện
**Mục đích:** Đẩy container vào đằng sau lưng anh Lễ tân.

**Hướng dẫn:**
1. Vào **ECS** -> Cluster `baucua-cluster` -> tab **Services** -> Bấm **Create**.
2. **Compute**: Launch type = Fargate.
3. **Deployment**:
   - Task definition: `baucua-task` (Revision mới nhất).
   - Service name: `baucua-backend-service`.
   - Desired tasks: `1`.
4. **Networking**:
   - Mở Security group -> Gỡ cái mặc định, thêm `baucua-ecs-sg` vào.
   - TẮT MỤC "Assign public IP" NẾU subnets bạn chọn là Private. Nếu không rành VPC, cứ để mặc định "Turned on".
5. **Load balancing**:
   - Chọn Application Load Balancer.
   - Chọn Lễ tân `baucua-backend-alb` đã tạo ở bước 4.
   - Chỗ Container `backend:5000`, chọn *Use an existing target group* là `baucua-backend-tg`.
6. Bấm **Create**.

> 🚦 **Bài Test Số 7 (Khoảnh Khắc Của Sự Thật):**
> 1. Chờ bóp chuột ngồi nhìn tab Tasks. Từ trạng thái *PROVISIONING* -> *PENDING* -> *RUNNING*.
> 2. Mở trình duyệt, quay lại cái đường link Lễ Tân đang treo báo lỗi ở Bài Test 4 (VD: `http://<DNS_NAME_CỦA_BẠN>/api/health`).
> 3. Bấm F5 thần thánh. KHÔNG CÒN LỖI NỮA! Nó sẽ hiện: `{"message":"🎲 Bầu Cua API is running!"}`. 
> 4. Tuyệt vời! Bạn vừa tự tay dựng hệ thống triệu đô.

---

## GIAI ĐOẠN 4: TỰ ĐỘNG HÓA 100% (GITHUB ACTIONS)
*Bây giờ hệ thống đang chạy. Việc của Github là dọn dẹp và duy trì tự động mỗi khi bạn sửa code.*

### Bước 8: Giao chìa khóa cho Robot (GitHub Secrets)
**Mục đích:** Để GitHub biết cách vào quản lý AWS của bạn.

**Hướng dẫn:**
1. Vào trang GitHub của dự án Bầu Cua.
2. **Settings** -> **Secrets and variables** -> **Actions** -> **New repository secret**.
3. Điền vào 4 pass:
   - `AWS_ACCESS_KEY_ID`: Chìa khóa tạo ở Bước 2.
   - `AWS_SECRET_ACCESS_KEY`: Chìa bí mật ở Bước 2.
   - `AWS_ACCOUNT_ID`: Mã số tài khoản AWS của bạn (VD: `312157985071`).
   - `AWS_REGION`: `ap-southeast-1`.

### Bước 9: Bài thi tốt nghiệp toàn phần
**Mục đích:** Nằm im và xem Robot diễn xiếc.

**Thực hành:**
1. Trở về máy tính Local (VS Code). Mở file `backend/src/index.js`, tìm dòng:
   `res.json({ message: '🎲 Bầu Cua API is running!' });`
   Đổi thành:
   `res.json({ message: '🎲 Bầu Cua API ĐANG CHẠY BỞI GITHUB ACTIONS V2!' });`
2. Lưu file lại.
3. Chạy 3 lệnh định mệnh:
   ```bash
   git add .
   git commit -m "Auto deploy V2 test"
   git push origin main
   ```

> 🚦 **Bài Test Cuối Cùng (The Final Test):**
> 1. Trở lại trang Github, bấm vào tab **Actions**, bạn sẽ thấy 1 vòng quay báo hiệu Job `🚀 Deploy Bầu Cua to AWS` đang rục rịch chạy.
> 2. Click vào để xem nó đang chạy command Docker Build, rồi trượt sang Push lên ECR, rồi báo tin cho ECS cập nhật (Bước 3,4,5,6 của chúng ta ban nãy).
> 3. Trong lúc đó, bạn ra trình duyệt F5 link Lễ tân, MỌI THỨ VẪN ĐANG RUNNING bình thường, không ai bị văng ra (Zero-downtime Deploy).
> 4. Khi Job trên Github tick xanh lá (Success) ~ sau khoảng 5 phút. Bạn ra gõ lại đường Link `<DNS_NAME_CỦA_BẠN>/api/health`.
>
> 🏆 **KẾT QUẢ:** Dòng chữ trên trình duyệt biến thành: `{"message":"🎲 Bầu Cua API ĐANG CHẠY BỞI GITHUB ACTIONS V2!"}`.
>
> **Tốt nghiệp rồi! Bạn đã hoàn toàn làm chủ AWS ECS Deploy cho Backend.** Mọi cập nhật code từ giờ chỉ là một cú `git push`. Không chạm tay vào Console nữa.
