# BMad Client Library - Makefile
# This Makefile provides convenient shortcuts for development tasks

.PHONY: help test demo build typecheck lint format clean

# Default target - show help
help:
	@echo "BMad Client Library - Development Commands"
	@echo ""
	@echo "Testing:"
	@echo "  make test          Run unit and integration tests (fast, uses mocks)"
	@echo "  make test-watch    Run tests in watch mode"
	@echo "  make test-ui       Run tests with Vitest UI"
	@echo "  make test-coverage Run tests with coverage report"
	@echo ""
	@echo "Demos (requires ANTHROPIC_API_KEY):"
	@echo "  make demo          Run all demos sequentially"
	@echo "  make demo-simple   Run simple agent demo (PM agent)"
	@echo "  make demo-debug    Run debug demo with detailed logging"
	@echo ""
	@echo "Build:"
	@echo "  make build         Build all packages"
	@echo "  make typecheck     Run TypeScript type checking"
	@echo ""
	@echo "Code Quality:"
	@echo "  make lint          Run ESLint"
	@echo "  make format        Format code with Prettier"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean         Remove build artifacts and node_modules"

# ============================================================================
# Testing (Fast - Uses Mocks)
# ============================================================================

test:
	@echo "🧪 Running tests (with mocks)..."
	@npm test -- --run

test-watch:
	@echo "🔍 Running tests in watch mode..."
	@npm test

test-ui:
	@echo "🎨 Starting Vitest UI..."
	@npm run test:ui

test-coverage:
	@echo "📊 Running tests with coverage..."
	@npm run test:coverage

# ============================================================================
# Demos (Slow - Uses Real LLM API Calls)
# ============================================================================

demo: demo-simple

demo-simple:
	@echo ""
	@echo "🚀 Running Simple Agent Demo"
	@echo "   Note: This makes real API calls to Anthropic"
	@echo "   Requires: ANTHROPIC_API_KEY environment variable"
	@echo ""
	@npm run example:simple

demo-debug:
	@echo ""
	@echo "🐛 Running Debug Agent Demo"
	@echo "   Note: This makes real API calls to Anthropic"
	@echo "   Requires: ANTHROPIC_API_KEY environment variable"
	@echo ""
	@npm run example:debug

# ============================================================================
# Build & Type Checking
# ============================================================================

build:
	@echo "🔨 Building all packages..."
	@npm run build

typecheck:
	@echo "📝 Running TypeScript type checking..."
	@npm run typecheck

# ============================================================================
# Code Quality
# ============================================================================

lint:
	@echo "🔍 Running ESLint..."
	@npm run lint

format:
	@echo "✨ Formatting code with Prettier..."
	@npm run format

# ============================================================================
# Cleanup
# ============================================================================

clean:
	@echo "🧹 Cleaning build artifacts..."
	@rm -rf packages/*/dist
	@rm -rf node_modules packages/*/node_modules examples/node_modules
	@rm -rf .vitest
	@echo "✅ Clean complete"

# ============================================================================
# CI/CD Helpers
# ============================================================================

ci-test: test typecheck
	@echo "✅ CI tests passed"

ci-build: build
	@echo "✅ CI build passed"
