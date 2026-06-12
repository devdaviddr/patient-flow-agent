# Patient Flow Orchestrator
.DEFAULT_GOAL := help

.PHONY: help install dev test eval up up-local down logs clean

help: ## List available commands
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies
	npm install

dev: ## Run opencode serve (pointed at the sim) + the Next.js dev server together
	@command -v opencode >/dev/null || { echo "opencode CLI not found — install it first"; exit 1; }
	SIM_URL=http://localhost:3000/api/sim opencode serve --port 4096 & \
	npm run dev; \
	kill %1 2>/dev/null || true

test: ## Lint, typecheck, and run unit tests (incl. safety, determinism & S11 invariants)
	npm run lint
	npm run typecheck
	npm test

eval: ## Run both scenarios with and without the agent, print the two KPIs
	npm run eval

up: ## Start the Docker stack (hosted Claude)
	docker compose up --build

up-local: ## Start the Docker stack with local models (Ollama)
	docker compose --profile local up --build

down: ## Stop the Docker stack
	docker compose down

logs: ## Tail logs from all services
	docker compose logs -f

clean: ## Stop the stack and remove volumes
	docker compose down -v
