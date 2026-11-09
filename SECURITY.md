# SECURITY & DATA POLICY

1. **API Key Isolation**: `GEMINI_API_KEY` is strictly held on the server environment side. It is NEVER exposed to client-side bundles, HTML, or browser JavaScript.
2. **No Broker Automated Interactions**: The application does not contain auto-clickers, broker login automation, OTP interception, or CAPTCHA bypass routines.
3. **Electron Security**: Electron main process runs with `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`.
4. **Input Validation & Sanitization**: Image uploads enforce MIME validation, size limits, and sanitization before processing.
