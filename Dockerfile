FROM node:22-alpine

WORKDIR /app

# Install dependencies
RUN apk add --no-cache python3 make g++ git
RUN npm install -g @anthropic-ai/claude-code

# Copy package files
COPY package.json package-lock.json ./
COPY server/package.json server/package-lock.json ./server/

# Install dependencies
RUN npm install
RUN cd server && npm install

# Copy source code
COPY . .

# Build both client and server
RUN npm run build
RUN cd server && npm run build

# Expose ports
EXPOSE 3000
EXPOSE 8000

# Command to run
CMD ["npm", "run", "dev"]
