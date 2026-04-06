# Stage 1: Build React/Vite app
FROM node:20-alpine AS build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Cài đặt dependencies
RUN npm install

# Copy source code
COPY . .

# Xây dựng bản sản xuất
RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:stable-alpine

# Copy tệp build từ stage 1 vào thư mục phục vụ của Nginx
COPY --from=build /app/dist /usr/share/nginx/html

# Cấu hình Nginx mặc định
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Mở cổng 80
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
