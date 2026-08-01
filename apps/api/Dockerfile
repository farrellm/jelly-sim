# The API is bundled to a single file (apps/api/scripts/build.mjs), so the runtime image
# carries no pnpm, no workspace layout, and no TypeScript — just node, the bundle, and the
# one dependency that cannot be bundled because it is native.

FROM node:22-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/sim/package.json packages/sim/
COPY apps/api/package.json apps/api/
# node-linker=hoisted gives a plain node_modules of real directories instead of pnpm's
# symlinks into a content-addressed store. The runtime stage copies one package out of it,
# and a symlink pointing at a store that was left behind in this stage is not a package.
#
# No BuildKit cache mount here on purpose: it would tie this file to a builder that not
# every environment has, and layer caching already covers the common case.
RUN pnpm install --frozen-lockfile --filter @jelly/api... --config.node-linker=hoisted

COPY packages ./packages
COPY apps/api ./apps/api
COPY tsconfig.base.json ./
RUN pnpm --filter @jelly/api build

FROM node:22-slim AS runtime
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
WORKDIR /app

# @node-rs/argon2 is a native module and stays outside the bundle.
COPY --from=build /app/node_modules/@node-rs ./node_modules/@node-rs
COPY --from=build /app/apps/api/dist ./dist

USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
