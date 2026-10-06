FROM node:22.23.3-alpine3.23@sha256:baf676f7d0e552f3231945c2f979055ca121bce128c152f7a34e6bd1728b1c5a
WORKDIR /app
COPY runtime/gateway.mjs runtime/config.mjs ./
COPY LICENSE /app/LICENSE
USER node
EXPOSE 8080
ENTRYPOINT ["node", "/app/gateway.mjs"]
CMD []
