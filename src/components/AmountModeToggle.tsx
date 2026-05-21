"use client";

export type AmountMode = "HT" | "TTC";

type Props = {
  value: AmountMode;
  onChange: (m: AmountMode) => void;
};

export function AmountModeToggle({ value, onChange }: Props) {
  return (
    <div className="lm-segmented lm-segmented-sm" aria-label="Mode TVA">
      <button
        className={"lm-seg-btn " + (value === "HT" ? "active" : "")}
        onClick={() => onChange("HT")}
        title="Montants hors taxes"
      >
        HT
      </button>
      <button
        className={"lm-seg-btn " + (value === "TTC" ? "active" : "")}
        onClick={() => onChange("TTC")}
        title="Montants toutes taxes comprises"
      >
        TTC
      </button>
    </div>
  );
}
