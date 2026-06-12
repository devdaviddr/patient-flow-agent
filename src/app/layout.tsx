import type { ReactNode } from "react"
import "./globals.css"

export const metadata = {
  title: "Patient Flow Orchestrator",
  description: "Agentic patient-flow coordination over a simulated hospital.",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
