FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY src/ src/
EXPOSE 3080
CMD ["node", "src/index.js"]
