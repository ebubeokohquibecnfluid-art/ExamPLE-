# Use the official Node.js 22 image (full version for better compatibility)
FROM node:22

# Set the working directory
WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the frontend
RUN npm run build

# Expose the port the app runs on
ENV PORT=8080
EXPOSE 8080

# Start the application
CMD ["npm", "start"]
