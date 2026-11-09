import React, { useState, useEffect } from 'react';
import { Flame, CheckCircle2, ShieldAlert, BookOpen, AlertCircle } from 'lucide-react';

interface CandlestickPatternsViewProps {
  selectedSymbol: string;
  selectedTimeframe: string;
}

const PATTERN_LIBRARY = [
  {
    name: 'Bullish Engulfing',
    type: 'BULLISH',
    reliability: 'HIGH',
    rule: 'Prior bearish candle followed by a large bullish candle whose body completely engulfs the prior body.',
    confirmation: 'Must occur at support zone or lower Bollinger band.',
  },
  {
    name: 'Bearish Engulfing',
    type: 'BEARISH',
    reliability: 'HIGH',
    rule: 'Prior bullish candle followed by a large bearish candle whose body completely engulfs the prior body.',
    confirmation: 'Must occur at resistance zone or upper Bollinger band.',
  },
  {
    name: 'Hammer',
    type: 'BULLISH',
    reliability: 'HIGH',
    rule: 'Small body near top of range with lower wick at least 2x the body length, minimal upper wick.',
    confirmation: 'Rejection of lower price during active downtrend.',
  },
  {
    name: 'Shooting Star',
    type: 'BEARISH',
    reliability: 'HIGH',
    rule: 'Small body near bottom of range with upper wick at least 2x body length, minimal lower wick.',
    confirmation: 'Rejection of higher price at resistance level.',
  },
  {
    name: 'Doji',
    type: 'NEUTRAL',
    reliability: 'MEDIUM',
    rule: 'Open and close prices are virtually identical (body <= 10% of total candle height).',
    confirmation: 'Signals indecision. Requires next candle confirmation.',
  },
  {
    name: 'Morning Star',
    type: 'BULLISH',
    reliability: 'HIGH',
    rule: '3-candle pattern: Long bearish -> Small body star -> Strong bullish candle closing > 50% of first candle.',
    confirmation: 'Strong bullish trend reversal signal.',
  },
  {
    name: 'Evening Star',
    type: 'BEARISH',
    reliability: 'HIGH',
    rule: '3-candle pattern: Long bullish -> Small body star -> Strong bearish candle closing < 50% of first candle.',
    confirmation: 'Strong bearish trend reversal signal.',
  },
];

export const CandlestickPatternsView: React.FC<CandlestickPatternsViewProps> = ({
  selectedSymbol,
  selectedTimeframe,
}) => {
  const [detectedPatterns, setDetectedPatterns] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/analyze-technical', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: selectedSymbol, timeframe: selectedTimeframe }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.candlestickPatterns) {
          setDetectedPatterns(data.candlestickPatterns);
        }
      })
      .catch((err) => console.error(err));
  }, [selectedSymbol, selectedTimeframe]);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="border-b border-slate-800 pb-4">
        <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <Flame className="w-5 h-5 text-amber-400" /> Candlestick Recognition Engine
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Deterministic mathematical candlestick pattern evaluation engine with body-to-wick ratio validation.
        </p>
      </div>

      {/* Live Detected Patterns Card */}
      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
        <h3 className="font-semibold text-sm text-slate-200 flex items-center justify-between">
          <span>Active Chart Detected Patterns ({detectedPatterns.length})</span>
          <span className="text-xs font-mono text-cyan-400">{selectedSymbol} · {selectedTimeframe}</span>
        </h3>

        {detectedPatterns.length === 0 ? (
          <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-500 text-center">
            No active pattern detected on current candles slice.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {detectedPatterns.map((pat, idx) => (
              <div key={idx} className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs text-slate-100">{pat.patternName}</span>
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                      pat.type === 'BULLISH'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : pat.type === 'BEARISH'
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}
                  >
                    {pat.type} · RELIABILITY: {pat.reliability}
                  </span>
                </div>
                <p className="text-xs text-slate-400">{pat.description}</p>
                <div className="text-[11px] font-mono text-slate-500 pt-1">
                  Invalidation Level: <span className="text-cyan-300">{pat.invalidationLevel}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Candlestick Pattern Rulebook Reference */}
      <div className="space-y-3">
        <h3 className="font-semibold text-sm text-slate-200 flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-cyan-400" /> Pattern Recognition Rulebook
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {PATTERN_LIBRARY.map((item, idx) => (
            <div key={idx} className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-xs text-slate-100">{item.name}</span>
                <span className="text-[10px] font-mono text-slate-400">{item.type}</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">{item.rule}</p>
              <div className="text-[11px] text-slate-500 border-t border-slate-800 pt-2 flex items-center gap-1">
                <AlertCircle className="w-3 h-3 text-cyan-400 shrink-0" />
                <span>{item.confirmation}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
