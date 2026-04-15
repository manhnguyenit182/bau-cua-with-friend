# 🐳 Hướng Dẫn Deploy Backend lên AWS ECS Fargate

> **Mục tiêu của tài liệu này:** Hướng dẫn từng bước chi tiết để triển khai backend Node.js của dự án **Bầu Cua Online** lên AWS theo kiến trúc container hiện đại, tự động hóa hoàn toàn thông qua CI/CD với GitHub Actions.

---

## 📋 Mục Lục

1. [Tổng Quan Workflow & Kiến Trúc](#1-tổng-quan-workflow--kiến-trúc)
2. [Điều Kiện Tiên Quyết](#2-điều-kiện-tiên-quyết)
3. [Bước 0: Chuẩn Bị — Tạo Tài Nguyên AWS](#3-bước-0-chuẩn-bị--tạo-tài-nguyên-aws)
4. [Bước 1: Phát Triển & Đẩy Code (GitHub)](#4-bước-1-phát-triển--đẩy-code-github)
5. [Bước 2: GitHub Actions Tự Động Đóng Gói](#5-bước-2-github-actions-tự-động-đóng-gói)
6. [Bước 3: Cập Nhật Task Definition](#6-bước-3-cập-nhật-task-definition)
7. [Bước 4 & 5: ECS + Fargate Triển Khai Container](#7-bước-4--5-ecs--fargate-triển-khai-container)
8. [Bước 6: ALB Định Tuyến Traffic](#8-bước-6-alb-định-tuyến-traffic)
9. [Kiểm Tra & Xác Minh](#9-kiểm-tra--xác-minh)
10. [Xử Lý Sự Cố Thường Gặp](#10-xử-lý-sự-cố-thường-gặp)

---

## 1. Tổng Quan Workflow & Kiến Trúc

Trước khi bắt tay làm, hãy hiểu bức tranh tổng thể. Đây là những gì sẽ xảy ra mỗi khi bạn push code:

```
┌─────────────────────────────────────────────────────────────────────┐
│                          LUỒNG CI/CD BACKEND                        │
│                                                                     │
│  👨‍💻 Developer                                                       │
│       │ git push origin main                                        │
│       ▼                                                             │
│  ┌─────────────┐                                                    │
│  │   GitHub    │──── Trigger ────►  GitHub Actions (CI/CD Robot)   │
│  │  Repository │                           │                        │
│  └─────────────┘               ┌───────────┴───────────┐           │
│                                ▼                        ▼           │
│                         [BƯỚC 2]                  [BƯỚC 3]         │
│                      Build Docker Image    Update Task Definition   │
│                            │                          │             │
│                            ▼                          │             │
│                   ┌─────────────────┐                 │             │
│                   │   AWS ECR       │                 │             │
│                   │  (Image Store)  │◄────────────────┘             │
│                   └─────────────────┘                               │
│                                                                     │
│  ─────────────────────── AWS CLOUD ───────────────────────────────  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    [BƯỚC 4: ECS Orchestrator]                 │  │
│  │                                                              │  │
│  │  "Có phiên bản mới! Pull image từ ECR và tạo container mới" │  │
│  │                         │                                    │  │
│  │                         ▼                                    │  │
│  │              [BƯỚC 5: Fargate Runtime]                       │  │
│  │         ┌──────────────────────────────┐                     │  │
│  │         │  Container Node.js Backend   │                     │  │
│  │         │  ├── Port 5000               │                     │  │
│  │         │  ├── DATABASE_URL (SSM)      │                     │  │
│  │         │  ├── MONGODB_URI (SSM)       │                     │  │
│  │         │  └── JWT_SECRET (SSM)        │                     │  │
│  │         └──────────────────────────────┘                     │  │
│  │                         │ Healthy ✅                          │  │
│  │                         ▼                                    │  │
│  │              [BƯỚC 6: ALB Traffic Routing]                   │  │
│  │         ┌──────────────────────────────┐                     │  │
│  │         │  Application Load Balancer   │                     │  │
│  │         │  ├── /api/*  → Container     │                     │  │
│  │         │  └── /socket.io/* → Container│                     │  │
│  │         └──────────────────────────────┘                     │  │
│  │                         │                                    │  │
│  └─────────────────────────┼────────────────────────────────────┘  │
│                            ▼                                        │
│                    🌐 Internet (User)                                │
└─────────────────────────────────────────────────────────────────────┘
```

### 🔑 Các thành phần chính:

| Thành phần                          | Vai trò                             | Tương tự          |
| ----------------------------------- | ----------------------------------- | ----------------- |
| **GitHub Actions**                  | Robot tự động hóa CI/CD             | Công nhân nhà máy |
| **Amazon ECR**                      | Kho lưu trữ Docker Image            | Kho hàng          |
| **ECS (Elastic Container Service)** | Nhạc trưởng điều phối container     | Quản lý           |
| **AWS Fargate**                     | Môi trường thực thi (Serverless VM) | Nhà máy tự động   |
| **ALB (Application Load Balancer)** | Phân phối request                   | Lễ tân            |
| **SSM Parameter Store**             | Lưu trữ biến bí mật an toàn         | Két sắt           |

---

## 2. Điều Kiện Tiên Quyết

Trước khi bắt đầu, đảm bảo bạn đã có:

- ✅ **Tài khoản AWS** với đủ quyền (IAM: S3, ECR, ECS, ALB, SSM)
- ✅ **Repository GitHub** chứa code dự án
- ✅ **Prisma Cloud** — `DATABASE_URL` đã có và hoạt động
- ✅ **MongoDB Atlas** — Cluster Free Tier đã tạo và có `MONGODB_URI`
- ✅ **Docker Desktop** — Đang chạy trên máy local (để test image trước nếu cần)

> [!IMPORTANT]
> **Tại sao cần MongoDB Atlas thay vì container?**
> Trên ECS Fargate, mỗi container là **ephemeral** (tạm thời). Khi container bị restart hay scale, mọi dữ liệu bên trong biến mất. Vì vậy, database PHẢI đặt ở cloud riêng biệt.

---

## 3. Bước 0: Chuẩn Bị — Tạo Tài Nguyên AWS

> 💡 **Giải thích:** Trước khi workflow chạy tự động, bạn phải tạo "sân chơi" cho chúng. Đây là bước làm **một lần duy nhất** — sau đó CI/CD sẽ tự động phần còn lại mỗi khi bạn push code.

### Bước 0.1 — Tạo IAM User cho GitHub Actions

**Lý do:** GitHub Actions cần một "tài khoản" có quyền tương tác với AWS (push lên ECR, cập nhật ECS). IAM User với Access Key chính là "tài khoản" đó.

1. Đăng nhập **AWS Console** → Dịch vụ **IAM** → **Users** → **Create user**.
2. Tên user: `github-actions-deployer`, nhấn **Next**.
3. Chọn **Attach policies directly**, tìm và tích các policy:
   - `AmazonEC2ContainerRegistryPowerUser` — Quyền push/pull Image lên ECR.
   - `AmazonECS_FullAccess` — Quyền cập nhật và deploy ECS Service.
   - `AmazonSSMReadOnlyAccess` — Quyền đọc secrets từ Parameter Store.
4. **Create user** → Bấm vào tên user → Tab **Security credentials**.
5. **Create access key** → Chọn **CLI** → **Create**.
6. 📋 **Lưu lại ngay:** `Access Key ID` và `Secret Access Key`. AWS sẽ không cho xem lại.

---

### Bước 0.2 — Tạo ECR Repository

**Lý do:** ECR là nơi lưu trữ Docker Image sau khi build. Tương tự như Docker Hub nhưng nằm trong hệ sinh thái AWS, bảo mật và tích hợp tốt với ECS hơn.

1. AWS Console → **Elastic Container Registry (ECR)** → **Create repository**.
2. Chọn **Private**.
3. **Repository name**: `baucua/backend`.
4. Bấm **Create repository**.
5. 📋 **Lưu lại URI**: `312157985071.dkr.ecr.ap-southeast-1.amazonaws.com/baucua/backend`

---

### Bước 0.3 — Lưu Secrets vào AWS Parameter Store

**Lý do:** Không bao giờ đặt mật khẩu, API key trong code (env file) rồi commit lên GitHub. Parameter Store là "két sắt" — chỉ ECS container mới được đọc, và mọi thứ được mã hóa tự động.

1. AWS Console → **Systems Manager** → **Parameter Store** → **Create parameter**.
2. Tạo 3 tham số sau (lặp lại quy trình cho mỗi cái):

   **Tham số 1:**
   - Name: `/baucua/DATABASE_URL`
   - Type: `SecureString`
   - Value: URL Prisma Cloud của bạn (dạng `prisma://...`)

   **Tham số 2:**
   - Name: `/baucua/MONGODB_URI`
   - Type: `SecureString`
   - Value: URI MongoDB Atlas (dạng `mongodb+srv://...`)

   **Tham số 3:**
   - Name: `/baucua/JWT_SECRET`
   - Type: `SecureString`
   - Value: Chuỗi bí mật bạn tự đặt (ví dụ: `super-secret-key-baucua-2026`)

> [!TIP]
> Chọn `SecureString` để AWS tự động mã hóa giá trị bằng KMS. Nếu ai đó xâm nhập vào AWS Console của bạn, họ cũng không thấy được giá trị thật.

---

### Bước 0.4 — Tạo IAM Role cho ECS Task

**Lý do:** Khi container đang chạy trên Fargate, nó cần có "giấy phép" để đọc secrets từ Parameter Store và ghi log vào CloudWatch. IAM Role chính là "giấy phép" đó.

1. AWS Console → **IAM** → **Roles** → **Create role**.
2. **Trusted entity**: AWS service → Use case: **Elastic Container Service Task**.
3. Tìm và tích 2 policy:
   - `AmazonECSTaskExecutionRolePolicy` — Quyền pull image và ghi log.
   - `AmazonSSMReadOnlyAccess` — Quyền đọc secrets từ Parameter Store.
4. **Role name**: `ecsTaskExecutionRole` → **Create role**.

---

### Bước 0.5 — Tạo CloudWatch Log Group

**Lý do:** Log của container chạy trên Fargate không thể xem trực tiếp như `pm2 logs`. CloudWatch Log Group là nơi container sẽ gửi log đến — bạn sẽ troubleshoot ở đây.

1. AWS Console → **CloudWatch** → **Log groups** → **Create log group**.
2. **Log group name**: `/ecs/baucua`.
3. **Create**.

---

### Bước 0.6 — Tạo ECS Cluster

**Lý do:** Cluster là "văn phòng" tập trung mà ECS dùng để quản lý tất cả các Service và Task của bạn. Một cluster có thể chứa nhiều Service khác nhau.

1. AWS Console → **ECS** → **Clusters** → **Create cluster**.
2. **Cluster name**: `baucua-cluster`.
3. **Infrastructure**: Đảm bảo **AWS Fargate (serverless)** được chọn.
4. **Create**.

---

### Bước 0.7 — Tạo Security Groups

**Lý do:** Security Group hoạt động như "tường lửa" của AWS. Bạn cần 2 cái:

- Một cái cho **ALB**: Mở cổng 80 ra internet (mọi người đều truy cập được).
- Một cái cho **ECS**: Chỉ cho ALB truy cập vào cổng 5000 của container (internet không truy cập trực tiếp được container).

**Tạo Security Group cho ALB:**

1. EC2 → **Security Groups** → **Create security group**.
   - Name: `baucua-alb-sg`
   - Description: `ALB for Bau Cua Backend`
   - Inbound rules: HTTP, Port 80, Source: `0.0.0.0/0` (Anywhere).
   - **Create**.

**Tạo Security Group cho ECS Tasks:**

1. **Create security group** lần nữa.
   - Name: `baucua-ecs-sg`
   - Description: `ECS Tasks for Bau Cua`
   - Inbound rules: Custom TCP, Port `5000`, Source: Chọn **Custom** → tìm và chọn `baucua-alb-sg`.
   - **Create**.

> [!IMPORTANT]
> Cách cấu hình này rất quan trọng về bảo mật. Container chạy backend sẽ **không bao giờ** bị truy cập trực tiếp từ internet. Mọi request đều phải đi qua ALB trước.

---

### Bước 0.8 — Tạo Application Load Balancer (ALB)

**Lý do:** ALB chính là "địa chỉ" công khai để internet kết nối vào backend của bạn. Nó nhận request từ user/CloudFront, rồi chuyển tiếp vào container đang chạy. Nếu container có nhiều, nó cũng tự phân tải.

1. EC2 → **Load Balancers** → **Create Load Balancer** → **Application Load Balancer**.
2. Cấu hình:
   - **Name**: `baucua-backend-alb`
   - **Scheme**: Internet-facing
   - **Mappings**: Chọn VPC mặc định, tích ít nhất **2 Availability Zones**.
   - **Security groups**: Bỏ `default`, chọn `baucua-alb-sg`.
3. **Listeners & routing**: Port 80 → Click **Create target group** (Tab mới mở ra).

**Tạo Target Group (tab mới):**

- Target type: **IP addresses** (Bắt buộc khi dùng Fargate).
- Name: `baucua-backend-tg`
- Port: `5000` (Cổng mà container đang lắng nghe)
- Health check path: `/api/health`
- Click **Next** → **Create target group** → Đóng tab.

4. Quay lại tab ALB, bấm **Refresh** → chọn `baucua-backend-tg`.
5. **Create load balancer**.
6. 📋 **Lưu lại DNS name** của ALB (dạng `baucua-backend-alb-xxx.elb.amazonaws.com`).

---

### Bước 0.9 — Đăng Ký Task Definition

**Lý do:** Task Definition là "bản vẽ thiết kế" của container. Nó định nghĩa: Dùng Image nào? Bao nhiêu CPU/RAM? Biến môi trường nào? Ghi log ở đâu? — ECS sẽ đọc bản vẽ này để biết cách tạo container.

File `ecs-task-definition.json` trong repo của bạn đã được cấu hình sẵn:

```json
{
  "family": "baucua-task",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::312157985071:role/ecsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "backend",
      "image": "312157985071.dkr.ecr.ap-southeast-1.amazonaws.com/baucua/backend:latest",
      "portMappings": [{ "containerPort": 5000, "protocol": "tcp" }],
      "environment": [
        { "name": "PORT", "value": "5000" },
        { "name": "NODE_ENV", "value": "production" }
      ],
      "secrets": [
        {
          "name": "DATABASE_URL",
          "valueFrom": "arn:aws:ssm:ap-southeast-1:312157985071:parameter/baucua/DATABASE_URL"
        },
        { "name": "MONGODB_URI", "valueFrom": "arn:aws:ssm:ap-southeast-1:312157985071:parameter/baucua/MONGODB_URI" },
        { "name": "JWT_SECRET", "valueFrom": "arn:aws:ssm:ap-southeast-1:312157985071:parameter/baucua/JWT_SECRET" }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/baucua",
          "awslogs-region": "ap-southeast-1",
          "awslogs-stream-prefix": "backend"
        }
      },
      "essential": true
    }
  ]
}
```

**Giải thích các trường quan trọng:**

- `"cpu": "512"` — 0.5 vCPU (512/1024 = 0.5). Đủ cho traffic vừa.
- `"memory": "1024"` — 1 GB RAM.
- `"secrets"` — ECS sẽ tự đọc từ Parameter Store và inject vào container dưới dạng biến môi trường. Container không cần biết secret được lưu ở đâu.
- `"logDriver": "awslogs"` — Mọi `console.log()` trong Node.js sẽ được gửi đến CloudWatch.

**Đăng ký Task Definition:**

1. AWS Console → **ECS** → **Task definitions** → **Create new task definition**.
2. Chọn tab **JSON** → xóa nội dung cũ → paste nội dung file `ecs-task-definition.json` vào.
3. **Create**.

---

### Bước 0.10 — Tạo ECS Service

**Lý do:** Service là "bảo vệ" của ECS. Nó đảm bảo số lượng container bạn yêu cầu (ví dụ: 1 container) **luôn luôn chạy**. Nếu container bị crash, Service tự khởi động lại. Service còn kết nối container với ALB.

1. ECS Console → Cluster `baucua-cluster` → Tab **Services** → **Create**.
2. Cấu hình:
   - **Launch type**: FARGATE
   - **Task definition**: `baucua-task` (phiên bản mới nhất)
   - **Service name**: `baucua-backend-service`
   - **Desired tasks**: `1`
3. **Networking**:
   - Chọn ít nhất 2 subnets công khai.
   - Security group: Bỏ `default`, chọn `baucua-ecs-sg`.
   - Assign public IP: **Turned On** (Để Fargate có thể pull image từ ECR qua internet).
4. **Load balancing**:
   - Load balancer type: **Application Load Balancer**
   - Load balancer: `baucua-backend-alb`
   - Container `backend:5000`: Chọn **Use an existing target group** → `baucua-backend-tg`.
5. **Create**.

> Sau bước này, chờ khoảng 3-5 phút để ECS khởi động container đầu tiên và ALB health check thông qua.

---

### Bước 0.11 — Cấu Hình GitHub Secrets

**Lý do:** GitHub Actions cần biết Access Key và các thông tin AWS để có thể tương tác. Việc lưu chúng vào GitHub Secrets đảm bảo chúng không bao giờ xuất hiện trong code hay log.

Vào **GitHub Repo** → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Secret Name             | Giá trị                | Lý do cần        |
| ----------------------- | ---------------------- | ---------------- |
| `AWS_ACCESS_KEY_ID`     | Key từ Bước 0.1        | Xác thực với AWS |
| `AWS_SECRET_ACCESS_KEY` | Secret Key từ Bước 0.1 | Xác thực với AWS |
| `AWS_ACCOUNT_ID`        | `312157985071`         | Tạo ECR URI      |
| `AWS_REGION`            | `ap-southeast-1`       | Chỉ định region  |

---

## 4. Bước 1: Phát Triển & Đẩy Code (GitHub)

Đây là bước bạn đã biết rất rõ. Khi code backend đã sẵn sàng:

```bash
git add .
git commit -m "feat: cải tiến logic game"
git push origin main
```

**Điều gì xảy ra ngay sau khi push?**

GitHub nhận được sự kiện `push` trên nhánh `main`. Trong file `.github/workflows/deploy.yml` có cấu hình:

```yaml
on:
  push:
    branches: [main]
```

Dòng này nói với GitHub: _"Mỗi khi có code mới trên nhánh main, hãy kích hoạt pipeline CI/CD."_. GitHub Actions sẽ tức khắc xếp hàng chờ để khởi động một máy ảo Ubuntu tạm thời.

> [!NOTE]
> Nhánh `main` thường là nhánh **production**. Một luồng làm việc tốt là: develop trên nhánh feature → merge vào `main` → pipeline tự deploy. Tuyệt đối không push code chưa test thẳng lên `main`.

---

## 5. Bước 2: GitHub Actions Tự Động Đóng Gói

**Phần 2 của pipeline `.github/workflows/deploy.yml`:**

```yaml
deploy-backend:
  name: ⚙️ Deploy Backend (ECS Fargate)
  runs-on: ubuntu-latest

  steps:
    # 🔹 BƯỚC 2a: Lấy code về máy ảo
    - name: 📥 Checkout code
      uses: actions/checkout@v4

    # 🔹 BƯỚC 2b: Cấp quyền AWS cho GitHub Actions
    - name: 🔑 Configure AWS Credentials
      uses: aws-actions/configure-aws-credentials@v4
      with:
        aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
        aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        aws-region: ${{ secrets.AWS_REGION }}

    # 🔹 BƯỚC 2c: Đăng nhập vào ECR
    - name: 🔐 Login to Amazon ECR
      id: login-ecr
      uses: aws-actions/amazon-ecr-login@v2

    # 🔹 BƯỚC 2d: Build Image và Push lên ECR
    - name: 🏗️ Build & Push Backend Image
      id: build-backend
      run: |
        IMAGE_TAG=${{ github.sha }}
        BACKEND_IMAGE=${{ env.ECR_REGISTRY }}/baucua/backend

        docker build -t $BACKEND_IMAGE:$IMAGE_TAG -t $BACKEND_IMAGE:latest ./backend
        docker push $BACKEND_IMAGE:$IMAGE_TAG
        docker push $BACKEND_IMAGE:latest

        echo "image=$BACKEND_IMAGE:$IMAGE_TAG" >> $GITHUB_OUTPUT
```

**Giải thích chi tiết từng bước:**

### 2a — Checkout Code

GitHub Actions copy toàn bộ repo về máy ảo Ubuntu. Giống như bạn `git clone` về máy local.

### 2b — Cấp quyền AWS

Sử dụng Access Key đã lưu ở GitHub Secrets để máy ảo Ubuntu "giả vờ" là IAM User `github-actions-deployer`. Sau bước này, máy ảo này có quyền tương tác với AWS.

### 2c — Đăng nhập ECR

Lệnh này thực chất là tự động chạy `docker login` với credential tạm thời từ AWS. Chỉ sau bước này, `docker push` mới được phép.

### 2d — Build & Push Image

**Đây là bước quan trọng nhất.** Docker đọc file `backend/Dockerfile`:

```dockerfile
FROM node:20-alpine          # Lấy môi trường Node.js 20 trên Alpine Linux

RUN apk add --no-cache openssl  # Cài openssl (Prisma cần)

WORKDIR /app                 # Tất cả lệnh sau chạy trong /app

COPY package*.json ./        # Copy package.json trước (tận dụng Docker cache)
RUN npm install              # Cài dependencies

COPY . .                     # Copy toàn bộ code vào
RUN npx prisma generate      # Tạo Prisma Client từ schema

EXPOSE 5000                  # Khai báo container mở cổng 5000
CMD ["npm", "start"]         # Lệnh chạy khi container khởi động
```

**Tại sao lại `COPY package*.json ./` trước, rồi mới `COPY . .`?**
Docker cache theo từng layer. Nếu `package.json` không thay đổi, Docker bỏ qua bước `npm install` và dùng layer đã cache từ lần build trước → **Build nhanh hơn nhiều**.

**Tag Image bằng `github.sha`:**

```bash
IMAGE_TAG=${{ github.sha }}  # Ví dụ: a1b2c3d4e5f6...
```

Mỗi commit có hash SHA duy nhất, nên mỗi Image cũng có tag duy nhất. Điều này cho phép bạn rollback (trở về phiên bản cũ) bất cứ lúc nào bằng cách chỉ định đúng tag.

---

## 6. Bước 3: Cập Nhật Task Definition

```yaml
# 🔹 BƯỚC 3: Inject Image mới vào Task Definition
- name: 📝 Update Task Definition with new image
  id: task-def
  uses: aws-actions/amazon-ecs-render-task-definition@v1
  with:
    task-definition: ecs-task-definition.json
    container-name: backend
    image: ${{ steps.build-backend.outputs.image }}
```

**Giải thích:**

Action `amazon-ecs-render-task-definition` đọc file `ecs-task-definition.json`, tự động thay trường `"image"` bằng URI của Image vừa build (bao gồm tag SHA mới nhất), và tạo ra một file Task Definition tạm thời để dùng ở bước tiếp theo.

**Kết quả:** File Task Definition mới có `"image": "...baucua/backend:a1b2c3d4e5f6..."` thay vì `:latest`.

> [!NOTE]
> Tại sao không dùng `:latest`? Vì nếu deploy thất bại, bạn cần rollback về đúng phiên bản cụ thể. Tag `:a1b2c3d..` cố định, còn `:latest` thì luôn thay đổi và không rollback được.

---

## 7. Bước 4 & 5: ECS + Fargate Triển Khai Container

```yaml
# 🔹 BƯỚC 4+5: Deploy Task Definition mới lên ECS Service
- name: 🚀 Deploy to ECS
  uses: aws-actions/amazon-ecs-deploy-task-definition@v2
  with:
    task-definition: ${{ steps.task-def.outputs.task-definition }}
    service: baucua-backend-service
    cluster: baucua-cluster
    wait-for-service-stability: true
```

**Đây là bước có nhiều thứ xảy ra nhất phía AWS:**

### Phía ECS (Nhạc trưởng):

1. ECS nhận Task Definition mới từ GitHub Actions.
2. ECS **đăng ký** đây là phiên bản mới của `baucua-task` (ví dụ: revision 3).
3. ECS ra lệnh cho `baucua-backend-service` chuyển sang dùng revision 3.
4. ECS quyết định chiến lược rolling update: Khởi động container mới trước, tắt container cũ sau (Zero Downtime).

### Phía Fargate (Lớp thực thi):

1. Fargate nhận lệnh từ ECS, tự tính toán cần cấp bao nhiêu tài nguyên (0.5 vCPU + 1 GB RAM theo Task Definition).
2. Fargate **pull image** `baucua/backend:a1b2c3d...` từ ECR về.
3. Fargate **khởi động container** Node.js.
4. Trong quá trình khởi động, container đọc secrets từ Parameter Store và inject vào biến môi trường.
5. Node.js khởi động, kết nối Prisma Cloud và MongoDB Atlas.

**`wait-for-service-stability: true`:**
GitHub Actions đứng chờ (4-10 phút) cho đến khi ECS xác nhận container mới healthy và container cũ đã tắt hẳn. Nếu container mới lỗi, toàn bộ pipeline báo thất bại ngay.

> [!TIP]
> Theo dõi quá trình deploy realtime tại: **ECS Console** → `baucua-cluster` → `baucua-backend-service` → Tab **Deployments**. Bạn sẽ thấy "in progress" rồi chuyển thành "completed".

---

## 8. Bước 6: ALB Định Tuyến Traffic

**Bước này không cần action trong workflow** — ALB tự động làm, được ECS Service điều khiển.

**Quy trình Rolling Deployment (Zero Downtime):**

```
Trạng thái ban đầu:        Trong quá trình deploy:    Sau khi deploy:

ALB ──► Container v1 ✅    ALB ──► Container v1 ✅     ALB ──► Container v2 ✅
                               └──► Container v2 🔄            Container v1 ❌ (đã tắt)
```

**Chi tiết từng giai đoạn:**

1. **Container v2 khởi động** — ALB bắt đầu gọi `/api/health` mỗi 30 giây.
2. **Health Check Pass** — Sau 2-3 lần gọi thành công, Container v2 được đánh dấu `Healthy`.
3. **Traffic chuyển dần** — ALB dần dần chuyển traffic từ v1 sang v2.
4. **Drain connections** — ALB cho các kết nối cũ đến v1 hoàn thành, không ngắt đột ngột.
5. **Container v1 tắt** — ECS ra lệnh dừng Container v1.

> [!WARNING]
> **Vấn đề với Socket.io khi rolling update:** Có thể xảy ra kết nối mất trong vài giây khi chuyển. Socket.io tự động reconnect nên user hầu như không cảm nhận được. Tuy nhiên nếu backend có nhiều hơn 1 instance, bạn cần cân nhắc **Sticky Sessions** trên ALB để đảm bảo cùng user luôn vào cùng container.

---

## 9. Kiểm Tra & Xác Minh

### 9.1 — Kiểm tra Pipeline GitHub Actions

1. Vào GitHub Repo → Tab **Actions**.
2. Tìm workflow run mới nhất, xem từng step đã pass hay chưa.
3. Nếu có lỗi, click vào step đó để xem chi tiết log.

### 9.2 — Kiểm tra ECS Service

1. AWS Console → **ECS** → `baucua-cluster` → `baucua-backend-service`.
2. Tab **Deployments**: Trạng thái `PRIMARY` với `Running count: 1`.
3. Tab **Tasks**: Task đang chạy có status `RUNNING`.

### 9.3 — Test API trực tiếp

Truy cập endpoint Health Check qua DNS của ALB:

```
http://baucua-backend-alb-xxx.ap-southeast-1.elb.amazonaws.com/api/health
```

Kết quả mong đợi:

```json
{ "message": "🎲 Bầu Cua API is running!" }
```

### 9.4 — Xem Logs Container

1. **CloudWatch** → **Log groups** → `/ecs/baucua`.
2. Mở Log Stream mới nhất (tên bắt đầu bằng `backend/backend/...`).
3. Bạn sẽ thấy log khởi động như: `🚀 Server đang chạy tại http://localhost:5000`.

---

## 10. Xử Lý Sự Cố Thường Gặp

### ❌ GitHub Actions lỗi "denied: Your authorization token has expired"

- **Nguyên nhân**: Access Key không có quyền push ECR.
- **Fix**: Kiểm tra IAM User có policy `AmazonEC2ContainerRegistryPowerUser` không.

### ❌ Container khởi động rồi crash ngay (Task status: STOPPED)

- **Nguyên nhân phổ biến nhất**: Biến môi trường bị sai (sai tên Parameter Store hoặc sai ARN).
- **Fix**:
  1. CloudWatch → `/ecs/baucua` → Tìm stream mới nhất → Xem error log.
  2. Kiểm tra tên 3 parameter trong SSM Parameter Store có đúng là `/baucua/DATABASE_URL`, `/baucua/MONGODB_URI`, `/baucua/JWT_SECRET` không.
  3. Kiểm tra ARN trong `ecs-task-definition.json` có đúng Account ID không.

### ❌ ALB Health Check FAIL — Target group Unhealthy

- **Nguyên nhân**: Container khởi động xong nhưng endpoint `/api/health` không trả về HTTP 200.
- **Fix**:
  1. Đảm bảo backend có route `GET /api/health` trả về status 200.
  2. Đảm bảo Security Group `baucua-ecs-sg` cho phép traffic từ `baucua-alb-sg` vào port 5000.

### ❌ Lỗi kết nối MongoDB: "Could not connect to any servers in your MongoDB Atlas cluster"

- **Nguyên nhân**: MongoDB Atlas mặc định chặn tất cả các IP lạ để bảo vệ dữ liệu. Trên cấu hình ECS Fargate hiện tại của chúng ta, mỗi khi tạo container mới nó sẽ được cấp một IP public ngẫu nhiên (chứ không cố định), vì vậy Atlas chặn nó lại.
- **Fix**: Bạn cần cho phép mọi IP được truy cập vào CSDL Atlas của bạn.
  1. Đăng nhập vào trang quản trị **MongoDB Atlas** (https://cloud.mongodb.com).
  2. Ở menu bên trái, chọn **Network Access** (dưới mục Security).
  3. Bấm nút **+ ADD IP ADDRESS** màu xanh góc phải.
  4. Bấm vào chữ **ALLOW ACCESS FROM ANYWHERE** (nó sẽ tự điền `0.0.0.0/0`).
  5. Bấm **Confirm** và chờ khoảng 1-2 phút để trạng thái chuyển thành Active.
  *Lưu ý: Sau khi mở khóa cho IP, hãy khởi động lại ECS Task bằng cách tắt Task đang chạy hoặc đợi vài phút để ECS tự động thử lại.*

### ❌ ECS Task không pull được Image từ ECR

- **Nguyên nhân**: IAM Role `ecsTaskExecutionRole` thiếu quyền.
- **Fix**: Kiểm tra Role có policy `AmazonECSTaskExecutionRolePolicy` không.

---

## 📌 Tóm Tắt Toàn Bộ Workflow

```
git push main
    │
    ▼
GitHub Actions khởi động
    │
    ├─► [Build] docker build -f backend/Dockerfile → Image:sha123
    ├─► [Push] docker push → ECR baucua/backend:sha123
    ├─► [Update] Task Definition v1 → Task Definition v2 (image: sha123)
    └─► [Deploy] ECS Service nhận Task Definition v2
                    │
                    ├─► Fargate pull image từ ECR
                    ├─► Container khởi động (với secrets từ SSM)
                    ├─► Health check pass ✅
                    ├─► ALB chuyển traffic sang container mới
                    └─► Container cũ shutdown gracefully
```

**Từ lần sau**, để deploy phiên bản mới, bạn chỉ cần:

```bash
git add .
git commit -m "fix: sửa lỗi tính tiền"
git push origin main
```

Tất cả 6 bước trên sẽ tự động xảy ra trong vòng **5-10 phút**. 🎉

---

> 📅 Tài liệu cập nhật: 2026-04-07
>
> 🔗 Repository: [BauCuaWithFriend](https://github.com/manhnguyenit182/BauCuaWithFriend)
>
> ⚡ Kiến trúc: S3/CloudFront (Frontend) + ECS Fargate (Backend) + Prisma Cloud + MongoDB Atlas
