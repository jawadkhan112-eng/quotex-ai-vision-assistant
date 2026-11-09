# QUOTEX AI VISION ASSISTANT

**Advanced AI-Powered Quotex Chart Vision Analysis Terminal**

Quotex AI Vision Assistant is a professional software solution engineered for quantitative chart analysis. It fuses multimodal vision AI screenshot evaluation, deterministic candlestick rule recognition, and real mathematical technical indicator calculations to output explainable trading signals (`CALL`, `PUT`, or `WAIT`).

---

## Key Features

1. **AI Vision Chart Analysis**: Examines uploaded Quotex chart screenshots for candlestick wicks, momentum, trend slope, visible support/resistance, and rejection clues using Google Gemini Vision.
2. **Authorized Live Screen Capture**: User-directed WebRTC screen sharing with explicit start/pause/stop controls for frame-by-frame AI analysis.
3. **Mathematical Indicator Engine**: Real calculations for EMA (9/21/50), SMA (20/50/200), RSI (14), MACD (12/26/9), ATR (14), ADX (14), Bollinger Bands (20,2), and Supertrend on genuine OHLC data.
4. **Deterministic Candlestick Engine**: Automated mathematical ratio checks for 16 classic candlestick patterns (Engulfing, Hammer, Shooting Star, Doji, Marubozu, Morning/Evening Star, Three Soldiers/Crows).
5. **Explainable Signal Fusion Engine**: Outputs `CALL`, `PUT`, or `WAIT` with non-guaranteed Evidence Quality Scores (0-100%), supporting reasons, opposing risk factors, and invalidation points. `WAIT` is strictly enforced as the default when evidence is insufficient or conflicting.
6. **AI Talkable Voice Assistant**: Conversational assistant with Speech-to-Text and Text-to-Speech capabilities for chart analysis questions.
7. **SQLite History Database**: Persistent storage for analysis history with search, filtering, CSV export, and record deletion.
8. **Strategy Backtester**: Simulates strategy performance on historical OHLC candles with win rate, drawdown, expectancy, profit factor, and break-even payout analysis.
9. **Windows Desktop & Web Dashboard**: Full Electron desktop wrapper with NSIS installer configuration and web dashboard support.

---

## Quick Start Guide

### Prerequisites
- Node.js (v18+)
- npm or pnpm

### Environment Setup
1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Add your Gemini API Key in `.env`:
   ```env
   GEMINI_API_KEY="your_actual_gemini_api_key"
   ```

### Running the Full-Stack Terminal
```bash
# Install dependencies
npm install

# Start full-stack web terminal & API backend
npm run dev
```
Navigate to `http://localhost:3000` in your web browser.

### Running Automated Tests
```bash
npm test
```

### Packaging Windows Installer
```bash
# Package NSIS Windows EXE installer
npm run package:windows
```

---

## Strict Operational Boundaries
- **Analysis Only**: This software is strictly an analysis assistant.
- **No Automated Execution**: Never executes trades automatically, clicks broker buttons, or bypasses logins/OTPs.
- **No Guaranteed Profits**: Evidence score is a technical confluence score, NOT a win rate guarantee.
