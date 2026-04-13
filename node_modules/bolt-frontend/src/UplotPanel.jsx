import { useEffect, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

const PLOT_HEIGHT = 260;
const WHEEL_ZOOM_FACTOR = 1.15;

const createPlotOptions = (plotTitle, width, channelLabels, lineColors, onXScaleSet) => ({
  width,
  height: PLOT_HEIGHT,
  title: `BOLT Telemetry ${plotTitle}`,
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
  series: [
    {},
    ...channelLabels.map((label, index) => ({
      label,
      stroke: lineColors[index] || "#22d3ee",
      width: 2
    }))
  ],
  hooks: {
    setScale: [
      (plot, key) => {
        if (key !== "x") {
          return;
        }
        onXScaleSet(plot.scales.x.min, plot.scales.x.max);
      }
    ]
  }
});

const UplotPanel = ({ telemetryRef, plotTitle, channelLabels, lineColors, perfEnabled = false }) => {
  const containerRef = useRef(null);
  const plotRef = useRef(null);
  const rafRef = useRef(null);
  const userZoomedRef = useRef(false);
  const fullRangeRef = useRef({ min: null, max: null });
  const internalScaleUpdateRef = useRef(false);
  const lastRenderedLengthRef = useRef(0);
  const lastRenderedXRef = useRef(null);
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

    const handleXScaleSet = (scaleMin, scaleMax) => {
      if (internalScaleUpdateRef.current) {
        return;
      }

      const fullMin = fullRangeRef.current.min;
      const fullMax = fullRangeRef.current.max;
      if (
        !Number.isFinite(fullMin) ||
        !Number.isFinite(fullMax) ||
        !Number.isFinite(scaleMin) ||
        !Number.isFinite(scaleMax)
      ) {
        return;
      }

      const fullRange = fullMax - fullMin;
      const epsilon = Math.max(0.001, fullRange * 0.002);
      const atFullRange =
        Math.abs(scaleMin - fullMin) <= epsilon && Math.abs(scaleMax - fullMax) <= epsilon;
      userZoomedRef.current = !atFullRange;
    };

    const initialWidth = Math.max(240, Math.floor(containerRef.current.clientWidth || 520));
    plotRef.current = new uPlot(
      createPlotOptions(plotTitle, initialWidth, channelLabels, lineColors, handleXScaleSet),
      [[], ...channelLabels.map(() => [])],
      containerRef.current
    );

    const applySize = () => {
      if (!plotRef.current || !containerRef.current) {
        return;
      }
      const width = Math.max(240, Math.floor(containerRef.current.clientWidth || 520));
      plotRef.current.setSize({ width, height: PLOT_HEIGHT });
    };

    const handleWheel = (event) => {
      if (!plotRef.current || !containerRef.current) {
        return;
      }

      const plot = plotRef.current;
      const fullMin = fullRangeRef.current.min;
      const fullMax = fullRangeRef.current.max;
      if (!Number.isFinite(fullMin) || !Number.isFinite(fullMax) || fullMax <= fullMin) {
        return;
      }

      const xScale = plot.scales.x;
      const xMin = xScale.min;
      const xMax = xScale.max;
      if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || xMax <= xMin) {
        return;
      }

      if (!event.ctrlKey) {
        return;
      }

      event.preventDefault();

      const rect = containerRef.current.getBoundingClientRect();
      const relX = event.clientX - rect.left - plot.bbox.left;
      if (relX < 0 || relX > plot.bbox.width) {
        return;
      }

      const cursorValue = plot.posToVal(relX, "x");
      if (!Number.isFinite(cursorValue)) {
        return;
      }

      const range = xMax - xMin;
      const fullRange = fullMax - fullMin;
      const ratio = (cursorValue - xMin) / range;
      const zoomIn = event.deltaY < 0;
      const factor = zoomIn ? 1 / WHEEL_ZOOM_FACTOR : WHEEL_ZOOM_FACTOR;
      let nextRange = range * factor;

      const minRange = Math.max(0.2, fullRange / 120);
      nextRange = Math.max(minRange, Math.min(fullRange, nextRange));

      let nextMin = cursorValue - (ratio * nextRange);
      let nextMax = nextMin + nextRange;

      if (nextMin < fullMin) {
        nextMin = fullMin;
        nextMax = nextMin + nextRange;
      }

      if (nextMax > fullMax) {
        nextMax = fullMax;
        nextMin = nextMax - nextRange;
      }

      const epsilon = Math.max(0.001, fullRange * 0.002);
      const atFullRange =
        Math.abs(nextMin - fullMin) <= epsilon && Math.abs(nextMax - fullMax) <= epsilon;

      userZoomedRef.current = !atFullRange;
      internalScaleUpdateRef.current = true;
      plot.setScale("x", { min: nextMin, max: nextMax });
      internalScaleUpdateRef.current = false;
    };

    const handleDoubleClick = () => {
      const fullMin = fullRangeRef.current.min;
      const fullMax = fullRangeRef.current.max;
      if (!plotRef.current || !Number.isFinite(fullMin) || !Number.isFinite(fullMax)) {
        return;
      }

      userZoomedRef.current = false;
      internalScaleUpdateRef.current = true;
      plotRef.current.setScale("x", { min: fullMin, max: fullMax });
      internalScaleUpdateRef.current = false;
    };

    containerRef.current.addEventListener("wheel", handleWheel, { passive: false });
    containerRef.current.addEventListener("dblclick", handleDoubleClick);

    let resizeObserver = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => applySize());
      resizeObserver.observe(containerRef.current);
    } else {
      window.addEventListener("resize", applySize);
    }

    const renderFrame = (now) => {
      const data = telemetryRef.current;
      const channelSeries = channelLabels.map((channel) => data.channels?.[channel] || []);
      const minLength = Math.min(data.x.length, ...channelSeries.map((series) => series.length));

      if (plotRef.current && minLength > 1) {
        const latestIndex = minLength - 1;
        const latestX = data.x[latestIndex];
        const hasNewPoint =
          latestIndex + 1 !== lastRenderedLengthRef.current ||
          latestX !== lastRenderedXRef.current;

        if (hasNewPoint) {
          const allAligned = minLength === data.x.length;
          const xSeries = allAligned ? data.x : data.x.slice(-minLength);
          const plotSeries = allAligned
            ? channelSeries
            : channelSeries.map((series) => series.slice(-minLength));
          const fullMin = xSeries[0];
          const fullMax = xSeries[xSeries.length - 1];
          const oldFullMax = fullRangeRef.current.max;
          fullRangeRef.current = { min: fullMin, max: fullMax };

          if (!userZoomedRef.current) {
            plotRef.current.setData([xSeries, ...plotSeries], true);
          } else {
            const xScale = plotRef.current.scales.x;
            let currentMin = xScale.min;
            let currentMax = xScale.max;

            // Auto-scroll the zoom window forward if it was bound to the live right-edge
            if (oldFullMax !== null && Number.isFinite(oldFullMax) && currentMax >= oldFullMax - 0.5) {
              const delta = fullMax - oldFullMax;
              currentMin += delta;
              currentMax += delta;
            }

            internalScaleUpdateRef.current = true;
            plotRef.current.setData([xSeries, ...plotSeries], false);
            internalScaleUpdateRef.current = false;

            if (Number.isFinite(currentMin) && Number.isFinite(currentMax) && currentMax > currentMin) {
              let nextMin = currentMin;
              let nextMax = currentMax;

              if (nextMin < fullMin) {
                const width = nextMax - nextMin;
                nextMin = fullMin;
                nextMax = nextMin + width;
              }

              if (nextMax > fullMax) {
                const width = nextMax - nextMin;
                nextMax = fullMax;
                nextMin = nextMax - width;
              }

              if (nextMax > nextMin) {
                internalScaleUpdateRef.current = true;
                plotRef.current.setScale("x", { min: nextMin, max: nextMax });
                internalScaleUpdateRef.current = false;
              }
            }
          }
          lastRenderedLengthRef.current = latestIndex + 1;
          lastRenderedXRef.current = latestX;
        }
      }

      if (perfEnabled) {
        updatePerfStats(now);
      }
      rafRef.current = requestAnimationFrame(renderFrame);
    };

    rafRef.current = requestAnimationFrame(renderFrame);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      if (resizeObserver) {
        resizeObserver.disconnect();
      } else {
        window.removeEventListener("resize", applySize);
      }
      if (containerRef.current) {
        containerRef.current.removeEventListener("wheel", handleWheel);
        containerRef.current.removeEventListener("dblclick", handleDoubleClick);
      }
      userZoomedRef.current = false;
      fullRangeRef.current = { min: null, max: null };
      internalScaleUpdateRef.current = false;
      lastRenderedLengthRef.current = 0;
      lastRenderedXRef.current = null;
      if (plotRef.current) {
        plotRef.current.destroy();
      }
      if (perfEnabled) {
        window.__boltPerf = undefined;
      }
    };
  }, [channelLabels, lineColors, perfEnabled, plotTitle, telemetryRef]);

  return <div ref={containerRef} />;
};

export default UplotPanel;
