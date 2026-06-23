import { useState, useMemo } from "react";
import { useAppStore } from "../../stores/appStore";
import { RotateCcw, SlidersHorizontal, ChevronDown } from "lucide-react";

export function FilterPanel() {
  const { filter, setFilter, resetFilter, photos } = useAppStore();

  const { cameraModels, lensModels } = useMemo(() => {
    const cams = [...new Set(photos.map(p => p.cameraModel).filter(Boolean))].sort();
    const lenses = [...new Set(photos.map(p => p.lensModel).filter(Boolean))].sort();
    return { cameraModels: cams, lensModels: lenses };
  }, [photos]);

  const maxIso = Math.max(...photos.map((p) => p.iso), 25600);
  const maxFocal = Math.max(...photos.map((p) => p.focalLength), 400);
  const maxAperture = Math.max(...photos.map((p) => p.aperture), 32);

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

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-surface-200/40 dark:border-surface-200/20 shrink-0">
        <div className="flex items-center gap-1.5">
          <SlidersHorizontal size={13} className="text-surface-400" />
          <span className="text-xs font-semibold text-surface-500 uppercase tracking-wider">筛选器</span>
        </div>
        {hasActiveFilter && (
          <button
            onClick={resetFilter}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full hover:bg-surface-200/50 dark:hover:bg-surface-200/30 text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 transition-all text-2xs font-medium"
          >
            <RotateCcw size={10} />
            重置
          </button>
        )}
      </div>

      <div className="py-2 px-2.5 space-y-1.5">
        {/* Rating — always visible */}
        <FilterGroup title="评分" defaultOpen>
          <div className="flex gap-1">
            {[0, 1, 2, 3, 4, 5].map((r) => (
              <button
                key={r}
                onClick={() => setFilter({ ratingMin: r === filter.ratingMin ? 0 : r })}
                className={`flex-1 px-1.5 py-1 rounded-lg text-2xs font-medium transition-all duration-200 ${
                  filter.ratingMin === r
                    ? "bg-accent-500 text-white shadow-sm shadow-accent-500/20"
                    : "bg-surface-100/60 dark:bg-surface-100/30 text-surface-500 hover:bg-surface-200/50 dark:hover:bg-surface-200/30"
                }`}
              >
                {r === 0 ? "全部" : "★".repeat(r)}
              </button>
            ))}
          </div>
        </FilterGroup>

        {/* Flag + Color — compact row */}
        <FilterGroup title="标记">
          <div className="flex gap-1.5 mb-2">
            {[
              { label: "全部", value: "" },
              { label: "Pick", value: "pick" },
              { label: "Reject", value: "reject" },
            ].map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter({ flag: filter.flag === f.value ? "" : f.value })}
                className={`flex-1 px-1.5 py-1 rounded-lg text-2xs font-medium transition-all duration-200 ${
                  filter.flag === f.value
                    ? "bg-accent-500 text-white shadow-sm shadow-accent-500/20"
                    : "bg-surface-100/60 dark:bg-surface-100/30 text-surface-500 hover:bg-surface-200/50 dark:hover:bg-surface-200/30"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {[
              { label: "红", value: "red", color: "#ef4444" },
              { label: "蓝", value: "blue", color: "#3b82f6" },
              { label: "绿", value: "green", color: "#22c55e" },
              { label: "黄", value: "yellow", color: "#eab308" },
              { label: "紫", value: "purple", color: "#a855f7" },
            ].map((c) => (
              <button
                key={c.value}
                onClick={() => {
                  const labels = filter.colorLabels.includes(c.value)
                    ? filter.colorLabels.filter((l) => l !== c.value)
                    : [...filter.colorLabels, c.value];
                  setFilter({ colorLabels: labels });
                }}
                className={`w-6 h-6 rounded-full transition-all duration-200 ${
                  filter.colorLabels.includes(c.value)
                    ? "scale-110 ring-2 ring-surface-800 dark:ring-white shadow-sm"
                    : "opacity-40 hover:opacity-70 hover:scale-105"
                }`}
                style={{ backgroundColor: c.color }}
                title={c.label}
              />
            ))}
          </div>
        </FilterGroup>

        {/* Camera models */}
        {cameraModels.length > 0 && (
          <FilterGroup title={`相机 (${cameraModels.length})`}>
            <div className="space-y-0.5 max-h-28 overflow-auto">
              {cameraModels.map((model) => (
                <label key={model} className="flex items-center gap-2 cursor-pointer text-surface-600 dark:text-surface-400 hover:text-surface-800 dark:hover:text-surface-200 py-0.5 transition-colors">
                  <input
                    type="checkbox"
                    checked={filter.cameraModels.includes(model)}
                    onChange={(e) => {
                      const models = e.target.checked
                        ? [...filter.cameraModels, model]
                        : filter.cameraModels.filter((m) => m !== model);
                      setFilter({ cameraModels: models });
                    }}
                    className="custom-checkbox"
                  />
                  <span className="truncate text-xs font-medium">{model}</span>
                </label>
              ))}
            </div>
          </FilterGroup>
        )}

        {/* Lens models */}
        {lensModels.length > 0 && (
          <FilterGroup title={`镜头 (${lensModels.length})`}>
            <div className="space-y-0.5 max-h-28 overflow-auto">
              {lensModels.map((lens) => (
                <label key={lens} className="flex items-center gap-2 cursor-pointer text-surface-600 dark:text-surface-400 hover:text-surface-800 dark:hover:text-surface-200 py-0.5 transition-colors">
                  <input
                    type="checkbox"
                    checked={filter.lensModels.includes(lens)}
                    onChange={(e) => {
                      const lenses = e.target.checked
                        ? [...filter.lensModels, lens]
                        : filter.lensModels.filter((l) => l !== lens);
                      setFilter({ lensModels: lenses });
                    }}
                    className="custom-checkbox"
                  />
                  <span className="truncate text-xs font-medium">{lens}</span>
                </label>
              ))}
            </div>
          </FilterGroup>
        )}

        {/* Range inputs — clean number pairs */}
        <FilterGroup title="焦距">
          <RangeInput min={0} max={maxFocal} value={[filter.focalLengthMin, filter.focalLengthMax]} unit="mm"
            onChange={([min, max]) => setFilter({ focalLengthMin: min, focalLengthMax: max })} />
        </FilterGroup>

        <FilterGroup title="光圈">
          <RangeInput min={0} max={maxAperture} value={[filter.apertureMin, filter.apertureMax]} unit="f/"
            onChange={([min, max]) => setFilter({ apertureMin: min, apertureMax: max })} />
        </FilterGroup>

        <FilterGroup title="ISO">
          <RangeInput min={0} max={maxIso} value={[filter.isoMin, filter.isoMax]} step={100}
            onChange={([min, max]) => setFilter({ isoMin: min, isoMax: max })} />
        </FilterGroup>
      </div>
    </div>
  );
}

/* Collapsible filter group */
function FilterGroup({ title, children, defaultOpen }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-1.5 py-1 text-2xs font-semibold text-surface-400 uppercase tracking-wider hover:text-surface-600 dark:hover:text-surface-300 transition-colors"
      >
        <ChevronDown size={11} className={`transition-transform duration-200 ${open ? "" : "-rotate-90"}`} />
        {title}
      </button>
      {open && <div className="mt-1">{children}</div>}
    </div>
  );
}

function RangeInput({
  min,
  max,
  step = 1,
  value,
  unit,
  onChange,
}: {
  min: number;
  max: number;
  step?: number;
  value: [number, number];
  unit?: string;
  onChange: (value: [number, number]) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1 flex-1">
        <input
          type="number"
          min={min}
          max={value[1]}
          step={step}
          value={value[0]}
          onChange={(e) => {
            const v = Math.max(min, Math.min(Number(e.target.value), value[1]));
            onChange([v, value[1]]);
          }}
          className="w-full min-w-0 bg-surface-100/60 dark:bg-surface-100/30 border border-surface-200/60 dark:border-surface-200/30 rounded-lg px-2 py-1 text-xs text-surface-700 dark:text-surface-300 text-center outline-none focus:border-accent-400/50 focus:shadow-[0_0_0_2px_rgba(14,165,233,0.1)] transition-all [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      </div>
      <span className="text-surface-300 dark:text-surface-500 text-xs font-medium">—</span>
      <div className="flex items-center gap-1 flex-1">
        <input
          type="number"
          min={value[0]}
          max={max}
          step={step}
          value={value[1]}
          onChange={(e) => {
            const v = Math.min(max, Math.max(Number(e.target.value), value[0]));
            onChange([value[0], v]);
          }}
          className="w-full min-w-0 bg-surface-100/60 dark:bg-surface-100/30 border border-surface-200/60 dark:border-surface-200/30 rounded-lg px-2 py-1 text-xs text-surface-700 dark:text-surface-300 text-center outline-none focus:border-accent-400/50 focus:shadow-[0_0_0_2px_rgba(14,165,233,0.1)] transition-all [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      </div>
      {unit && <span className="text-2xs text-surface-400 font-medium shrink-0 w-6">{unit}</span>}
    </div>
  );
}
