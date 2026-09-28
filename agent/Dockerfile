# The Treasurer on Railway. Built from the repo root (see railway.json): the agent reads the
# deployment addresses from web/src/deployments.
FROM node:24-slim
WORKDIR /app
COPY web/src/deployments web/src/deployments
COPY agent/package.json agent/package-lock.json agent/
RUN cd agent && npm ci
COPY agent/src agent/src
COPY agent/tsconfig.json agent/
WORKDIR /app/agent
CMD ["npm", "start"]
