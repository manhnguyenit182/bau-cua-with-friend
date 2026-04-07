# 🚀 Hướng Dẫn Deploy Bầu Cua lên AWS ECS + S3/CloudFront + GitHub Actions

> Tài liệu hướng dẫn từng bước triển khai dự án **Bầu Cua Online** lên AWS sử dụng:
>
> - **S3 + CloudFront** — Hosting Frontend React (SPA) + CDN toàn cầu
> - **ECR + ECS Fargate** — Chạy Backend Node.js container
> - **GitHub Actions** — CI/CD Pipeline tự động hóa

---

## 📋 Mục Lục

1. [Tổng Quan Kiến Trúc](#1-tổng-quan-kiến-trúc)
2. [Yêu Cầu Trước Khi Bắt Đầu](#2-yêu-cầu-trước-khi-bắt-đầu)
3. [Bước 1: Cài Đặt AWS CLI & IAM](#3-bước-1-cài-đặt-aws-cli--iam)
4. [Bước 2: Tạo S3 Bucket cho Frontend](#4-bước-2-tạo-s3-bucket-cho-frontend)
5. [Bước 3: Tạo CloudFront Distribution](#5-bước-3-tạo-cloudfront-distribution)
6. [Bước 4: Tạo ECR Repository (Backend)](#6-bước-4-tạo-ecr-repository-backend)
7. [Bước 5: Tạo ECS Cluster & Task Definition](#7-bước-5-tạo-ecs-cluster--task-definition)
8. [Bước 6: Tạo ALB & ECS Service](#8-bước-6-tạo-alb--ecs-service)
9. [Bước 7: Cấu Hình CloudFront Multi-Origin](#9-bước-7-cấu-hình-cloudfront-multi-origin)
10. [Bước 8: Cấu Hình GitHub Secrets](#10-bước-8-cấu-hình-github-secrets)
11. [Bước 9: GitHub Actions Pipeline](#11-bước-9-github-actions-pipeline)
12. [Bước 10: Kiểm Tra & Xác Minh](#12-bước-10-kiểm-tra--xác-minh)
13. [Xử Lý Sự Cố](#13-xử-lý-sự-cố)
14. [Ước Tính Chi Phí](#14-ước-tính-chi-phí)

---

## 1. Tổng Quan Kiến Trúc

```
┌───────────────────────────────────────────────────────┐
│                     GitHub                            │
│  Push code ──► GitHub Actions                         │
│                  │                                    │
│         ┌────────┴────────┐                           │
│         ▼                 ▼                           │
│   Build Frontend    Build Backend                     │
│   (npm run build)   (Docker Image)                    │
│         │                 │                           │
│         ▼                 ▼                           │
│   Upload to S3      Push to ECR                       │
│         │                 │                           │
│         ▼                 ▼                           │
│   Invalidate CDN    Deploy to ECS                     │
└───────────────────────────────────────────────────────┘


┌───────────────────────────────────────────────────────────────┐
│                       AWS Cloud                               │
│                                                               │
│   Người dùng truy cập                                          │
│         │                                                     │
│         ▼                                                     │
│   ┌─────────────────────────────────────────────────────┐     │
│   │              CloudFront (CDN)                       │     │
│   │                                                     │     │
│   │   /            ──► Origin 1: S3 Bucket (React SPA)  │     │
│   │   /api/*       ──► Origin 2: ALB (Backend ECS)      │     │
│   │   /socket.io/* ──► Origin 2: ALB (Backend ECS)      │     │
│   └─────────────────────────────────────────────────────┘     │
│         │                           │                         │
│         ▼                           ▼                         │
│   ┌───────────┐            ┌──────────────────┐               │
│   │  S3 Bucket│            │   ALB            │               │
│   │  (Static  │            │     │            │               │
│   │   Files)  │            │     ▼            │               │
│   └───────────┘            │  ┌──────────┐    │               │
│                            │  │ ECS      │    │               │
│                            │  │ Fargate  │    │               │
│                            │  │ Backend  │    │               │
│                            │  └──────────┘    │               │
│                            └──────────────────┘               │
│                                                               │
│   External DBs:                                               │
│   ├── Prisma Postgres Cloud (DATABASE_URL)                    │
│   └── MongoDB Atlas                                           │
└───────────────────────────────────────────────────────────────┘
```

### Tại sao kiến trúc này tốt?

| Thành phần       | Lý do                                                      |
| ---------------- | ---------------------------------------------------------- |
| **S3**           | Hosting tĩnh rẻ, bền, không cần quản lý server             |
| **CloudFront**   | CDN toàn cầu, cache tại edge gần Việt Nam, giảm latency    |
| **Multi-Origin** | Frontend & Backend dùng cùng domain → không cần xử lý CORS |
| **ECS Fargate**  | Backend chạy serverless container, không cần quản lý EC2   |

---

## 2. Yêu Cầu Trước Khi Bắt Đầu

| Yêu cầu            | Mô tả                                           |
| ------------------ | ----------------------------------------------- |
| **Tài khoản AWS**  | Có quyền truy cập S3, CloudFront, ECR, ECS, IAM |
| **Docker Desktop** | Đang chạy trên máy local                        |
| **GitHub Repo**    | Code đã push lên GitHub                         |
| **Prisma Cloud**   | `DATABASE_URL` đã hoạt động                     |
| **MongoDB Atlas**  | Đã tạo cluster (Free Tier M0 - 512MB)           |

> ⚠️ **MongoDB Atlas**: Trên ECS Fargate không chạy MongoDB container được (không persistent volume). Hãy dùng [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) Free Tier.

---

## 3. Bước 1: Tạo IAM User cho GitHub Actions

Để GitHub Actions có quyền triển khai ứng dụng, bạn cần tạo một người dùng IAM.

1. Đăng nhập vào **AWS Management Console**.
2. Tìm và mở dịch vụ **IAM** (Identity and Access Management).
3. Ở menu bên trái, chọn **Users**, sau đó click **Create user**.
4. Nhập tên user: `github-actions-deployer` và nhấn **Next**.
5. Chọn **Attach policies directly**.
6. Tìm và tích chọn các policy sau:
   - `AmazonS3FullAccess`
   - `CloudFrontFullAccess`
   - `AmazonEC2ContainerRegistryPowerUser`
   - `AmazonECS_FullAccess`
   - `AmazonSSMReadOnlyAccess`
7. Nhấn **Next** rồi **Create user**.
8. Bấm vào tên user vừa tạo, chuyển sang tab **Security credentials**.
9. Kéo xuống phần **Access keys**, click **Create access key**.
10. Chọn **Command Line Interface (CLI)**, tích đồng ý, rồi **Next** và **Create access key**.
11. **QUAN TRỌNG:** Lưu lại **Access key ID** và **Secret access key**. Bạn sẽ không thể xem lại secret key ở AWS.

---

## 4. Bước 2: Tạo S3 Bucket cho Frontend

1. Đăng nhập AWS Console, tìm và mở **S3**.
2. Click **Create bucket**.
3. **Bucket name**: Đặt tên (ví dụ: `baucua-frontend-app-unique`). Tên này phải là duy nhất trên toàn hệ thống AWS.
4. **AWS Region**: Chọn khu vực (ví dụ: `ap-southeast-1` - Singapore).
5. **Block Public Access settings for this bucket**: Bật mặc định **Block all public access**.
6. **Create bucket**.

### Bật Static Website Hosting cho Bucket
1. Click vào tên bucket vừa tạo.
2. Chuyển sang tab **Properties**, cuộn xuống cùng tìm mục **Static website hosting**.
3. Click **Edit**, chọn **Enable**.
4. Chọn **Host a static website**.
5. **Index document**: Nhập `index.html`.
6. **Error document**: Nhập `index.html`. (Rất quan trọng cho React SPA).
7. Scroll xuống và click **Save changes**.

### Cấu hình Bucket Policy (cho CloudFront đọc):

Tạm thời chưa cần vì chúng ta sẽ dùng **OAC (Origin Access Control)** ở bước CloudFront. Bucket sẽ giữ **Block All Public Access** = bật — an toàn nhất.

---

## 5. Bước 3: Tạo CloudFront Distribution

### Qua AWS Console (khuyến nghị vì cần cấu hình nhiều):

1. Vào **CloudFront** → **Create Distribution**

2. **Origin 1 — S3 (Frontend)**:
   - **Origin domain**: Chọn bucket `baucua-frontend-app.s3.ap-southeast-1.amazonaws.com`
   - **Origin access**: Chọn **Origin access control settings (OAC)**
   - Bấm **Create new OAC** → Tên: `baucua-s3-oac` → **Create**
   - **Origin path**: để trống

3. **Default Cache Behavior**:
   - **Viewer protocol policy**: Redirect HTTP to HTTPS
   - **Allowed HTTP methods**: GET, HEAD
   - **Cache policy**: CachingOptimized
4. **Settings**:
   - **Default root object**: `index.html`
   - **Price class**: Use only North America and Europe (hoặc All edge locations)

5. Bấm **Create Distribution**

6. **QUAN TRỌNG**: Sau khi tạo xong, AWS sẽ hiện banner yêu cầu copy **Bucket Policy** → Bấm **Copy policy** → vào S3 bucket → **Permissions** → **Bucket policy** → Paste và Save.

### Cấu hình Custom Error Response cho React SPA:

Vào CloudFront Distribution → **Error pages** → **Create custom error response**:

| Error Code | Response Page Path | HTTP Response Code | TTL |
| ---------- | ------------------ | ------------------ | --- |
| 403        | `/index.html`      | 200                | 300 |
| 404        | `/index.html`      | 200                | 300 |

> 💡 Điều này giúp React Router hoạt động đúng khi user truy cập trực tiếp URL như `/login`, `/register`.

---

## 6. Bước 4: Tạo ECR Repository (Backend)

Chỉ cần 1 repo duy nhất cho backend:

1. Vào AWS Console, tìm và mở **Elastic Container Registry (ECR)**.
2. Click **Create repository**.
3. Chọn **Private**.
4. **Repository name**: Nhập `baucua/backend`.
5. Scroll xuống và click **Create repository**.

> 📝 Ghi lại URI: `<ACCOUNT_ID>.dkr.ecr.ap-southeast-1.amazonaws.com/baucua/backend`

---

## 7. Bước 5: Tạo ECS Cluster & Task Definition

### 7.1 Tạo Cluster:
1. Vào AWS Console, tìm và mở **Elastic Container Service (ECS)**.
2. Ở menu trái, chọn **Clusters**, rồi click **Create cluster**.
3. **Cluster name**: `baucua-cluster`.
4. Kéo xuống mục **Infrastructure**, đảm bảo **AWS Fargate (serverless)** đã được chọn.
5. Click **Create**.

### 7.2 Tạo IAM Role:
1. Vào dịch vụ **IAM**, chọn **Roles** → **Create role**.
2. **Trusted entity type**: Chọn **AWS service**.
3. **Use case**: Tìm và chọn **Elastic Container Service Task**, rồi nhấn **Next**.
4. **Add permissions**: Tìm và tích vào hai mục:
   - `AmazonECSTaskExecutionRolePolicy`
   - `AmazonSSMReadOnlyAccess`
5. Nhấn **Next**.
6. **Role name**: `ecsTaskExecutionRole`.
7. Nhấn **Create role**.

### 7.3 Lưu Secrets vào AWS Parameter Store (Systems Manager):
1. Tìm và mở dịch vụ **Systems Manager**, chọn **Parameter Store** ở menu bên trái.
2. Click **Create parameter**.
3. Tạo thông số `DATABASE_URL`:
   - **Name**: `/baucua/DATABASE_URL`
   - **Type**: SecureString
   - **Value**: Nhập chuỗi URL kết nối Prisma Cloud DB của bạn.
   - Click **Create parameter**.
4. Lặp lại bước 2-3 để tạo thông số `MONGODB_URI`:
   - **Name**: `/baucua/MONGODB_URI`
   - **Type**: SecureString
   - **Value**: Nhập URI MongoDB Atlas của bạn.
5. Lặp lại bước 2-3 để tạo thông số `JWT_SECRET`:
   - **Name**: `/baucua/JWT_SECRET`
   - **Type**: SecureString
   - **Value**: Nhập bí mật JWT của bạn.

### 7.4 Tạo CloudWatch Log Group:
1. Tìm và mở dịch vụ **CloudWatch**.
2. Chọn **Log groups** ở menu trái, click **Create log group**.
3. **Log group name**: `/ecs/baucua`.
4. Click **Create**.

### 7.5 Đăng ký Task Definition:
1. Vào dịch vụ **ECS**, chọn **Task definitions** ở menu trái, click **Create new task definition** (Có thể chọn Create new task definition with JSON).
2. Tốt nhất là chọn tạo bằng JSON, sau đó sao chép toàn bộ nội dung của tệp `ecs-task-definition.json` trong dự án của bạn (Nhớ thay thế `THAY_AWS_ACCOUNT_ID` bằng số AWS Account ID thật của bạn) và dán vào.
3. Nếu không dùng JSON:
   - **Task definition family**: `baucua-task`
   - **Infrastructure requirements**: AWS Fargate, OS: Linux/X86_64, CPU: .5 vCPU, Memory: 1 GB.
   - **Task execution role**: Chọn `ecsTaskExecutionRole` vừa tạo.
   - **Container - 1**:
      - Name: `backend`
      - Image URI: Dán URI của ECR repository ở Bước 4 vào (vd: `.../baucua/backend:latest`).
      - Port mappings: Container port: `5000` (TCP).
      - Môi trường & Log có thể thêm theo file json.
4. Nhấn **Create**.

## 8. Bước 6: Tạo Security Group, ALB & ECS Service

### 8.1 Tạo Security Groups (EC2 Console):
1. Mở dịch vụ **EC2**, trỏ đến **Security Groups** ở menu trái.
2. Click **Create security group** (cho Load Balancer):
   - **Name**: `baucua-alb-sg`
   - **Description**: ALB for Bau Cua Backend
   - **Inbound rules**: Add rule → Type: HTTP, Port: 80, Source: Anywhere-IPv4 (`0.0.0.0/0`).
   - Click **Create**.
3. Lặp lại tạo Security Group (cho ECS Tasks):
   - **Name**: `baucua-ecs-sg`
   - **Description**: ECS Tasks for Bau Cua
   - **Inbound rules**: Add rule → Type: Custom TCP, Port: 5000, Source: Custom (Chọn `baucua-alb-sg` vừa tạo).
   - Click **Create**.

### 8.2 Tạo ALB (Application Load Balancer):

1. Trong dịch vụ **EC2**, cuộn phần Load Balancing ở menu trái, chọn **Load Balancers** → **Create Load Balancer**.
2. Chọn **Application Load Balancer**, click **Create**.
3. Cấu hình cơ bản:
   - **Load balancer name**: `baucua-backend-alb`
   - **Scheme**: Internet-facing
   - **Network mapping**: Chọn VPC mặc định của bạn. Mục **Mappings**, tích chọn ít nhất 2 Availability Zones (subnets).
   - **Security groups**: Bỏ chọn default, chỉ chọn `baucua-alb-sg`.
   - **Listeners and routing**: Port 80, mục Default action, click **Create target group**. Tab mới mở ra.
4. **Tạo Target Group** (ở tab mới):
   - **Choose a target type**: Chọn **IP addresses**.
   - **Target group name**: `baucua-backend-tg`
   - **Protocol/Port**: HTTP / 5000
   - **VPC**: Để mặc định.
   - **Health checks**: Protocol HTTP, Path nhập `/api/health`.
   - Click **Next**, rồi **Create target group**. Đóng tab này.
5. Quay lại tab tạo ALB, bấm nút **Refresh** kế bên nút tạo target group, rồi chọn tên `baucua-backend-tg` vừa tạo.
6. Kéo xuống dưới cùng và nhấn **Create load balancer**.

> 📝 Ghi lại **DNS name** của `baucua-backend-alb` (vd: `baucua-backend-alb-xxx.ap-southeast-1.elb.amazonaws.com`).

### 8.3 Tạo ECS Service:
1. Quay lại dịch vụ **ECS**, vào cluster `baucua-cluster`.
2. Ở tab **Services**, click **Create**.
3. Cấu hình:
   - **Compute configuration**: Launch type (FARGATE).
   - **Deployment configuration**: 
     - **Task definition**: `baucua-task` cấu hình mới nhất.
     - **Service name**: `baucua-backend-service`.
     - **Desired tasks**: 1.
   - Mở mục **Networking**:
     - **Subnets**: Chọn ít nhất 2 subnets công khai.
     - **Security group**: Bỏ chọn default, chọn `baucua-ecs-sg`.
     - **Public IP**: Bật (Turned on).
   - Mở phần **Load balancing**:
     - Chọn **Application Load Balancer**.
     - Ở khung Load balancer name, chọn `baucua-backend-alb`.
     - Kế bên Container backend:5000, chọn **Use an existing target group**.
     - Kéo xuống Target group name, chọn `baucua-backend-tg`.
4. Bấm **Create**.

---

## 9. Bước 7: Cấu Hình CloudFront Multi-Origin

Đây là bước **QUAN TRỌNG NHẤT** — kết nối frontend (S3) và backend (ALB) qua một CloudFront domain duy nhất.

### 9.1 Thêm Origin mới cho Backend:

1. Vào **CloudFront** → Chọn distribution đã tạo → **Origins** → **Create origin**
2. Cấu hình:
   - **Origin domain**: `baucua-backend-alb-xxx.ap-southeast-1.elb.amazonaws.com` (DNS name của ALB)
   - **Protocol**: HTTP only
   - **HTTP port**: 80
   - **Origin ID**: `backend-alb`

### 9.2 Tạo Behavior cho `/api/*`:

1. Vào **Behaviors** → **Create behavior**
2. Cấu hình:

| Cài đặt                    | Giá trị                                      |
| -------------------------- | -------------------------------------------- |
| **Path pattern**           | `/api/*`                                     |
| **Origin**                 | `backend-alb`                                |
| **Viewer protocol policy** | Redirect HTTP to HTTPS                       |
| **Allowed HTTP methods**   | GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE |
| **Cache policy**           | CachingDisabled                              |
| **Origin request policy**  | AllViewer                                    |

### 9.3 Tạo Behavior cho `/socket.io/*`:

1. Vào **Behaviors** → **Create behavior**
2. Cấu hình:

| Cài đặt                    | Giá trị                                      |
| -------------------------- | -------------------------------------------- |
| **Path pattern**           | `/socket.io/*`                               |
| **Origin**                 | `backend-alb`                                |
| **Viewer protocol policy** | HTTPS only                                   |
| **Allowed HTTP methods**   | GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE |
| **Cache policy**           | CachingDisabled                              |
| **Origin request policy**  | AllViewer                                    |

> ⚠️ **Socket.io trên CloudFront**: WebSocket hoạt động qua HTTPS trên CloudFront. Tuy nhiên, CloudFront có timeout mặc định 30 giây cho idle connections. Để tăng lên:
>
> - Vào Origin `backend-alb` → **Edit** → **Response timeout**: 60 giây
> - Socket.io sẽ tự động fallback sang polling nếu WebSocket không kết nối được.

### 9.4 Kết quả cuối cùng — Behaviors:

| Priority | Path Pattern   | Origin      | Cache            |
| -------- | -------------- | ----------- | ---------------- |
| 0        | `/api/*`       | backend-alb | Disabled         |
| 1        | `/socket.io/*` | backend-alb | Disabled         |
| 2        | `Default (*)`  | S3 Bucket   | CachingOptimized |

---

## 10. Bước 8: Cấu Hình GitHub Secrets

Vào **GitHub Repo** → **Settings** → **Secrets and variables** → **Actions** → Thêm:

| Secret Name                  | Giá trị                                           |
| ---------------------------- | ------------------------------------------------- |
| `AWS_ACCESS_KEY_ID`          | Access Key của IAM User `github-actions-deployer` |
| `AWS_SECRET_ACCESS_KEY`      | Secret Key                                        |
| `AWS_ACCOUNT_ID`             | Account ID (12 chữ số)                            |
| `AWS_REGION`                 | `ap-southeast-1`                                  |
| `S3_BUCKET_NAME`             | `baucua-frontend-app`                             |
| `CLOUDFRONT_DISTRIBUTION_ID` | ID distribution (ví dụ: `E1A2B3C4D5E6F7`)         |

---

## 11. Bước 9: GitHub Actions Pipeline

File `.github/workflows/deploy.yml` sẽ tự động:

1. **Frontend**: Build React → Sync lên S3 → Invalidate CloudFront cache
2. **Backend**: Build Docker → Push ECR → Deploy ECS

```yaml
name: 🚀 Deploy Bầu Cua to AWS

on:
  push:
    branches: [main]

env:
  AWS_REGION: ${{ secrets.AWS_REGION }}
  ECR_REGISTRY: ${{ secrets.AWS_ACCOUNT_ID }}.dkr.ecr.${{ secrets.AWS_REGION }}.amazonaws.com

jobs:
  # ═══════════════════════════════════════════
  # JOB 1: Deploy Frontend → S3 + CloudFront
  # ═══════════════════════════════════════════
  deploy-frontend:
    name: 🎨 Deploy Frontend (S3 + CDN)
    runs-on: ubuntu-latest

    steps:
      - name: 📥 Checkout code
        uses: actions/checkout@v4

      - name: 📦 Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json

      - name: 📥 Install dependencies
        working-directory: ./frontend
        run: npm ci

      - name: 🏗️ Build React app
        working-directory: ./frontend
        run: npm run build

      - name: 🔑 Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ secrets.AWS_REGION }}

      - name: 📤 Sync to S3
        run: |
          aws s3 sync ./frontend/dist s3://${{ secrets.S3_BUCKET_NAME }} \
            --delete \
            --cache-control "public, max-age=31536000, immutable" \
            --exclude "index.html"

          # index.html không cache lâu (để user luôn nhận bản mới)
          aws s3 cp ./frontend/dist/index.html s3://${{ secrets.S3_BUCKET_NAME }}/index.html \
            --cache-control "public, max-age=0, must-revalidate"

      - name: 🌐 Invalidate CloudFront Cache
        run: |
          aws cloudfront create-invalidation \
            --distribution-id ${{ secrets.CLOUDFRONT_DISTRIBUTION_ID }} \
            --paths "/*"

      - name: ✅ Frontend Deploy Success
        run: echo "🎉 Frontend deployed to S3 + CloudFront!"

  # ═══════════════════════════════════════════
  # JOB 2: Deploy Backend → ECR + ECS
  # ═══════════════════════════════════════════
  deploy-backend:
    name: ⚙️ Deploy Backend (ECS Fargate)
    runs-on: ubuntu-latest

    steps:
      - name: 📥 Checkout code
        uses: actions/checkout@v4

      - name: 🔑 Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ secrets.AWS_REGION }}

      - name: 🔐 Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: 🏗️ Build & Push Backend Image
        id: build-backend
        run: |
          IMAGE_TAG=${{ github.sha }}
          BACKEND_IMAGE=${{ env.ECR_REGISTRY }}/baucua/backend

          docker build -t $BACKEND_IMAGE:$IMAGE_TAG -t $BACKEND_IMAGE:latest ./backend
          docker push $BACKEND_IMAGE:$IMAGE_TAG
          docker push $BACKEND_IMAGE:latest

          echo "image=$BACKEND_IMAGE:$IMAGE_TAG" >> $GITHUB_OUTPUT

      - name: 📝 Update Task Definition
        id: task-def
        uses: aws-actions/amazon-ecs-render-task-definition@v1
        with:
          task-definition: ecs-task-definition.json
          container-name: backend
          image: ${{ steps.build-backend.outputs.image }}

      - name: 🚀 Deploy to ECS
        uses: aws-actions/amazon-ecs-deploy-task-definition@v2
        with:
          task-definition: ${{ steps.task-def.outputs.task-definition }}
          service: baucua-backend-service
          cluster: baucua-cluster
          wait-for-service-stability: true

      - name: ✅ Backend Deploy Success
        run: echo "🎉 Backend deployed to ECS Fargate!"
```

---

## 12. Bước 10: Kiểm Tra & Xác Minh

### 12.1 Kiểm tra Frontend (S3 + CloudFront):
1. Vào màn hình CloudFront tìm Distribution Bầu cua, copy lấy **Domain Name**
2. Truy cập: `https://<DOMAIN-NAME-CỦA-BẠN>/` → Thấy giao diện Bầu Cua ✅

### 12.2 Kiểm tra Backend (ECS):
1. Vào AWS Console, mở dịch vụ ECS → cluster `baucua-cluster` → xem tab `Services`, chờ trạng thái deploy hoàn tất và task Running ổn định.
2. Truy cập URL test api: `https://<DOMAIN-NAME-CỦA-BẠN>/api/health` → Thấy JSON `{"message": "🎲 Bầu Cua API is running!"}` là thành công.

### 12.3 Kiểm tra Full Flow:
1. Mở trình duyệt → `https://<DOMAIN-NAME-CỦA-BẠN>/register`
2. Đăng ký tài khoản mới.
3. Đăng nhập → Vào Lobby → Tạo phòng → Chơi game.
4. Kiểm tra Console trình duyệt đảm bảo socket kết nối bình thường, không lỗi CORS.

### 12.4 Xem Logs:
1. Truy cập dịch vụ **CloudWatch**.
2. Chọn **Log groups** → `/ecs/baucua`.
3. Nhấp vào các dòng nhật ký (Log Stream) bên trong để xem.

---

## 13. Xử Lý Sự Cố

### ❌ CloudFront trả về Access Denied cho S3

- **Nguyên nhân**: Chưa cấu hình OAC hoặc Bucket Policy
- **Fix**: Kiểm tra CloudFront → Origins → S3 origin có dùng OAC không? Copy policy từ banner và paste vào S3 Bucket Policy.

### ❌ `/api/*` trả về 502 Bad Gateway

- **Nguyên nhân**: ALB health check fail → ECS container chưa healthy
- **Fix**:
  Vào log CloudWatch `/ecs/baucua` kiểm tra thông báo lỗi. Thường do sai chứng chỉ kết nối ở AWS Parameter Store.

### ❌ Socket.io không kết nối được qua CloudFront

- **Nguyên nhân**: CloudFront timeout quá ngắn hoặc thiếu behavior `/socket.io/*`
- **Fix**:
  1. Kiểm tra behavior `/socket.io/*` đã tạo chưa (Bước 9.3)
  2. Tăng Origin timeout lên 60 giây
  3. Socket.io sẽ tự fallback sang long-polling nếu WebSocket bị block

### ❌ React Router trả 404 khi truy cập trực tiếp URL

- **Nguyên nhân**: CloudFront không biết redirect về `index.html`
- **Fix**: Tạo Custom Error Response cho code 403 và 404 (Bước 5, phần Error Pages)

### ❌ GitHub Actions lỗi permission

- **Nguyên nhân**: IAM User không có đủ quyền
- **Fix**: Kiểm tra IAM policies: S3, CloudFront, ECR, ECS, SSM

---

## 14. Ước Tính Chi Phí

| Dịch vụ                             | Chi phí ước tính/tháng |
| ----------------------------------- | ---------------------- |
| **S3** (hosting static files)       | ~$0.50                 |
| **CloudFront** (CDN)                | ~$1-5 (tuỳ traffic)    |
| **ECS Fargate** (0.5 vCPU, 1GB RAM) | ~$15-20                |
| **ALB**                             | ~$16 + traffic         |
| **ECR**                             | ~$0.50                 |
| **CloudWatch Logs**                 | ~$0.50                 |
| **Prisma Cloud**                    | Tuỳ plan               |
| **MongoDB Atlas (Free Tier)**       | $0                     |
| **Tổng ước tính**                   | **~$34-43/tháng**      |

### So sánh với kiến trúc cũ (EC2):

|                         | EC2 + Docker             | S3/CloudFront + ECS               |
| ----------------------- | ------------------------ | --------------------------------- |
| **Frontend**            | Nginx container trên EC2 | S3 + CloudFront CDN ⚡            |
| **Tốc độ load**         | Phụ thuộc EC2 region     | Siêu nhanh (edge server gần user) |
| **Scale**               | Manual                   | Auto-scaling                      |
| **Downtime khi deploy** | Có                       | Không (rolling update)            |
| **Chi phí**             | ~$10-15 (t2.micro)       | ~$34-43                           |

> 💡 Dùng **AWS Free Tier** 12 tháng đầu: ALB, ECS, S3, CloudFront đều có free tier → chi phí gần **$0** trong năm đầu tiên.

---

## 📊 Tóm Tắt Pipeline CI/CD

```
Developer push code lên main
        │
        ├──────────────────┬──────────────────┐
        ▼                  ▼                  │
   [Frontend Job]    [Backend Job]            │
        │                  │                  │
   npm ci + build     Docker build            │
        │                  │                  │
   S3 sync            ECR push               │
        │                  │                  │
   CloudFront         ECS deploy             │
   invalidate         (rolling update)        │
        │                  │                  │
        ▼                  ▼                  │
   ✅ CDN updated    ✅ Container updated     │
        │                  │                  │
        └──────────────────┴──────────────────┘
                           │
                           ▼
                  🎉 Website live!
           https://<cloudfront-domain>/
```

---

> 📅 Tài liệu cập nhật: 2026-04-06
>
> 🔗 Repository: [BauCuaWithFriend](https://github.com/manhnguyenit182/BauCuaWithFriend)
