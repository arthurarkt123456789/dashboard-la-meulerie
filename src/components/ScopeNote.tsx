type Props = {
  scopeStores: number;
  totalStores: number;
  excludedStores: string[];
};

export function ScopeNote({ scopeStores, totalStores, excludedStores }: Props) {
  return (
    <div className="lm-scope-note" style={{ gridColumn: "1 / -1" }}>
      <span className="lm-scope-dot" />
      <span>
        Comparaison N-1 calculée à <b>périmètre constant</b> sur {scopeStores}{" "}
        magasin{scopeStores > 1 ? "s" : ""} sur {totalStores}.
        {excludedStores.length > 0 && (
          <>
            {" "}
            Exclu{excludedStores.length > 1 ? "s" : ""} :{" "}
            <b>{excludedStores.join(", ")}</b> (ouverture récente).
          </>
        )}
      </span>
    </div>
  );
}
