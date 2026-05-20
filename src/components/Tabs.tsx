"use client";

import Link from "next/link";
import type { Store } from "@/lib/apitic/types";

type Props = { value: string; stores: Store[] };

export function Tabs({ value, stores }: Props) {
  const items = [
    { id: "all", label: "Vue consolidée" },
    ...stores.map((s) => ({ id: s.id, label: s.name })),
  ];
  return (
    <div className="lm-tabs">
      {items.map((it) => (
        <Link
          key={it.id}
          href={`/${it.id}`}
          className={"lm-tab " + (value === it.id ? "active" : "")}
          style={{ textDecoration: "none" }}
        >
          {it.label}
          {value === it.id && <span className="lm-tab-ind" />}
        </Link>
      ))}
    </div>
  );
}
