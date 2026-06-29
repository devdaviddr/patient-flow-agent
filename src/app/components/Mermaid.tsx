"use client"

import { useEffect, useId, useState } from "react"

let initialized = false

// Renders a Mermaid diagram client-side, themed to match the light medical palette.
// mermaid is heavy, so it's dynamically imported only when this component mounts.
export function Mermaid({ chart }: { chart: string }) {
  const rawId = useId().replace(/[^a-zA-Z0-9]/g, "")
  const [svg, setSvg] = useState("")

  useEffect(() => {
    let active = true
    void (async () => {
      const mermaid = (await import("mermaid")).default
      if (!initialized) {
        mermaid.initialize({
          startOnLoad: false,
          // The rendered SVG is injected via dangerouslySetInnerHTML, so the diagram
          // source must never carry executable markup. `antiscript` strips <script>
          // (and disables click handlers) while still honouring the <br/> line breaks
          // our labels use — unlike `strict`, which would render them as literal text.
          // INVARIANT: every `chart` passed here is a hardcoded literal (about/page),
          // never agent- or user-derived. Keep it that way; do not feed model output in.
          securityLevel: "antiscript",
          theme: "base",
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
          themeVariables: {
            background: "transparent",
            primaryColor: "#eaf2fd",
            primaryBorderColor: "#2c7be5",
            primaryTextColor: "#1a2b3c",
            secondaryColor: "#f2f5f9",
            tertiaryColor: "#ffffff",
            lineColor: "#94a3b8",
            clusterBkg: "#f7f9fc",
            clusterBorder: "#e3e8ef",
            fontSize: "14px",
          },
        })
        initialized = true
      }
      try {
        const { svg: out } = await mermaid.render(`mmd-${rawId}`, chart)
        if (active) setSvg(out)
      } catch {
        /* leave the placeholder if a diagram fails to parse */
      }
    })()
    return () => {
      active = false
    }
  }, [chart, rawId])

  return svg ? (
    <div className="mermaid-diagram overflow-x-auto [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} />
  ) : (
    <div className="py-6 text-center text-sm text-muted">Rendering diagram…</div>
  )
}
