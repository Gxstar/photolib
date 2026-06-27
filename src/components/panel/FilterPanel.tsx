import { useState, useMemo } from "react";
import { useAppStore } from "../../stores/appStore";
import type { Photo } from "../../types";
import { RotateCcw, SlidersHorizontal, ChevronDown, Star, Flag, Camera, Settings2 } from "lucide-react";

const labelColors: Record<string, string> = {
  red: "#ef4444", blue: "#3b82f6", green: "#22c55e",
  yellow: "#eab308", purple: "#a855f7",
};

const labelNames: Record<string, string> = {
  red: "红", blue: "蓝", green: "绿", yellow: "黄", purple: "紫",
};

export function FilterPanel({ activePhotos }: { activePhotos?: Photo[] }) {
  const { filter, setFilter, resetFilter, photos } = useAppStore();
  const sourcePhotos = activePhotos ?? photos;

  const { cameraModels, lensModels } = useMemo(() => {
    const cams = [...new Set(sourcePhotos.map(p => p.cameraModel).filter(Boolean))].sort();
    const lenses = [...new Set(sourcePhotos.map(p => p.lensModel).filter(Boolean))].sort();
    return { cameraModels: cams, lensModels: lenses };
  }, [sourcePhotos]);

  const maxIso = Math.max(...sourcePhotos.map((p) => p.iso), 25600);
  const maxFocal = Math.max(...sourcePhotos.map((p) => p.focalLength), 400);
  const maxAperture = Math.max(...sourcePhotos.map((p) => p.aperture), 32);

  const hasActiveFilter =
    filter.cameraModels.length > 0 ||
    filter.lensModels.length > 0 ||
    filter.focalLengthMin > 0 ||
    filter.focalLengthMax < maxFocal ||
    filter.apertureMin > 0 ||
    filter.apertureMax < maxAperture ||
    filter.isoMin > 0 ||
    filter.isoMax < maxIso ||
    filter.ratingMin > 0 ||
    filter.colorLabels.length > 0 ||
    filter.flag !== "" ||
    filter.searchText !== "";

  // Build active filter pills
  const activePills: { label: string; onRemove: () => void }[] = [];
  if (filter.ratingMin > 0) {
    activePills.push({
      label: `≥ ${'★'.repeat(filter.ratingMin)}`,
      onRemove: () => setFilter({ ratingMin: 0 }),
    });
  }
  if (filter.flag === "pick") {
    activePills.push({ label: "Pick", onRemove: () => setFilter({ flag: "" }) });
  } else if (filter.flag === "reject") {
    activePills.push({ label: "Reject", onRemove: () => setFilter({ flag: "" }) });
  }
  for (const c of filter.colorLabels) {
    activePills.push({ label: labelNames[c] || c, onRemove: () => {
      setFilter({ colorLabels: filter.colorLabels.filter(l => l !== c) });
    }});
  }
  if (filter.focalLengthMin > 0 || filter.focalLengthMax < maxFocal) {
    activePills.push({ label: `焦距 ${filter.focalLengthMin}-${filter.focalLengthMax}mm`, onRemove: () => setFilter({ focalLengthMin: 0, focalLengthMax: maxFocal }) });
  }
  if (filter.apertureMin > 0 || filter.apertureMax < maxAperture) {
    activePills.push({ label: `光圈 f/${filter.apertureMin}-${filter.apertureMax}`, onRemove: () => setFilter({ apertureMin: 0, apertureMax: maxAperture }) });
  }
  if (filter.isoMin > 0 || filter.isoMax < maxIso) {
    activePills.push({ label: `ISO ${filter.isoMin}-${filter.isoMax}`, onRemove: () => setFilter({ isoMin: 0, isoMax: maxIso }) });
  }
  for (const m of filter.cameraModels) {
    activePills.push({ label: m.length > 20 ? `${m.slice(0, 18)}…` : m, onRemove: () => {
      setFilter({ cameraModels: filter.cameraModels.filter(x => x !== m) });
    }});
  }
  for (const m of filter.lensModels) {
    activePills.push({ label: m.length > 20 ? `${m.slice(0, 18)}…` : m, onRemove: () => {
      setFilter({ lensModels: filter.lensModels.filter(x => x !== m) });
    }});
  }

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-surface-200/40 dark:border-surface-200/20 shrink-0">
        <div className="flex items-center gap-1.5">
          <SlidersHorizontal size={13} className="text-surface-400" />
          <span className="text-xs font-semibold text-surface-500 uppercase tracking-wider">筛选器</span>
          {activePills.length > 0 && (
            <span className="text-2xs font-medium text-accent-500 bg-accent-500/10 px-1.5 py-0.5 rounded-full tabular-nums">{activePills.length}</span>
          )}
        </div>
        {hasActiveFilter && (
          <button onClick={resetFilter}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full hover:bg-surface-200/50 dark:hover:bg-surface-200/30 text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 transition-all text-2xs font-medium">
            <RotateCcw size={10} />重置
          </button>
        )}
      </div>

      {/* Active filter pills */}
      {activePills.length > 0 && (
        <div className="flex flex-wrap gap-1 px-2.5 pt-2 pb-1 border-b border-surface-200/30 dark:border-surface-200/15">
          {activePills.slice(0, 6).map((pill, i) => (
            <span key={i}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-medium bg-accent-500/10 text-accent-600 dark:text-accent-400 border border-accent-500/20">
              {pill.label}
              <button onClick={pill.onRemove} className="hover:text-accent-800 dark:hover:text-accent-200 transition-colors leading-none">
                ×
              </button>
            </span>
          ))}
          {activePills.length > 6 && (
            <span className="text-2xs text-surface-400 px-1">+{activePills.length - 6}</span>
          )}
        </div>
      )}

      <div className="py-2 px-2.5 space-y-3">

        {/* ========== 快速标记 ========== */}
        <FilterGroup title="快速标记" icon={<Flag size={11} />} defaultOpen>
          {/* Rating stars row */}
          <div className="flex items-center gap-1 mb-2">
            <span className="text-2xs text-surface-400 w-8 shrink-0">评分</span>
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((r) => (
                <button
                  key={r}
                  onClick={() => setFilter({ ratingMin: filter.ratingMin === r ? 0 : r })}
                  className={`p-0.5 transition-all duration-150 ${filter.ratingMin >= r ? "scale-105" : "opacity-40 hover:opacity-70"}`}
                >
                  <Star size={14} className={filter.ratingMin >= r ? "text-yellow-500 fill-yellow-500 drop-shadow-[0_0_3px_rgba(234,179,8,0.3)]" : "text-surface-400"} />
                </button>
              ))}
            </div>
            {filter.ratingMin > 0 && (
              <button onClick={() => setFilter({ ratingMin: 0 })} className="text-2xs text-surface-400 hover:text-surface-600 ml-1">清除</button>
            )}
          </div>

          {/* Flag + Color row */}
          <div className="flex items-center gap-1">
            <span className="text-2xs text-surface-400 w-8 shrink-0">标记</span>
            <div className="flex gap-1 bg-surface-100/50 dark:bg-surface-100/30 rounded-lg p-0.5">
              {[
                { label: "All", value: "", icon: null },
                { label: "P", value: "pick", color: "#22c55e" },
                { label: "R", value: "reject", color: "#ef4444" },
              ].map((f) => (
                <button
                  key={f.value}
                  onClick={() => setFilter({ flag: filter.flag === f.value ? "" : f.value })}
                  className={`px-2 py-0.5 rounded-md text-2xs font-medium transition-all ${
                    filter.flag === f.value
                      ? "bg-white dark:bg-surface-0 text-surface-700 dark:text-surface-300 shadow-sm"
                      : "text-surface-400 hover:text-surface-600"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5 ml-2">
              {(["red", "blue", "green", "yellow", "purple"] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    const labels = filter.colorLabels.includes(c)
                      ? filter.colorLabels.filter(l => l !== c)
                      : [...filter.colorLabels, c];
                    setFilter({ colorLabels: labels });
                  }}
                  className="w-4 h-4 rounded-full transition-all duration-200"
                  style={{
                    backgroundColor: labelColors[c],
                    boxShadow: filter.colorLabels.includes(c) ? `0 0 0 2px ${labelColors[c]}, 0 0 0 3.5px var(--surface-0)` : "none",
                    opacity: filter.colorLabels.includes(c) ? 1 : 0.35,
                  }}
                />
              ))}
            </div>
          </div>
        </FilterGroup>

        {/* ========== 拍摄参数 ========== */}
        <FilterGroup title="拍摄参数" icon={<Settings2 size={11} />}>
          <div className="space-y-1.5">
            <RangeRow label="焦距" min={0} max={maxFocal} step={1} value={[filter.focalLengthMin, filter.focalLengthMax]} unit="mm"
              onChange={([min, max]) => setFilter({ focalLengthMin: min, focalLengthMax: max })} />
            <RangeRow label="光圈" min={0} max={maxAperture} step={0.1} value={[filter.apertureMin, filter.apertureMax]} unit="f/"
              onChange={([min, max]) => setFilter({ apertureMin: min, apertureMax: max })} />
            <RangeRow label="ISO" min={0} max={maxIso} step={100} value={[filter.isoMin, filter.isoMax]}
              onChange={([min, max]) => setFilter({ isoMin: min, isoMax: max })} />
          </div>
        </FilterGroup>

        {/* ========== 设备 ========== */}
        {(cameraModels.length > 0 || lensModels.length > 0) && (
          <FilterGroup title="设备" icon={<Camera size={11} />}>
            {cameraModels.length > 0 && (
              <div className="mb-2">
                <div className="text-2xs font-medium text-surface-400 mb-1">相机 ({cameraModels.length})</div>
                <div className="flex flex-wrap gap-1">
                  {cameraModels.map((model) => {
                    const active = filter.cameraModels.includes(model);
                    return (
                      <button key={model}
                        onClick={() => setFilter({
                          cameraModels: active
                            ? filter.cameraModels.filter(m => m !== model)
                            : [...filter.cameraModels, model]
                        })}
                        className={`px-2 py-0.5 rounded-full text-2xs font-medium transition-all ${
                          active
                            ? "bg-accent-500 text-white shadow-sm shadow-accent-500/20"
                            : "bg-surface-100/60 dark:bg-surface-100/30 text-surface-600 dark:text-surface-400 hover:bg-surface-200/50 dark:hover:bg-surface-200/30"
                        }`}
                      >
                        {model}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {lensModels.length > 0 && (
              <div>
                <div className="text-2xs font-medium text-surface-400 mb-1">镜头 ({lensModels.length})</div>
                <div className="flex flex-wrap gap-1">
                  {lensModels.map((lens) => {
                    const active = filter.lensModels.includes(lens);
                    return (
                      <button key={lens}
                        onClick={() => setFilter({
                          lensModels: active
                            ? filter.lensModels.filter(m => m !== lens)
                            : [...filter.lensModels, lens]
                        })}
                        className={`px-2 py-0.5 rounded-full text-2xs font-medium transition-all ${
                          active
                            ? "bg-accent-500 text-white shadow-sm shadow-accent-500/20"
                            : "bg-surface-100/60 dark:bg-surface-100/30 text-surface-600 dark:text-surface-400 hover:bg-surface-200/50 dark:hover:bg-surface-200/30"
                        }`}
                      >
                        {lens}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </FilterGroup>
        )}

      </div>
    </div>
  );
}

// ==================== Components ====================

function FilterGroup({ title, children, icon, defaultOpen }: { title: string; children: React.ReactNode; icon?: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="bg-surface-100/30 dark:bg-surface-100/15 rounded-xl border border-surface-200/30 dark:border-surface-200/15 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-2xs font-semibold text-surface-500 uppercase tracking-wider hover:bg-surface-100/40 dark:hover:bg-surface-100/20 transition-colors"
      >
        <ChevronDown size={10} className={`transition-transform duration-200 ${open ? "" : "-rotate-90"}`} />
        {icon}
        {title}
      </button>
      {open && <div className="px-2.5 pb-2.5 pt-1">{children}</div>}
    </div>
  );
}

function RangeRow({
  label, min, max, step = 1, value, unit,
  onChange,
}: {
  label: string; min: number; max: number; step?: number;
  value: [number, number]; unit?: string;
  onChange: (value: [number, number]) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-2xs text-surface-400 font-medium w-8 shrink-0">{label}</span>
      <input
        type="number" min={min} max={value[1]} step={step} value={value[0]}
        onChange={(e) => { const v = Math.max(min, Math.min(Number(e.target.value), value[1])); onChange([v, value[1]]); }}
        className="w-full min-w-0 bg-surface-100/60 dark:bg-surface-100/30 border border-surface-200/60 dark:border-surface-200/30 rounded-lg px-1.5 py-1 text-xs text-surface-700 dark:text-surface-300 text-center outline-none focus:border-accent-400/50 focus:shadow-[0_0_0_2px_rgba(14,165,233,0.1)] transition-all [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <span className="text-surface-300 dark:text-surface-500 text-xs font-medium shrink-0">—</span>
      <input
        type="number" min={value[0]} max={max} step={step} value={value[1]}
        onChange={(e) => { const v = Math.min(max, Math.max(Number(e.target.value), value[0])); onChange([value[0], v]); }}
        className="w-full min-w-0 bg-surface-100/60 dark:bg-surface-100/30 border border-surface-200/60 dark:border-surface-200/30 rounded-lg px-1.5 py-1 text-xs text-surface-700 dark:text-surface-300 text-center outline-none focus:border-accent-400/50 focus:shadow-[0_0_0_2px_rgba(14,165,233,0.1)] transition-all [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      {unit && <span className="text-2xs text-surface-400 font-medium shrink-0 w-5">{unit}</span>}
    </div>
  );
}
