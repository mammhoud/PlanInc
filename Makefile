SHELL := /bin/bash

COMPOSE_FILE := docker-compose.yml
# The tool-local env wins so Planing can be deployed independently. Fall back
# to the shared tools env, then the repo-root env for existing deployments.
ENV_FILE     ?= $(if $(wildcard .env),.env,$(if $(wildcard ../.env),../.env,../../../.env))

PLANINC_PORT ?= 1111

# Exported so `PLANINC_SUPERUSER_NAME=... make run` reaches the server process,
# but ONLY when the caller actually supplies a value. Exporting an unset variable
# pushes an EMPTY value into the child environment, and an empty environment
# variable takes precedence over .env during compose interpolation — which
# silently left the container without a bootstrap superuser.
ifneq ($(origin PLANINC_SUPERUSER_NAME),undefined)
export PLANINC_SUPERUSER_NAME
endif
ifneq ($(origin PLANINC_SUPERUSER_PASSWORD),undefined)
export PLANINC_SUPERUSER_PASSWORD
endif

.PHONY: help up down deploy build restart logs status ps setup verify-surrealdb run install test test-canonical django-check django-test django-run clean clean-unused

help: ## Show this help menu
	@echo 'PlanInc commands: make up | down | deploy | build | restart | logs | status | setup | run | test'
	@echo '  setup     - Create .env from .env.example if missing'
	@echo '  run       - Run the server natively (no docker build) at http://localhost:$(PLANINC_PORT)'
	@echo '  test      - Run the source-stack checks'
	@echo '  test-canonical - Smoke a running deployment (PLANINC_TEST_URL, default :$(PLANINC_PORT))'
	@echo '  up        - Start PlanInc (notes.structa.cloud)'
	@echo '  deploy    - Build + start Planing'
	@echo '  build     - Build the Planing image'
	@echo '  down      - Stop Planing'
	@echo '  restart   - Restart Planing'
	@echo '  logs      - Tail Planing logs'
	@echo '  verify-surrealdb - Validate the SurrealDB-only runtime and Compose contract'
	@echo '  django-check - Check the isolated Django server alternative'
	@echo '  django-test  - Run isolated Django server tests'
	@echo '  django-run   - Run the isolated Django server at :8001'

setup: ## Create .env from .env.example if missing
	@if [ ! -f .env ]; then \
		echo "📝 Creating .env from .env.example (generated random defaults)"; \
		cp .env.example .env; \
	else \
		echo "✅ .env already exists — leaving it untouched"; \
	fi

verify-surrealdb:
	@COMPOSE_FILE=$(COMPOSE_FILE) SOURCE_DIR=. bash ./verify-surrealdb.sh

up: verify-surrealdb
	@docker compose --env-file $(ENV_FILE) -f $(COMPOSE_FILE) up -d

deploy: build up

build: verify-surrealdb
	@docker compose --env-file $(ENV_FILE) -f $(COMPOSE_FILE) build

install: ## Install source-stack dependencies for `make run`
	@bun install --frozen-lockfile

test: install ## Run source-stack contract and frontend checks
	@bun run --cwd frontend check:contracts

django-check: ## Run Django checks without changing the active TypeScript server
	@cd django_server && PYTHONPATH=. python3 manage.py check

django-test: ## Run Django foundation tests without changing the active TypeScript server
	@cd django_server && PYTHONPATH=. python3 manage.py test

django-run: ## Run the isolated Django server without changing the active TypeScript server
	@cd django_server && PYTHONPATH=. python3 manage.py runserver $${PLANINC_DJANGO_BIND:-127.0.0.1:8001}

test-canonical: ## Smoke a running deployment over HTTP (set PLANINC_TEST_URL to override :$(PLANINC_PORT))
	@bun run --cwd frontend build:web

run: install ## Run the server natively without a docker build
	@# Uses the same SurrealDB file as the Docker deployment (./data) —
	@# stop one before starting the other or the KV file will be locked.
	@# Loads $(ENV_FILE) (superuser creds etc.), then explicit vars win.
	@SAVED_PATH="$$PATH"; \
		if [ -f $(ENV_FILE) ]; then set -a; . $(ENV_FILE); set +a; fi; \
		export PATH="$$SAVED_PATH"; \
		PLANINC_DB_FILE=./data/planinc.db PLANINC_PORT=$(PLANINC_PORT) bun run --cwd server dev

down:
	@docker compose --env-file $(ENV_FILE) -f $(COMPOSE_FILE) down

restart:
	@docker compose --env-file $(ENV_FILE) -f $(COMPOSE_FILE) restart

logs:
	@docker compose --env-file $(ENV_FILE) -f $(COMPOSE_FILE) logs -f

status:
	@docker compose --env-file $(ENV_FILE) -f $(COMPOSE_FILE) ps

ps: status

clean: ## Stop Planing and prune its images/build cache (volumes kept)
	@echo "🧹 Cleaning Planing (volumes kept)..."
	@docker compose --env-file $(ENV_FILE) -f $(COMPOSE_FILE) down --remove-orphans 2>/dev/null || true
	@docker image prune -f 2>/dev/null || true
	@echo "✅ Planing clean complete"

clean-unused: clean ## clean + prune stopped containers and all unused build cache (volumes preserved)
	@docker container prune -f 2>/dev/null || true
	@docker image prune -af 2>/dev/null || true
	@docker builder prune -af 2>/dev/null || true
	@echo "✅ clean-unused complete (volumes preserved)"
