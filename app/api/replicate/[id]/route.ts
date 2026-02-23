
import { NextResponse } from "next/server";
import Replicate from "replicate";
import { env } from "@/lib/env";

const replicate = new Replicate({
  auth: env.REPLICATE_API_TOKEN_VIDEO, // Use your Replicate token
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return new NextResponse(JSON.stringify({ error: "ID is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const prediction = await replicate.predictions.get(id);

    if (prediction.status === "failed") {
      return new NextResponse(JSON.stringify({ error: prediction.error }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return NextResponse.json(prediction);
  } catch (error: any) {
    console.error("[REPLICATE_GET_ERROR]", error);
    const errorMessage = error.message || "An unknown error occurred";
    return new NextResponse(
      JSON.stringify({
        error: "Internal Server Error",
        details: errorMessage,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
