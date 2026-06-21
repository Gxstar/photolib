import { useAppStore } from "../../stores/appStore";
import { X, RotateCcw } from "lucide-react";
import { useState, useMemo } from "react";

export function FilterPanel() {
  const { filter, setFilter, resetFilter, photos } = useAppStore();

  // 从实际照片中动态取可选值
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
      <div className="flex items-center justify-between px-3 py-2 border-b border-surface-800 shrink-0">
        <span className="text-[11px] font-semibold text-surface-400 uppercase tracking-wider">筛选器</span>
        {hasActiveFilter && (
          <button
            onClick={resetFilter}
            className="p-1 rounded hover:bg-surface-700 text-surface-400 hover:text-surface-200 transition-colors"
            title="重置筛选"
          >
            <RotateCcw size={12} />
          </button>
        )}
      </div>

      <div className="overflow-auto py-2 px-3 space-y-3 text-[11px]">
        {/* 评分 */}
        <FilterSection title="评分">
          <div className="flex gap-0.5">
            {[0, 1, 2, 3, 4, 5].map((r) => (
              <button
                key={r}
                onClick={() => setFilter({ ratingMin: r === filter.ratingMin ? 0 : r })}
                className={`px-1.5 py-0.5 rounded transition-colors ${
                  filter.ratingMin === r
                    ? "bg-accent-500/30 text-accent-300"
                    : "text-surface-400 hover:bg-surface-700"
                }`}
              >
                {r === 0 ? "全部" : "≥" + "★".repeat(r)}
              </button>
            ))}
          </div>
        </FilterSection>

        {/* 相机型号 — 只有照片含数据时才显示 */}
        {cameraModels.length > 0 && (
          <FilterSection title={`相机 (${cameraModels.length})`}>
            <div className="space-y-0.5 max-h-32 overflow-auto">
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

        {/* 镜头 */}
        {lensModels.length > 0 && (
          <FilterSection title={`镜头 (${lensModels.length})`}>
            <div className="space-y-0.5 max-h-32 overflow-auto">
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

        {/* 焦距 */}
        <FilterSection title={`焦距: ${filter.focalLengthMin}-${filter.focalLengthMax}mm`}>
          <RangeSlider
            min={0}
            max={maxFocal}
            value={[filter.focalLengthMin, filter.focalLengthMax]}
            onChange={([min, max]) => setFilter({ focalLengthMin: min, focalLengthMax: max })}
          />
        </FilterSection>

        {/* 光圈 */}
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

        {/* 旗标 */}
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
                className={`px-2 py-0.5 rounded transition-colors ${
                  filter.flag === f.value
                    ? "bg-accent-500/30 text-accent-300"
                    : "text-surface-400 hover:bg-surface-700"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </FilterSection>

        {/* 色标 */}
        <FilterSection title="色标">
          <div className="flex gap-1.5">
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
                className={`w-5 h-5 rounded-full border-2 transition-all ${
                  filter.colorLabels.includes(c.value)
                    ? "border-white scale-110"
                    : "border-transparent opacity-50 hover:opacity-80"
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
      <label className="text-[10px] text-surface-500 uppercase tracking-wider block mb-1">{title}</label>
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
    <label className="flex items-center gap-1.5 cursor-pointer text-surface-300 hover:text-surface-100">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-3 h-3 rounded border-surface-600 bg-surface-800 accent-accent-500"
      />
      <span className="truncate">{label}</span>
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
