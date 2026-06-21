# Build and test all reference examples offline and deterministically.

.PHONY: verify ts hook inspector clean

# Build the hook first so the TypeScript e2e test can load the compiled program.
verify: hook ts inspector

ts:
	cd ts-multi-extension-mint && npm ci && npm test

hook:
	cd transfer-hook-allowlist && cargo build-sbf && cargo test

inspector:
	cd mint-inspector && npm ci && npm test

clean:
	cd ts-multi-extension-mint && rm -rf node_modules
	cd transfer-hook-allowlist && cargo clean
	cd mint-inspector && rm -rf node_modules
