import { useEffect, useMemo, useRef, useState } from "react";

/** Lumiloop — Kandi Pattern Maker (mobile-first, safe-guards)
 *  - Square / even-count peyote
 *  - Pencil / Eraser / Eyedropper / Fill
 *  - Palette + color picker
 *  - Zoom, Fit, Clear
 *  - PNG + JSON export/import
 *  - LocalStorage autosave
 */

type Stitch = "square" | "peyote";
type Tool = "pencil" | "eraser" | "eyedropper" | "fill";
type Color = string | null;

type PatternData = {
  title: string;
  width: number;
  height: number;
  cell: number;
  stitch: Stitch;
  grid: Color[][];
  palette: string[];
};

const DEFAULT_PALETTE = [
  "#000000",
  "#ffffff",
  "#ff007a",
  "#ffca3a",
  "#8aff00",
  "#57e1ff",
  "#7b61ff",
  "#ff9b00",
  "#b6ffea",
  "#ffd6e0",
];

const LS_KEY = "lumiloop-kandi-v2";

const makeRow = (w: number, fill: Color = null) =>
  Array.from({ length: w }, () => fill);
const makeGrid = (w: number, h: number, fill: Color = null) =>
  Array.from({ length: h }, () => makeRow(w, fill));
const cloneGrid = (g: Color[][]) => g.map((r) => r.slice());
const eq = (a: Color, b: Color) => (a ?? null) === (b ?? null);

export default function App() {
  // ---------- state ----------
  const [data, setData] = useState<PatternData>(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) return JSON.parse(raw) as PatternData;
    } catch {}
    return {
      title: "Untitled Pattern",
      width: 32,
      height: 10,
      cell: 22,
      stitch: "peyote",
      grid: makeGrid(32, 10, null),
      palette: DEFAULT_PALETTE,
    };
  });
  const [tool, setTool] = useState<Tool>("pencil");
  const [color, setColor] = useState("#ff007a");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const DPR = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

  // ---------- derived ----------
  const offsetForRow = (r: number) =>
    data.stitch === "peyote" && r % 2 === 1 ? data.cell / 2 : 0;

  const pixelWidth =
    data.stitch === "peyote"
      ? data.width * data.cell + data.cell / 2
      : data.width * data.cell;
  const pixelHeight = data.height * data.cell;

  // ---------- persist ----------
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(data));
    } catch {}
  }, [data]);

  // ---------- draw ----------
  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return; // guard
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // size for DPR
    canvas.width = Math.max(1, Math.floor(pixelWidth * DPR));
    canvas.height = Math.max(1, Math.floor(pixelHeight * DPR));
    canvas.style.width = `${pixelWidth}px`;
    canvas.style.height = `${pixelHeight}px`;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    // bg
    ctx.clearRect(0, 0, pixelWidth, pixelHeight);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, pixelWidth, pixelHeight);

    // grid + fills
    for (let r = 0; r < data.height; r++) {
      const off = offsetForRow(r);
      for (let c = 0; c < data.width; c++) {
        const x = c * data.cell + off;
        const y = r * data.cell;
        const v = data.grid[r][c];

        ctx.strokeStyle = "#e5e7eb";
        ctx.lineWidth = 1;
        ctx.strokeRect(
          Math.floor(x) + 0.5,
          Math.floor(y) + 0.5,
          data.cell,
          data.cell
        );

        if (v) {
          ctx.fillStyle = v;
          ctx.fillRect(x + 1, y + 1, data.cell - 1, data.cell - 1);
        }
      }
    }
  };

  useEffect(draw, [data.grid, data.cell, data.width, data.height, data.stitch]); // safe to run post-mount

  // ---------- pointer -> cell ----------
  function pointToCell(clientX: number, clientY: number) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) * DPR;
    const y = (clientY - rect.top) * DPR;
    const row = Math.floor(y / (data.cell * DPR));
    if (row < 0 || row >= data.height) return null;
    const off = offsetForRow(row);
    const col = Math.floor((x / DPR - off) / data.cell);
    if (col < 0 || col >= data.width) return null;
    return { row, col };
  }

  function applyToolAt(row: number, col: number) {
    setData((prev) => {
      const next = { ...prev, grid: cloneGrid(prev.grid) };
      if (tool === "pencil") next.grid[row][col] = color;
      else if (tool === "eraser") next.grid[row][col] = null;
      else if (tool === "eyedropper") {
        const v = next.grid[row][col];
        if (v) setColor(v);
      } else if (tool === "fill") {
        const target = next.grid[row][col] ?? null;
        if (eq(target, color)) return prev;
        const q: Array<[number, number]> = [[row, col]];
        const seen = new Set<string>();
        while (q.length) {
          const [r, c] = q.pop()!;
          const k = r + "," + c;
          if (seen.has(k)) continue;
          seen.add(k);
          if (r < 0 || r >= prev.height || c < 0 || c >= prev.width) continue;
          if (!eq(next.grid[r][c] ?? null, target)) continue;
          next.grid[r][c] = color;
          q.push([r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]);
        }
      }
      return next;
    });
  }

  // ---------- pointer events ----------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return; // guard

    const onDown = (e: PointerEvent) => {
      drawingRef.current = true;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {}
      const hit = pointToCell(e.clientX, e.clientY);
      if (hit) applyToolAt(hit.row, hit.col);
    };
    const onMove = (e: PointerEvent) => {
      if (!drawingRef.current) return;
      const hit = pointToCell(e.clientX, e.clientY);
      if (hit && (tool === "pencil" || tool === "eraser"))
        applyToolAt(hit.row, hit.col);
    };
    const onUp = (e: PointerEvent) => {
      drawingRef.current = false;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {}
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [tool, color, data.cell, data.width, data.height, data.stitch]); // guards inside

  // ---------- actions ----------
  const clearAll = () =>
    setData((p) => ({ ...p, grid: makeGrid(p.width, p.height, null) }));

  const fitToScreen = () => {
    const parent = canvasRef.current?.parentElement;
    if (!parent) return;
    const max = Math.min(parent.clientWidth - 16, window.innerWidth - 16);
    const cell = Math.max(
      8,
      Math.floor(
        max / (data.stitch === "peyote" ? data.width + 0.5 : data.width)
      )
    );
    setData((p) => ({ ...p, cell }));
  };

  const exportPNG = () => {
    const c = canvasRef.current;
    if (!c) return;
    const url = c.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data.title || "pattern"}.png`;
    a.click();
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data.title || "pattern"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onImportJSON = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as PatternData;
        if (!parsed.grid || !Array.isArray(parsed.grid))
          throw new Error("bad file");
        setData(parsed);
      } catch {
        alert("Invalid pattern file.");
      }
    };
    reader.readAsText(file);
  };

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const row of data.grid)
      for (const v of row) if (v) m.set(v, (m.get(v) || 0) + 1);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [data.grid]);

  // ---------- UI ----------
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col">
      {/* Header */}
      <header className="px-3 py-3 flex items-center justify-between gap-3 border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold">Lumiloop</span>
          <span className="hidden sm:inline text-slate-400">· Kandi Maker</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-1.5 rounded-md border text-sm hover:bg-slate-100"
            onClick={exportPNG}
          >
            PNG
          </button>
          <button
            className="px-3 py-1.5 rounded-md border text-sm hover:bg-slate-100"
            onClick={exportJSON}
          >
            JSON
          </button>
          <label className="px-3 py-1.5 rounded-md border text-sm hover:bg-slate-100 cursor-pointer">
            Import
            <input
              type="file"
              accept="application/json"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onImportJSON(f);
                e.currentTarget.value = "";
              }}
              className="hidden"
            />
          </label>
        </div>
      </header>

      {/* Canvas */}
      <main className="p-3 pb-28">
        <div className="max-w-full overflow-auto border rounded-lg bg-white p-2 shadow-sm">
          <canvas ref={canvasRef} className="block mx-auto touch-none" />
        </div>
      </main>

      {/* Bottom toolbar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-slate-200 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2 justify-between">
          {/* Tools */}
          <div className="flex items-center gap-1">
            {(["pencil", "eraser", "eyedropper", "fill"] as Tool[]).map((t) => (
              <button
                key={t}
                onClick={() => setTool(t)}
                className={`px-3 py-1.5 rounded-md border text-sm ${
                  tool === t ? "bg-slate-900 text-white" : "hover:bg-slate-100"
                }`}
                title={t}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Palette */}
          <div className="flex items-center gap-1 overflow-x-auto">
            {data.palette.map((p) => (
              <button
                key={p}
                onClick={() => setColor(p)}
                className="h-7 w-7 rounded-md border border-slate-300"
                style={{ background: p }}
                title={p}
              />
            ))}
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-7 w-10 rounded-md border p-0"
              title="Pick color"
            />
          </div>

          {/* Zoom / Fit / Stitch / Clear */}
          <div className="flex items-center gap-1">
            <button
              className="px-2 py-1.5 rounded-md border text-sm hover:bg-slate-100"
              onClick={() =>
                setData((p) => ({ ...p, cell: Math.max(6, p.cell - 2) }))
              }
            >
              −
            </button>
            <div className="px-2 text-sm tabular-nums">{data.cell}</div>
            <button
              className="px-2 py-1.5 rounded-md border text-sm hover:bg-slate-100"
              onClick={() =>
                setData((p) => ({ ...p, cell: Math.min(48, p.cell + 2) }))
              }
            >
              +
            </button>

            <button
              className="px-3 py-1.5 rounded-md border text-sm hover:bg-slate-100"
              onClick={fitToScreen}
            >
              Fit
            </button>

            <select
              className="px-2 py-1.5 rounded-md border text-sm"
              value={data.stitch}
              onChange={(e) =>
                setData((p) => ({ ...p, stitch: e.target.value as Stitch }))
              }
            >
              <option value="peyote">Peyote (even)</option>
              <option value="square">Square</option>
            </select>

            <button
              className="px-3 py-1.5 rounded-md border text-sm hover:bg-slate-100"
              onClick={clearAll}
            >
              Clear
            </button>
          </div>
        </div>

        {/* Dimensions + counts */}
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-1">
            W:
            <input
              type="number"
              min={2}
              max={200}
              value={data.width}
              onChange={(e) => {
                const w = Math.max(
                  2,
                  Math.min(200, parseInt(e.target.value || "0"))
                );
                setData((p) => {
                  const grid = p.grid.map((row) => {
                    const r = row.slice(0, w);
                    while (r.length < w) r.push(null);
                    return r;
                  });
                  return { ...p, width: w, grid };
                });
              }}
              className="w-14 px-1 py-0.5 rounded border"
            />
          </div>
          <div className="flex items-center gap-1">
            H:
            <input
              type="number"
              min={2}
              max={200}
              value={data.height}
              onChange={(e) => {
                const h = Math.max(
                  2,
                  Math.min(200, parseInt(e.target.value || "0"))
                );
                setData((p) => {
                  const grid = cloneGrid(p.grid).slice(0, h);
                  while (grid.length < h) grid.push(makeRow(p.width, null));
                  return { ...p, height: h, grid };
                });
              }}
              className="w-14 px-1 py-0.5 rounded border"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto">
            {counts.map(([c, n]) => (
              <div key={c} className="flex items-center gap-1">
                <span
                  className="inline-block h-3 w-3 rounded-sm border"
                  style={{ background: c }}
                />
                <span>{n}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-1 text-[10px] text-slate-400">
          Tap & drag to draw • Fill floods connected cells • Eyedropper picks a
          color
        </div>
      </div>
    </div>
  );
}
