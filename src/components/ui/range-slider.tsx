"use client";

import * as React from "react";

type RangeSliderProps = {
  min: number;
  max: number;
  step?: number;
  value: [number, number];
  onChange: (next: [number, number]) => void;
  format?: (v: number) => string;
  className?: string;
};

export function RangeSlider({ min, max, step = 1, value, onChange, format, className = "" }: RangeSliderProps) {
  const [minVal, maxVal] = value;
  const handleMin = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Math.min(Number(e.target.value), maxVal);
    onChange([v, maxVal]);
  };
  const handleMax = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Math.max(Number(e.target.value), minVal);
    onChange([minVal, v]);
  };
  const fmt = (n: number) => (format ? format(n) : String(n));

  const percent = (n: number) => ((n - min) / (max - min)) * 100;

  return (
    <div className={`w-full ${className}`}>
      <div className="relative h-2 rounded bg-white/15">
        <div
          className="absolute h-2 rounded bg-accent/70"
          style={{ left: `${percent(minVal)}%`, right: `${100 - percent(maxVal)}%` }}
        />
        {/* Inputs overlay */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={minVal}
          onChange={handleMin}
          className="absolute inset-0 w-full appearance-none bg-transparent pointer-events-auto"
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={maxVal}
          onChange={handleMax}
          className="absolute inset-0 w-full appearance-none bg-transparent pointer-events-auto"
        />
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-foreground/70">
        <span>{fmt(minVal)}</span>
        <span>{fmt(maxVal)}</span>
      </div>
    </div>
  );
}

export default RangeSlider;

