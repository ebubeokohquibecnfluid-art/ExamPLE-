FROM node:22
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "--loader", "tsx", "server.ts"]
