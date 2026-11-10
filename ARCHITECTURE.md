# Quotex Algorithmic Trading Terminal Architecture

```
[ React + Vite terminal ]
           |
           | local JSON chart-frame/price payload
           v
[ Express /api/analyze-algorithmic ]
           |
           +--> RSI(14) + Bollinger calculation
           +--> Candle body/wick and momentum calculation
           +--> Optional local RGBA pixel diagnostics
           +--> Deterministic CALL / PUT / WAIT confluence
```

`server/algorithmicEngine.ts` is a pure local math module. The UI uses browser-managed screen sharing only after explicit user action; frame pixels are posted to the local application endpoint and are not sent to a provider. `server/db.ts` retains terminal history/storage support.
