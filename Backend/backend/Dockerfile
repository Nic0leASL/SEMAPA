FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev

COPY . .

# Create uploads directory
RUN mkdir -p uploads

EXPOSE 8000

CMD ["node", "server.js"]

