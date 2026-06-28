# Build and test all reference examples offline and deterministically.

.PHONY: verify ts hook inspector evals demo clean

# Build the hook first so the TypeScript e2e test can load the compiled program.
verify: hook ts inspector

ts:
	cd ts-multi-extension-mint && npm ci && npm test

hook:
	cd transfer-hook-allowlist && cargo build-sbf && cargo test

inspector:
	cd mint-inspector && npm ci && npm test

# Run the mint inspector's scored eval suite on its own (also gated inside `inspector`).
evals:
	cd mint-inspector && npm run evals

# Render the CLI demo GIF from demo.tape. Requires vhs (https://github.com/charmbracelet/vhs),
# which needs ttyd and ffmpeg on PATH. Writes mint-inspector/demo.gif.
demo:
	@command -v vhs >/dev/null 2>&1 || { echo "make demo: vhs not found. Install it (with ttyd and ffmpeg) from https://github.com/charmbracelet/vhs"; exit 1; }
	cd mint-inspector && [ -d node_modules ] || npm ci
	cd mint-inspector && vhs demo.tape && echo "wrote mint-inspector/demo.gif"

clean:
	cd ts-multi-extension-mint && rm -rf node_modules
	cd transfer-hook-allowlist && cargo clean
	cd mint-inspector && rm -rf node_modules
