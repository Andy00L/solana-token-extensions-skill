# Build and test both reference examples offline and deterministically.

.PHONY: verify ts hook clean

verify: ts hook

ts:
	cd ts-multi-extension-mint && npm ci && npm test

hook:
	cd transfer-hook-allowlist && cargo build-sbf && cargo test

clean:
	cd ts-multi-extension-mint && rm -rf node_modules
	cd transfer-hook-allowlist && cargo clean
