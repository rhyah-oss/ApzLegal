import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    status: "ok",
    app: "lexora",
    phase: 1,
    mode: "mock",
  });
}
