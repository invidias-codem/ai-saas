import { ImageResponse } from "next/og";

// Default Open Graph image for the whole site (homepage + any page without its own).
// This is what the Bluesky agent's shared links will render as a preview card.
export const runtime = "edge";
export const alt = "Lattice OS — Memory-native AI";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          background:
            "linear-gradient(135deg, #1e1b4b 0%, #4c1d95 45%, #312e81 100%)",
          padding: "80px",
          fontFamily: "sans-serif",
        }}
      >
        {/* Glow accents */}
        <div
          style={{
            position: "absolute",
            top: -120,
            right: -80,
            width: 480,
            height: 480,
            borderRadius: "9999px",
            background: "rgba(139,92,246,0.45)",
            filter: "blur(80px)",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -140,
            left: -60,
            width: 420,
            height: 420,
            borderRadius: "9999px",
            background: "rgba(99,102,241,0.4)",
            filter: "blur(80px)",
            display: "flex",
          }}
        />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            marginBottom: 40,
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              background:
                "linear-gradient(135deg, #818cf8 0%, #c084fc 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 36,
            }}
          >
            ◆
          </div>
          <span
            style={{
              fontSize: 36,
              fontWeight: 700,
              color: "white",
              letterSpacing: "-0.02em",
            }}
          >
            Lattice OS
          </span>
        </div>

        <div
          style={{
            fontSize: 76,
            fontWeight: 800,
            color: "white",
            lineHeight: 1.05,
            letterSpacing: "-0.03em",
            maxWidth: 980,
            display: "flex",
          }}
        >
          The memory-native AI layer for evolving projects
        </div>

        <div
          style={{
            fontSize: 32,
            color: "rgba(226,232,240,0.85)",
            marginTop: 32,
            maxWidth: 900,
            display: "flex",
          }}
        >
          Persistent context. Runtime routing. Build with continuity.
        </div>
      </div>
    ),
    { ...size }
  );
}
