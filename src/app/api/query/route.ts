import { NextResponse } from "next/server";
import { runKnowledgeSpineQuery } from "@/lib/query-engine";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = await runKnowledgeSpineQuery(body);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const status =
      typeof error === "object" && error && "status" in error && typeof (error as { status?: unknown }).status === "number"
        ? ((error as { status: number }).status ?? 500)
        : 500;

    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        error: status === 404 ? "NOT_FOUND" : "QUERY_FAILED",
        details: message,
      },
      { status },
    );
  }
}
