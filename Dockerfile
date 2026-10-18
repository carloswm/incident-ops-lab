FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && chown -R node:node /app
COPY --chown=node:node src ./src
COPY --chown=node:node db ./db
USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
