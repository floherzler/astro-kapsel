"use client";

import Image from "next/image";
import { animate, motion, useMotionValue } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type SlideToLaunchProps = {
  onComplete?: () => void;
  className?: string;
};

const COMET_SIZE = 40;
const COMPLETE_THRESHOLD = 0.96;

export function SlideToLaunch({ onComplete, className = "" }: SlideToLaunchProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<ReturnType<typeof animate> | null>(null);
  const x = useMotionValue(0);
  const [maxX, setMaxX] = useState(0);
  const [progress, setProgress] = useState(0);
  const [, setIsComplete] = useState(false);

  const stopAnimation = useCallback(() => {
    animationRef.current?.stop();
    animationRef.current = null;
  }, []);

  const startAnimation = useCallback(
    (target: number) => {
      stopAnimation();
      animationRef.current = animate(x, target, {
        type: "spring",
        stiffness: 260,
        damping: 28,
        mass: 0.7,
      });
    },
    [stopAnimation, x],
  );

  const measureBounds = useCallback(() => {
    const node = trackRef.current;
    if (!node) return;
    const width = node.offsetWidth;
    setMaxX(Math.max(width - COMET_SIZE, 0));
  }, []);

  useEffect(() => {
    measureBounds();
    window.addEventListener("resize", measureBounds);
    return () => {
      window.removeEventListener("resize", measureBounds);
    };
  }, [measureBounds]);

  const triggerComplete = useCallback(() => {
    setIsComplete((prev) => {
      if (!prev) {
        onComplete?.();
      }
      return true;
    });
  }, [onComplete]);

  useEffect(() => {
    const unsub = x.on("change", (latest) => {
      if (maxX <= 0) {
        setProgress(0);
        return;
      }
      const ratio = Math.max(0, Math.min(1, latest / maxX));
      setProgress(ratio);
      if (ratio >= COMPLETE_THRESHOLD) {
        triggerComplete();
      }
    });
    return () => {
      unsub();
    };
  }, [maxX, triggerComplete, x]);

  useEffect(() => () => stopAnimation(), [stopAnimation]);

  const handleDragStart = useCallback(() => {
    stopAnimation();
    setIsComplete(false);
  }, [stopAnimation]);

  const handleDragEnd = useCallback(() => {
    const ratio = maxX > 0 ? x.get() / maxX : 0;
    if (ratio >= COMPLETE_THRESHOLD) {
      triggerComplete();
      startAnimation(maxX);
    } else {
      startAnimation(0);
    }
  }, [maxX, startAnimation, triggerComplete, x]);

  const tailStyles = useMemo(() => {
    const width = `calc(${progress * 100}% + ${COMET_SIZE * 0.65}px)`;
    const opacity = 0.32 + progress * 0.4;
    const blur = 9 + progress * 12;
    return { width, opacity, filter: `blur(${blur}px)` };
  }, [progress]);

  const highlightStyles = useMemo(() => {
    const width = `calc(${progress * 100}% + ${COMET_SIZE * 0.5}px)`;
    const opacity = 0.35 + progress * 0.4;
    const blur = 4 + progress * 6;
    return { width, opacity, filter: `blur(${blur}px)` };
  }, [progress]);

  const comaStyles = useMemo(() => {
    const size = 38 + progress * 48;
    const opacity = 0.4 + progress * 0.45;
    const translation = Math.sin(progress * Math.PI * 1.5) * 5;
    return {
      width: `${size}px`,
      height: `${size}px`,
      opacity,
      transform: `translate(-18%, -18%) scale(${1 + progress * 0.24}) translateX(${translation}px)`,
    };
  }, [progress]);

  const jetStyles = useMemo(() => {
    const width = 96 + progress * 170;
    const opacity = 0.22 + progress * 0.45;
    const height = 18 + progress * 26;
    return {
      width: `${width}px`,
      height: `${height}px`,
      opacity,
      transform: `translateY(-30%)`,
    };
  }, [progress]);

  const containerClasses = "relative z-10 flex w-full items-center";

  return (
    <div className={className ? `${containerClasses} ${className}` : containerClasses}>
      <div
        ref={trackRef}
        className="relative flex h-11 w-full items-center overflow-visible rounded-full border border-cyan-400/40 bg-black/45 px-1.5 shadow-[0_0_24px_rgba(56,189,248,0.22)] backdrop-blur"
      >
        <span
          className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_15%_50%,rgba(56,189,248,0.25),transparent_65%)] opacity-75"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-y-1.5 left-0 rounded-full bg-gradient-to-r from-cyan-400/30 via-cyan-300/25 to-transparent"
          style={tailStyles}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-y-[0.45rem] left-0 rounded-full bg-gradient-to-r from-cyan-100/80 via-white/70 to-transparent"
          style={highlightStyles}
          aria-hidden
        />
        <motion.div
          drag="x"
          dragElastic={0.04}
          dragMomentum={false}
          dragConstraints={{ left: 0, right: Math.max(maxX, 0) }}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          style={{ x, width: COMET_SIZE, height: COMET_SIZE }}
          className="relative z-5 flex cursor-pointer items-center justify-center rounded-full border border-cyan-300/60 bg-black/60 shadow-[0_0_28px_rgba(56,189,248,0.52)]"
        >
          <span
            className="pointer-events-none absolute -right-9 top-1/2 origin-left rounded-full bg-cyan-200/32 blur-3xl transition-transform duration-150 ease-out"
            style={jetStyles}
            aria-hidden
          />
          <span
            className="pointer-events-none absolute left-1/2 top-1/2 rounded-full bg-cyan-300/40 blur-3xl transition-transform duration-150 ease-out"
            style={comaStyles}
            aria-hidden
          />
          <span className="absolute inset-0 rounded-full bg-gradient-to-br from-cyan-400/25 via-cyan-200/10 to-transparent blur-2xl" aria-hidden />
          <Image
            src="/icons/comet.svg"
            alt="Comet icon"
            width={20}
            height={20}
            className="relative h-6 w-6 select-none drop-shadow-[0_0_14px_rgba(56,189,248,0.35)]"
            draggable={false}
            onDragStart={(event) => event.preventDefault()}
            priority
          />
        </motion.div>
      </div>
    </div>
  );
}

export default SlideToLaunch;
