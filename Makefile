# Jelly Bean Simulator
#
# A thin wrapper over the pnpm scripts. Those stay the source of truth for *what* each
# build does; this file owns the sequencing, the one-time setup steps, and running two
# processes at once. If a target here starts doing more than ordering existing scripts,
# that is a sign the work belongs in a package script instead.
#
# `make` on its own prints the menu.

DB_CONTAINER ?= jelly-db
DB_USER      ?= jelly
DB_NAME      ?= jelly
TEST_DB      ?= jelly_test
DB_PORT      ?= 5435
API_PORT     ?= 3000
WEB_PORT     ?= 5273

.DEFAULT_GOAL := help
SHELL := bash

# ---------------------------------------------------------------------------- help

.PHONY: help
help: ## Show this menu
	@echo "Jelly Bean Simulator"
	@echo
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "} {printf "  \033[1m%-14s\033[0m %s\n", $$1, $$2}'
	@echo
	@echo "  Postgres $(DB_PORT) · API $(API_PORT) · web $(WEB_PORT)"

# ---------------------------------------------------------------------------- setup

.PHONY: setup
setup: .env install db-up test-db migrate ## Fresh clone → ready to run. Safe to re-run
	@echo "Ready. 'make dev' to start."

# No prerequisites on purpose: this runs only when .env is missing. Depending on
# .env.example would overwrite a developer's customized file every time the example
# changed, which is a rude way to lose a password.
.env:
	@cp .env.example .env
	@echo "wrote .env from .env.example"

node_modules: package.json pnpm-lock.yaml
	@pnpm install
	@touch node_modules

.PHONY: install
install: node_modules ## Install workspace dependencies

# ---------------------------------------------------------------------------- running

.PHONY: dev
dev: install db-up ## Run API and web dev servers with hot reload
	@pnpm dev

.PHONY: api
api: install db-up ## Run only the API dev server
	@pnpm --filter @jelly/api dev

.PHONY: web
web: install ## Run only the web dev server
	@pnpm --filter @jelly/web dev

.PHONY: start
start: build db-up migrate ## Serve the built app: bundled API + built web
	@echo "API on :$(API_PORT), web on http://localhost:$(WEB_PORT)"
	@# NODE_ENV stays as .env has it — deliberately not 'production'. That would switch on
	@# HSTS (DESIGN.md §9.3), and an HSTS header served from localhost makes the browser
	@# force HTTPS on that origin from then on, breaking this and every other localhost
	@# project in that browser. Do not "improve" this by setting it.
	@trap 'kill 0' EXIT INT TERM; \
		pnpm --filter @jelly/api start & \
		pnpm --filter @jelly/web preview & \
		wait

# ---------------------------------------------------------------------------- build

.PHONY: build
build: install ## Build every package
	@pnpm build

.PHONY: docker-build
docker-build: require-docker ## Build the production API image
	@docker build -f apps/api/Dockerfile -t jelly-api:local .

# ---------------------------------------------------------------------------- database

.PHONY: db-up
db-up: require-docker ## Start Postgres and wait for it to be healthy
	@docker compose up -d --wait

.PHONY: db-down
db-down: require-docker ## Stop Postgres, keeping its data
	@docker compose down

.PHONY: db-reset
db-reset: require-docker ## Destroy the database and rebuild it from migrations
	@docker compose down -v
	@$(MAKE) --no-print-directory db-up test-db migrate

.PHONY: migrate
migrate: install ## Apply pending migrations
	@pnpm db:migrate

# CREATE DATABASE errors if the name is taken, so ask first. This is what makes `setup`
# and `db-reset` re-runnable.
.PHONY: test-db
test-db: db-up
	@docker exec $(DB_CONTAINER) psql -U $(DB_USER) -d $(DB_NAME) -tAc \
		"SELECT 1 FROM pg_database WHERE datname='$(TEST_DB)'" | grep -q 1 \
		|| docker exec $(DB_CONTAINER) psql -U $(DB_USER) -d $(DB_NAME) -c \
			"CREATE DATABASE $(TEST_DB)"

.PHONY: psql
psql: ## Open a psql shell on the dev database
	@docker exec -it $(DB_CONTAINER) psql -U $(DB_USER) -d $(DB_NAME)

# ---------------------------------------------------------------------------- checks

.PHONY: check
check: typecheck lint format-check test ## Everything CI runs, in CI's order

.PHONY: typecheck
typecheck: install ## Typecheck every package
	@pnpm typecheck

.PHONY: lint
lint: install ## Lint
	@pnpm lint

.PHONY: format
format: install ## Rewrite files with Prettier
	@pnpm format

.PHONY: format-check
format-check: install ## Check formatting without writing
	@pnpm format:check

.PHONY: test
test: install test-db ## Run every test suite
	@pnpm test

.PHONY: test-sim
test-sim: install ## Run the simulation tests only (fast, no database)
	@pnpm --filter @jelly/sim test

.PHONY: test-api
test-api: install test-db ## Run the API integration tests only
	@pnpm --filter @jelly/api test

# ---------------------------------------------------------------------------- misc

.PHONY: clean
clean: ## Remove build output and installed dependencies
	@rm -rf node_modules packages/*/node_modules apps/*/node_modules \
		apps/*/dist apps/web/dev-dist
	@echo "cleaned. 'make install' to start again."

.PHONY: require-docker
require-docker:
	@command -v docker > /dev/null \
		|| { echo "docker is not installed — it runs this project's Postgres."; exit 1; }
