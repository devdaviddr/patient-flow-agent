import type { ReactNode } from "react"
import "@fontsource/inter/400.css"
import "@fontsource/inter/500.css"
import "@fontsource/inter/600.css"
import "@fontsource/inter/700.css"
import "./globals.css"
import { AuthProvider } from "./lib/auth"

export const metadata = {
  title: "Patient Flow Orchestrator",
  description: "Agentic patient-flow coordination over a simulated hospital.",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
