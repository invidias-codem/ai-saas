// app/api/video/signed-url/route.ts
import { NextResponse } from "next/server";
import { auth as getClerkAuth } from "@clerk/nextjs/server";
import { Storage } from "@google-cloud/storage";
import { z } from "zod";

// Initialize GCS Storage client
// Relies on GOOGLE_APPLICATION_CREDENTIALS env var
const storage = new Storage();

// Zod schema for input validation
const requestSchema = z.object({
  gcsUri: z.string().startsWith("gs://", { message: "Invalid GCS URI format." }),
});

export async function POST(req: Request) {
  let gcsUri: string | undefined = undefined;
  try {
    // 1. Clerk Authentication
    const { userId } = getClerkAuth();
    if (!userId) {
      return new NextResponse(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
    }

    // 2. Input Validation
    const body = await req.json();
    const validation = requestSchema.safeParse(body);
    if (!validation.success) {
      return new NextResponse(JSON.stringify({ error: "Invalid input.", details: validation.error.flatten().fieldErrors }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    gcsUri = validation.data.gcsUri;
    console.log("Requesting signed URL for:", gcsUri);

    // 3. Parse GCS URI
    const uriParts = gcsUri.replace("gs://", "").split("/");
    const bucketName = uriParts.shift(); // First part is the bucket name
    const objectName = uriParts.join("/"); // The rest is the object path

    if (!bucketName || !objectName) {
      throw new Error("Could not parse bucket name or object name from GCS URI.");
    }

    // 4. Generate Signed URL
    const options = {
      version: 'v4' as 'v4', // Specify the version
      action: 'read' as 'read', // Allow reading the file
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes expiration
    };

    const [signedUrl] = await storage
      .bucket(bucketName)
      .file(objectName)
      .getSignedUrl(options);

    console.log("Generated signed URL for:", gcsUri);

    // 5. Return Signed URL
    return NextResponse.json({ signedUrl });

  } catch (error: any) {
    console.error(`[SIGNED_URL_ERROR] GCS URI: "${gcsUri || 'N/A'}" | Error:`, error.message);
    return new NextResponse(JSON.stringify({
      error: "Failed to generate signed URL",
      details: error.message || "An unknown error occurred"
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}