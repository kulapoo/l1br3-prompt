set shell := ["bash", "-c"]
set dotenv-load

# List all recipes
default:
    @just --list

# ── Dev servers ───────────────────────────────────────────────────────────────

# Run API + browser extension concurrently
dev:
    @echo "Starting API and browser extension..."
    cd api && uv run python -m app.main &
    cd browser-ext && npm run dev &
    wait

# API only (FastAPI on localhost:8000)
dev-api:
    cd api && uv run python -m app.main

# Browser extension — Chrome (WXT)
dev-ext:
    cd browser-ext && npm run dev

# Browser extension — Firefox (WXT)
dev-ext-ff:
    cd browser-ext && npm run dev:firefox

# ── Tests ─────────────────────────────────────────────────────────────────────

# Run all tests
test: test-api

# API tests (pytest)
test-api:
    cd api && uv run pytest

# ── Build ─────────────────────────────────────────────────────────────────────

# Build everything
build: build-api build-ext

# Build API as single executable (PyInstaller)
build-api:
    cd api && bash build.sh

# Build browser extension — Chrome
build-ext:
    cd browser-ext && npm run build

# Build browser extension — Firefox
build-ext-ff:
    cd browser-ext && npm run build:firefox

# Package extension zips for distribution
zip-ext:
    cd browser-ext && npm run zip

# ── Install ───────────────────────────────────────────────────────────────────

# Install all dependencies
install: install-api install-ext

# Install API dependencies
install-api:
    cd api && uv sync

# Install browser extension dependencies
install-ext:
    cd browser-ext && npm install

# ── Lint ──────────────────────────────────────────────────────────────────────

# Lint everything
lint: lint-ext

# Type-check browser extension
lint-ext:
    cd browser-ext && npm run compile

# ── Utilities ─────────────────────────────────────────────────────────────────

# Remove all build artifacts
clean:
    rm -rf api/dist api/build api/__pycache__ api/**/__pycache__
    rm -rf browser-ext/.output browser-ext/.wxt
    @echo "Cleaned."
