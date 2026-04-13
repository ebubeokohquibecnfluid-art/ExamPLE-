FROM node:22
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["npx", "tsx", "server.ts"]
