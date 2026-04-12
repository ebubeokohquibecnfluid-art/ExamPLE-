# Use the official Node.js 22 image
FROM node:22

# Set the working directory
WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Copy package files
COPY package.json ./

# Install ALL dependencies (including dev ones needed for build)
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the frontend (Vite)
RUN npm run build

# Expose the port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
