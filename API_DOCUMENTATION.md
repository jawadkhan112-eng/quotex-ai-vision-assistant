# REST API DOCUMENTATION

### 1. Health & Status
`GET /api/health`
Returns system status, database connectivity, and Gemini API key configuration state.

### 2. Vision Screenshot Analysis
`POST /api/analyze-vision`
Payload: `{ symbol, timeframe, base64Image, model }` or multipart form data.
Returns: Structured vision insights and fused signal (`CALL`, `PUT`, `WAIT`).

### 3. Technical Indicator Analysis
`POST /api/analyze-technical`
Payload: `{ symbol, timeframe, candles: [...] }`
Returns: Calculated technical indicators (EMA, SMA, RSI, MACD, ATR, ADX, Bollinger Bands, Supertrend) and candlestick pattern matches.

### 4. AI Voice Assistant
`POST /api/ask-voice`
Payload: `{ query, context }`
Returns: AI assistant reply text.

### 5. Strategy Backtesting
`POST /api/backtest`
Payload: `{ symbol, timeframe, expiryCandles, payoutPercentage, evidenceThreshold, candles }`
Returns: Detailed backtest performance metrics and trade history.

### 6. Signal History
`GET /api/history?limit=50&symbol=EUR/USD%20(OTC)&signal=CALL`
`DELETE /api/history/:id`
`DELETE /api/history`
Manages SQLite analysis history records.

### 7. User Settings
`GET /api/settings`
`POST /api/settings`
Manages application key-value configuration settings.

### 8. Gemini API Validation Test
`POST /api/test-gemini`
Validates configured `GEMINI_API_KEY` connection.
