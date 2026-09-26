import { NextResponse, type NextRequest } from "next/server";
import {
  listUberEatsByMonth,
  parseUberEatsCSV,
  saveUberEatsRows,
} from "@/lib/uber-eats";

export const dynamic = "force-dynamic";

const STORE_ID = "endoume";

export async function POST(req: NextRequest) {
  try {
    const text = await req.text();
    if (!text) {
      return NextResponse.json({ error: "Corps de requête vide" }, { status: 400 });
    }
    const rows = parseUberEatsCSV(text);
    if (rows.length === 0) {
      return NextResponse.json({ error: "Aucune ligne valide trouvée dans le CSV" }, { status: 400 });
    }
    const { saved } = await saveUberEatsRows(STORE_ID, rows);
    const dates = rows.map((r) => r.date).sort();
    return NextResponse.json({
      ok: true,
      saved,
      from: dates[0],
      to: dates[dates.length - 1],
    });
  } catch (err) {
    const e = err as { message?: string };
    return NextResponse.json({ error: e.message ?? "Erreur inconnue" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const months = await listUberEatsByMonth(STORE_ID);
    return NextResponse.json({ months });
  } catch (err) {
    const e = err as { message?: string };
    return NextResponse.json({ error: e.message ?? "Erreur inconnue" }, { status: 500 });
  }
}
