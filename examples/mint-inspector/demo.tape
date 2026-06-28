# demo.tape: reproducible recording for demo.gif.
# Render with: vhs demo.tape   (https://github.com/charmbracelet/vhs)
# Requires vhs, ttyd, and ffmpeg on PATH, and `npm install` already run in this
# directory. Step 1 reaches mainnet over the default RPC; steps 2 to 4 are offline.

Output demo.gif

Set Shell "bash"
Set FontSize 15
Set Width 1280
Set Height 860
Set Padding 18
Set Theme "Dracula"
Set TypingSpeed 45ms

# Hide the initial clear so the clip opens on the first real command.
Hide
Type "clear" Enter
Show

# 1. Detect: a live mint scored CRITICAL, with a renounce-to-remediate path.
Type "# Detect: inspect a live Token-2022 mint (PayPal USD)"
Enter
Sleep 800ms
Type "npm run inspect -- 2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo"
Enter
Sleep 6s

# 2. Build the fix: scaffold a correct, correctly-ordered, correctly-sized mint.
Type "clear"
Enter
Type "# Build: scaffold a correct mint from a legal extension set (offline)"
Enter
Sleep 800ms
Type "npm run inspect -- --scaffold transfer-fee,metadata-pointer,token-metadata --decimals 6"
Enter
Sleep 5s

# 3. Guardrail: an illegal set is refused before any code is generated.
Type "npm run inspect -- --scaffold scaled-ui-amount,interest-bearing"
Enter
Sleep 4s

# 4. Prove it: the scored eval suite runs the verdicts through the real engine.
Type "clear"
Enter
Type "# Prove: the scored eval suite (16 cases, real risk engine)"
Enter
Sleep 800ms
Type "npm run evals"
Enter
Sleep 6s
