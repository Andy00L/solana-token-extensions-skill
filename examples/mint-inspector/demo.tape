# demo.tape: reproducible recording for demo.gif.
# Render with: vhs demo.tape   (https://github.com/charmbracelet/vhs)
# or, from the examples directory: make demo
# Requires vhs, ttyd, and ffmpeg on PATH, and `npm install` already run in this
# directory. The first step reaches mainnet over the default RPC; the scaffold and
# evals steps are offline.

Output demo.gif

Set Shell "bash"
Set FontSize 15
Set Width 1200
Set Height 760
Set Padding 16
Set Theme "Dracula"
Set TypingSpeed 30ms

# Hide the initial clear so the clip opens on the first real command.
Hide
Type "clear" Enter
Show

# 1. Detect: a live mint scored CRITICAL, with a renounce-to-remediate path.
Type "# Detect a live Token-2022 mint (PYUSD)"
Enter
Sleep 600ms
Type "npm run inspect -- 2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo"
Enter
Sleep 4s

# 2. Build the fix: scaffold a correct, correctly-ordered, correctly-sized mint.
Type "clear"
Enter
Type "# Build a correct mint from a legal set (offline)"
Enter
Sleep 600ms
Type "npm run inspect -- --scaffold transfer-fee,metadata-pointer,token-metadata --decimals 6"
Enter
Sleep 3s

# 3. Guardrail: an illegal set is refused before any code is generated.
Type "npm run inspect -- --scaffold scaled-ui-amount,interest-bearing"
Enter
Sleep 3s

# 4. Prove it: the scored eval suite runs the verdicts through the real engine.
Type "clear"
Enter
Type "# Prove: scored eval suite (21 cases, real risk engine)"
Enter
Sleep 600ms
Type "npm run evals"
Enter
Sleep 4s
