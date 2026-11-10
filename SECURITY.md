# Security and Data Policy

1. **Local calculations only:** The terminal does not accept, store, or transmit API keys and makes no provider/model calls.
2. **Explicit screen capture:** Browser screen sharing starts only after the user grants permission and stops when the user stops the stream.
3. **No broker automation:** The application contains no auto-clickers, login automation, OTP interception, CAPTCHA bypass, or trade execution.
4. **Electron hardening:** Electron uses `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`.
5. **Input validation:** The API requires an array of finite price values and bounds JSON payloads to 8 MB.
