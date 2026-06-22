import { useAppStore } from "../../stores/appStore";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { useMemo } from "react";

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
    <div className="flex flex-col shrink-0 max-h-[45%]">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-surface-200 dark:border-surface-200 shrink-0">
        <div className="flex items-center gap-1.5">
          <SlidersHorizontal size={12} className="text-surface-400" />
          <span className="text-xs font-semibold text-surface-600 dark:text-surface-400 uppercase tracking-wider">筛选器</span>
        </div>
        {hasActiveFilter && (
          <button
            onClick={resetFilter}
            className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-surface-100 dark:hover:bg-surface-100 text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 transition-all text-2xs"
            title="重置筛选"
          >
            <RotateCcw size={10} />
            重置
          </button>
        )}
      </div>

      <div className="overflow-auto py-3 px-3 space-y-4 text-xs">
        {/* Rating */}
        <FilterSection title="评分">
          <div className="flex gap-1">
            {[0, 1, 2, 3, 4, 5].map((r) => (
              <button
                key={r}
                onClick={() => setFilter({ ratingMin: r === filter.ratingMin ? 0 : r })}
                className={`flex-1 px-1.5 py-1 rounded-md text-2xs font-medium transition-all duration-150 ${
                  filter.ratingMin === r
                    ? "bg-accent-500 text-white shadow-sm"
                    : "bg-surface-100 dark:bg-surface-100 text-surface-500 hover:bg-surface-200 dark:hover:bg-surface-200"
                }`}
              >
                {r === 0 ? "全部" : "★".repeat(r)}
              </button>
            ))}
          </div>
        </FilterSection>

        {/* Camera models */}
        {cameraModels.length > 0 && (
          <FilterSection title={`相机 (${cameraModels.length})`}>
            <div className="space-y-1 max-h-32 overflow-auto pr-1">
              {cameraModels.map((model) => (
                <CheckboxRow
                  key={model}
                  label={model}
                  checked={filter.cameraModels.includes(model)}
                  onChange={(checked) => {
                    const models = checked
                      ? [...filter.cameraModels, model]
                      : filter.cameraModels.filter((m) => m !== model);
                    setFilter({ cameraModels: models });
                  }}
                />
              ))}
            </div>
          </FilterSection>
        )}

        {/* Lens models */}
        {lensModels.length > 0 && (
          <FilterSection title={`镜头 (${lensModels.length})`}>
            <div className="space-y-1 max-h-32 overflow-auto pr-1">
              {lensModels.map((lens) => (
                <CheckboxRow
                  key={lens}
                  label={lens}
                  checked={filter.lensModels.includes(lens)}
                  onChange={(checked) => {
                    const lenses = checked
                      ? [...filter.lensModels, lens]
                      : filter.lensModels.filter((l) => l !== lens);
                    setFilter({ lensModels: lenses });
                  }}
                />
              ))}
            </div>
          </FilterSection>
        )}

        {/* Focal length */}
        <FilterSection title={`焦距: ${filter.focalLengthMin}-${filter.focalLengthMax}mm`}>
          <RangeSlider
            min={0}
            max={maxFocal}
            value={[filter.focalLengthMin, filter.focalLengthMax]}
            onChange={([min, max]) => setFilter({ focalLengthMin: min, focalLengthMax: max })}
          />
        </FilterSection>

        {/* Aperture */}
        <FilterSection title={`光圈: f/${filter.apertureMin}-f/${filter.apertureMax}`}>
          <RangeSlider
            min={0}
            max={maxAperture}
            value={[filter.apertureMin, filter.apertureMax]}
            onChange={([min, max]) => setFilter({ apertureMin: min, apertureMax: max })}
          />
        </FilterSection>

        {/* ISO */}
        <FilterSection title={`ISO: ${filter.isoMin}-${filter.isoMax}`}>
          <RangeSlider
            min={0}
            max={maxIso}
            step={100}
            value={[filter.isoMin, filter.isoMax]}
            onChange={([min, max]) => setFilter({ isoMin: min, isoMax: max })}
          />
        </FilterSection>

        {/* Flag */}
        <FilterSection title="旗标">
          <div className="flex gap-1">
            {[
              { label: "全部", value: "" },
              { label: "Pick", value: "pick" },
              { label: "Reject", value: "reject" },
            ].map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter({ flag: filter.flag === f.value ? "" : f.value })}
                className={`flex-1 px-2 py-1 rounded-md text-2xs font-medium transition-all duration-150 ${
                  filter.flag === f.value
                    ? "bg-accent-500 text-white shadow-sm"
                    : "bg-surface-100 dark:bg-surface-100 text-surface-500 hover:bg-surface-200 dark:hover:bg-surface-200"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </FilterSection>

        {/* Color labels */}
        <FilterSection title="色标">
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
                className={`w-6 h-6 rounded-full border-2 transition-all duration-150 ${
                  filter.colorLabels.includes(c.value)
                    ? "border-surface-800 dark:border-white scale-110 shadow-md"
                    : "border-transparent opacity-40 hover:opacity-70"
                }`}
                style={{ backgroundColor: c.color }}
                title={c.label}
              />
            ))}
          </div>
        </FilterSection>
      </div>
    </div>
  );
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-2xs font-semibold text-surface-400 uppercase tracking-wider block mb-1.5">{title}</label>
      {children}
    </div>
  );
}

function CheckboxRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer text-surface-600 dark:text-surface-400 hover:text-surface-800 dark:hover:text-surface-200 py-0.5 transition-colors">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="custom-checkbox"
      />
      <span className="truncate text-xs">{label}</span>
    </label>
  );
}

function RangeSlider({
  min,
  max,
  step = 1,
  value,
  onChange,
}: {
  min: number;
  max: number;
  step?: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
}) {
  return (
    <div className="flex gap-2 items-center">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value[0]}
        onChange={(e) => {
          const v = Number(e.target.value);
          onChange([Math.min(v, value[1]), value[1]]);
        }}
        className="filter-range flex-1"
      />
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value[1]}
        onChange={(e) => {
          const v = Number(e.target.value);
          onChange([value[0], Math.max(v, value[0])]);
        }}
        className="filter-range flex-1"
      />
    </div>
  );
}
