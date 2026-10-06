FROM ghcr.io/logto-io/logto:1.44.0@sha256:75c0767d7c907c79066c77bd1919d0598b17278d0f2c14c4520fa1d1ba4589b8
WORKDIR /opt/railway-logto
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY runtime/backend.mjs runtime/config.mjs ./
COPY LICENSE /opt/railway-logto/LICENSE
WORKDIR /etc/logto
ENTRYPOINT ["node", "/opt/railway-logto/backend.mjs"]
CMD []
