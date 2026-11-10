# REST API Documentation

## `GET /api/health`

Returns the local terminal and database status.

## `POST /api/analyze-algorithmic`

Runs a deterministic local calculation. The JSON body accepts `symbol`, `timeframe`, a `prices` number array, optional OHLC `candles`, and an optional `{ width, height, pixels }` RGBA chart frame. The result includes the signal, confluence score, RSI(14), Bollinger-band position, wick/body diagnostics, momentum, and mathematical reasoning.

The endpoint makes no external requests and accepts no credentials.
