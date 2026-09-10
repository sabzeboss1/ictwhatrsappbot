FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY vite.config.ts ./
COPY tailwind.config.js ./
COPY postcss.config.js ./
COPY index.html ./
COPY src ./src

RUN npm run build

FROM nginx:alpine AS runner

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
