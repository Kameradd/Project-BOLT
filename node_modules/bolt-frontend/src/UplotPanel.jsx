import { useEffect, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

const PLOT_HEIGHT = 260;

const createPlotOptions = (channelLabel, width, lineColor) => ({
  width,
  height: PLOT_HEIGHT,
  title: `BOLT Telemetry ${channelLabel}`,
  scales: {
    x: { time: true },
    y: { auto: true }
  },
  axes: [
    {
      stroke: "#6b7280",
      grid: { stroke: "#1f2937" }
    },
    {
      stroke: "#6b7280",
      grid: { stroke: "#1f2937" }
    }
  ],
  series: [{}, { label: channelLabel, stroke: lineColor, width: 2 }]
});

const UplotPanel = ({ telemetryRef, channelLabel, lineColor = "#22d3ee" }) => {
  const containerRef = useRef(null);
  const plotRef = useRef(null);
  const rafRef = useRef(null);
  const lastRenderedLengthRef = useRef(0);
  const lastRenderedXRef = useRef(null);
  const lastRenderedYRef = useRef(null);
  const frameCountRef = useRef(0);
  const lastFpsSampleAtRef = useRef(0);
  const fpsStatsRef = useRef({ min: Infinity, max: 0, avg: 0, samples: 0 });
  const lastPerfLogAtRef = useRef(0);
  const heapStartRef = useRef(null);

  const updatePerfStats = (now) => {
    frameCountRef.current += 1;

    if (lastFpsSampleAtRef.current === 0) {
      lastFpsSampleAtRef.current = now;
      return;
    }

    const elapsedMs = now - lastFpsSampleAtRef.current;
    if (elapsedMs < 1000) {
      return;
    }

    const fps = (frameCountRef.current * 1000) / elapsedMs;
    frameCountRef.current = 0;
    lastFpsSampleAtRef.current = now;

    const stats = fpsStatsRef.current;
    stats.min = Math.min(stats.min, fps);
    stats.max = Math.max(stats.max, fps);
    stats.samples += 1;
    stats.avg = stats.avg + (fps - stats.avg) / stats.samples;

    const memory = performance?.memory;
    if (memory && typeof memory.usedJSHeapSize === "number") {
      if (heapStartRef.current === null) {
        heapStartRef.current = memory.usedJSHeapSize;
      }

      const heapCurrentMb = memory.usedJSHeapSize / 1024 / 1024;
      const heapDeltaMb = (memory.usedJSHeapSize - heapStartRef.current) / 1024 / 1024;

      window.__boltPerf = {
        fpsCurrent: Number(fps.toFixed(2)),
        fpsAvg: Number(stats.avg.toFixed(2)),
        fpsMin: Number(stats.min.toFixed(2)),
        fpsMax: Number(stats.max.toFixed(2)),
        heapMb: Number(heapCurrentMb.toFixed(2)),
        heapDeltaMb: Number(heapDeltaMb.toFixed(2)),
        timestamp: Date.now()
      };
    } else {
      window.__boltPerf = {
        fpsCurrent: Number(fps.toFixed(2)),
        fpsAvg: Number(stats.avg.toFixed(2)),
        fpsMin: Number(stats.min.toFixed(2)),
        fpsMax: Number(stats.max.toFixed(2)),
        heapMb: null,
        heapDeltaMb: null,
        timestamp: Date.now()
      };
    }

    if (lastPerfLogAtRef.current === 0 || now - lastPerfLogAtRef.current >= 5000) {
      lastPerfLogAtRef.current = now;
      const perf = window.__boltPerf;
      const heapText =
        perf.heapMb === null
          ? "heap=n/a"
          : `heap=${perf.heapMb}MB delta=${perf.heapDeltaMb}MB`;
      console.info(
        `[BOLT PERF] fps=${perf.fpsCurrent} avg=${perf.fpsAvg} min=${perf.fpsMin} max=${perf.fpsMax} ${heapText}`
      );
    }
  };

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const initialWidth = Math.max(340, Math.floor(containerRef.current.clientWidth || 520));
    plotRef.current = new uPlot(
      createPlotOptions(channelLabel, initialWidth, lineColor),
      [[], []],
      containerRef.current
    );

    const handleResize = () => {
      if (!plotRef.current || !containerRef.current) {
        return;
      }
      const width = Math.max(340, Math.floor(containerRef.current.clientWidth || 520));
      plotRef.current.setSize({ width, height: PLOT_HEIGHT });
    };

    window.addEventListener("resize", handleResize);

    const renderFrame = (now) => {
      const data = telemetryRef.current;
      const ySeries = data.channels?.[channelLabel] || [];
      if (plotRef.current && data.x.length > 1 && ySeries.length > 1) {
        const latestIndex = Math.min(data.x.length, ySeries.length) - 1;
        const latestX = data.x[latestIndex];
        const latestY = ySeries[latestIndex];
        const hasNewPoint =
          latestIndex + 1 !== lastRenderedLengthRef.current ||
          latestX !== lastRenderedXRef.current ||
          latestY !== lastRenderedYRef.current;

        if (hasNewPoint) {
          plotRef.current.setData([data.x, ySeries]);
          lastRenderedLengthRef.current = latestIndex + 1;
          lastRenderedXRef.current = latestX;
          lastRenderedYRef.current = latestY;
        }
      }

      updatePerfStats(now);
      rafRef.current = requestAnimationFrame(renderFrame);
    };

    rafRef.current = requestAnimationFrame(renderFrame);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      window.removeEventListener("resize", handleResize);
      lastRenderedLengthRef.current = 0;
      lastRenderedXRef.current = null;
      lastRenderedYRef.current = null;
      if (plotRef.current) {
        plotRef.current.destroy();
      }
      window.__boltPerf = undefined;
    };
  }, [channelLabel, lineColor, telemetryRef]);

  return <div ref={containerRef} />;
};

export default UplotPanel;
