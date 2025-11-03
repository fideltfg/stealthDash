.PHONY: help dev prod build-dev build-prod up-dev up-prod down logs logs-dev logs-prod restart clean

# Detect Docker Compose command
DOCKER_COMPOSE := $(shell command -v docker-compose 2> /dev/null)
ifndef DOCKER_COMPOSE
	DOCKER_COMPOSE := docker compose
endif

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

dev: ## Start development server
	$(DOCKER_COMPOSE) up

dev-d: ## Start development server in background
	$(DOCKER_COMPOSE) up -d

build-dev: ## Build development image
	$(DOCKER_COMPOSE) build

up-dev: build-dev ## Build and start development server
	$(DOCKER_COMPOSE) up -d

prod: ## Start production server in background
	$(DOCKER_COMPOSE) -f docker-compose.prod.yml up -d

build-prod: ## Build production image
	$(DOCKER_COMPOSE) -f docker-compose.prod.yml build

up-prod: build-prod ## Build and start production server
	$(DOCKER_COMPOSE) -f docker-compose.prod.yml up -d

down: ## Stop all containers
	$(DOCKER_COMPOSE) down
	$(DOCKER_COMPOSE) -f docker-compose.prod.yml down

down-v: ## Stop all containers and remove volumes
	$(DOCKER_COMPOSE) down -v
	$(DOCKER_COMPOSE) -f docker-compose.prod.yml down -v

logs: ## View logs from all containers
	$(DOCKER_COMPOSE) logs -f

logs-dev: ## View development logs
	$(DOCKER_COMPOSE) logs -f

logs-prod: ## View production logs
	$(DOCKER_COMPOSE) -f docker-compose.prod.yml logs -f

restart: ## Restart all containers
	$(DOCKER_COMPOSE) restart

restart-prod: ## Restart production containers
	$(DOCKER_COMPOSE) -f docker-compose.prod.yml restart

shell: ## Open shell in development container
	$(DOCKER_COMPOSE) exec dashboard sh

shell-prod: ## Open shell in production container
	$(DOCKER_COMPOSE) -f docker-compose.prod.yml exec dashboard-prod sh

clean: ## Clean up Docker resources
	$(DOCKER_COMPOSE) down -v
	$(DOCKER_COMPOSE) -f docker-compose.prod.yml down -v
	docker system prune -f

rebuild: ## Rebuild development without cache
	$(DOCKER_COMPOSE) build --no-cache
	$(DOCKER_COMPOSE) up -d

rebuild-prod: ## Rebuild production without cache
	$(DOCKER_COMPOSE) -f docker-compose.prod.yml build --no-cache
	$(DOCKER_COMPOSE) -f docker-compose.prod.yml up -d

ps: ## Show running containers
	$(DOCKER_COMPOSE) ps
	$(DOCKER_COMPOSE) -f docker-compose.prod.yml ps

install: ## Install npm dependencies in container
	$(DOCKER_COMPOSE) run --rm dashboard npm install

test: ## Run tests (if any)
	$(DOCKER_COMPOSE) run --rm dashboard npm test
