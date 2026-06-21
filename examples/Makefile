# Build and test both reference examples offline and deterministically.

.PHONY: verify ts hook clean

# Build the hook first so the TypeScript e2e test can load the compiled program.
verify: hook ts

ts:
	cd ts-multi-extension-mint && npm ci && npm test

hook:
	cd transfer-hook-allowlist && cargo build-sbf && cargo test

clean:
	cd ts-multi-extension-mint && rm -rf node_modules
	cd transfer-hook-allowlist && cargo clean
