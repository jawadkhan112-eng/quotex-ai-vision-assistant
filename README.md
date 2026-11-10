# Quotex Algorithmic Trading Terminal

A local-first technical-analysis terminal for chart-frame and price-series analysis. It produces deterministic `CALL`, `PUT`, or `WAIT` signals from RSI(14), Bollinger Bands, candle body/wick ratios, momentum, and optional local pixel diagnostics.

No provider accounts, API keys, remote model calls, or automated trade execution are used.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`, share a chart only when you choose, then select **Run Algorithmic Analysis**. Screen pixels are processed by the local application endpoint.

## Verify

```bash
npm test
npm run build
```

## Operational boundary

The terminal is for technical analysis only. It does not place trades and does not guarantee outcomes.
