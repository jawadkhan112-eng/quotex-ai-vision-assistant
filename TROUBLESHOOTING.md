# TROUBLESHOOTING GUIDE

### 1. `GEMINI_API_KEY` Missing Error
- **Symptom**: AI Vision returns "API key is missing".
- **Fix**: Open `.env` and set `GEMINI_API_KEY="YOUR_KEY"`. You can test your connection in **AI Provider Settings** or **Diagnostics**.

### 2. HTTP 429 Quota Exceeded Error
- **Symptom**: Gemini API returns 429 Resource Exhausted.
- **Fix**: The free tier quota has been reached. Wait 60 seconds or switch to a paid API key tier.

### 3. Screen Capture Permission Denied
- **Symptom**: Live Screen Sharing fails to initialize.
- **Fix**: Ensure your browser supports WebRTC `getDisplayMedia`. Grant screen sharing permissions when prompted by your browser or OS.

### 4. SQLite Database Permission Error
- **Symptom**: Cannot write to `data/quotex_vision.db`.
- **Fix**: Ensure the running process has write permissions to the `/data` directory.
