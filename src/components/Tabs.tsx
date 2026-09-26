"use client";

import Link from "next/link";
import Image from "next/image";
import type { Store } from "@/lib/apitic/types";

type Props = { value: string; stores: Store[] };

const UE_STORE_IDS = new Set(["endoume"]);

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
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {it.label}
            {UE_STORE_IDS.has(it.id) && (
              <Image
                src="/uber-eats.avif"
                alt="Uber Eats"
                width={14}
                height={14}
                style={{ borderRadius: 3, flexShrink: 0 }}
              />
            )}
          </span>
          {value === it.id && <span className="lm-tab-ind" />}
        </Link>
      ))}
    </div>
  );
}
