# QUOTEX AI VISION ASSISTANT - ARCHITECTURE SPECIFICATION

## System Diagram

```
[ Frontend: React + TypeScript + Vite UI ]
       |
       |  (REST API / JSON / Multipart Image Upload)
       v
[ Backend: Node.js + Express Server ]
   |---> [ SQLite Database (better-sqlite3) ]
   |---> [ Gemini Vision Provider (@google/genai SDK) ]
   |---> [ Technical Indicator Engine (Math / OHLC) ]
   |---> [ Candlestick Recognition Engine (Rules) ]
   |---> [ Explainable Signal Fusion Engine (CALL/PUT/WAIT) ]
   |---> [ Strategy Backtesting Engine ]
   |---> [ Conversational Voice Assistant ]
```

## Modular Responsibilities

1. **`server.ts`**: Express application routing REST endpoints, file uploads, static Vite SPA hosting, and API middleware.
2. **`server/db.ts`**: SQLite schema management for `analysis_history`, `user_settings`, and `backtest_results`.
3. **`server/indicators.ts`**: Pure mathematical calculations for EMA, SMA, RSI, MACD, ATR, ADX, Bollinger Bands, Supertrend, and Support/Resistance swing detection.
4. **`server/candlesticks.ts`**: Mathematical ratio pattern recognition for 16 candlestick formations.
5. **`server/geminiVision.ts`**: Multimodal vision analysis interface utilizing Google Gemini Vision with strict JSON schema response enforce.
6. **`server/signalEngine.ts`**: Explainable signal intelligence fusion combining vision metrics, indicator consensus, candlestick matches, and multi-timeframe alignment.
7. **`server/voiceAssistant.ts`**: Conversational voice assistant module.
8. **`server/backtester.ts`**: Historical strategy simulator calculating win rate, profit factor, expectancy, drawdown, and payout break-even win rate.
9. **`electron/main.ts` & `preload.ts`**: Electron desktop application container with context isolation and secure IPC bridge.
