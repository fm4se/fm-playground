FROM node:22-alpine
ARG VITE_FMP_API_URL
ARG VITE_FMP_VERSION
ARG VITE_COLLAB_ENABLED
ARG VITE_COLLAB_WS_URL
ENV VITE_FMP_API_URL=${VITE_FMP_API_URL}
ENV VITE_FMP_VERSION=${VITE_FMP_VERSION}
ENV VITE_COLLAB_ENABLED=${VITE_COLLAB_ENABLED}
ENV VITE_COLLAB_WS_URL=${VITE_COLLAB_WS_URL}
ENV NODE_OPTIONS="--max-old-space-size=4096"

# Configure npm for better network reliability
RUN npm config set registry https://registry.npmjs.org/ && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm config set fetch-retries 3

WORKDIR /app
COPY package*.json .
RUN npm install --verbose
COPY . .
RUN npm run build
EXPOSE 5173
CMD ["npm", "run", "preview"]
