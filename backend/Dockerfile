# Sử dụng Node.js bản LTS
FROM node:20-alpine

# Cài đặt các công cụ cần thiết cho Prisma (openssl)
RUN apk add --no-cache openssl

# Thiết lập thư mục làm việc
WORKDIR /app

# Copy package files
COPY package*.json ./

# Cài đặt dependencies
RUN npm install

# Copy toàn bộ mã nguồn backend
COPY . .

# Generate Prisma Client
RUN npx prisma generate


# Mở cổng 5000 (cổng mặc định của backend)
EXPOSE 5000

# Lệnh chạy ứng dụng
CMD ["npm", "start"]
