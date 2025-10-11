"use client";

import * as React from "react";

type SliderProps = {
  min?: number;
  max?: number;
  step?: number;
  value: number[]; // support 1 or 2 thumbs
  onValueChange?: (val: number[]) => void;
  className?: string;
};

export function Slider({ min = 0, max = 100, step = 1, value, onValueChange, className = "" }: SliderProps) {
  const [v0, v1] = (value.length === 2 ? (value as [number, number]) : [value[0] ?? min, value[0] ?? min]);
  const handleMin = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = Number(e.target.value);
    const next = Math.min(raw, v1);
    onValueChange?.(value.length === 2 ? [next, v1] : [next]);
  };
  const handleMax = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = Number(e.target.value);
    const next = Math.max(raw, v0);
    onValueChange?.([v0, next]);
  };
  const percent = (n: number) => ((n - min) / (Math.max(1e-9, max - min))) * 100;

  const leftPct = percent(v0);
  const rightPct = 100 - percent(v1);

  return (
    <div className={`w-full ${className}`}>
      <div className="relative h-2 rounded bg-white/15">
        <div className="absolute h-2 rounded bg-accent/70" style={{ left: `${leftPct}%`, right: `${rightPct}%` }} />
        {/* Min thumb: restrict clickable width up to current max */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={v0}
          onChange={handleMin}
          className="absolute top-0 bottom-0 appearance-none bg-transparent"
          style={{ left: 0, right: `${rightPct}%`, width: "auto" }}
        />
        {value.length === 2 && (
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={v1}
            onChange={handleMax}
            className="absolute top-0 bottom-0 appearance-none bg-transparent"
            style={{ left: `${leftPct}%`, right: 0, width: "auto" }}
          />
        )}
      </div>
    </div>
  );
}

export default Slider;
