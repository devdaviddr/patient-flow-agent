"use client"

// Mock auth — no backend, no real credentials. A client context persisted to
// localStorage, enough to make the shell feel complete for the demo.

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

export interface MockUser {
  name: string
  role: string
  initials: string
  email: string
}

export const MOCK_USER: MockUser = {
  name: "Dr. A. Coordinator",
  role: "Flow Coordinator",
  initials: "AC",
  email: "coordinator@example-hospital.test",
}

const STORAGE_KEY = "pfo.authed"

interface AuthState {
  user: MockUser | null
  isAuthenticated: boolean
  ready: boolean // hydrated from localStorage yet?
  login: () => void
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Hydrate the mock session from localStorage on mount (client-only).
    /* eslint-disable react-hooks/set-state-in-effect */
    setAuthed(localStorage.getItem(STORAGE_KEY) === "1")
    setReady(true)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])

  const login = () => {
    localStorage.setItem(STORAGE_KEY, "1")
    setAuthed(true)
  }
  const logout = () => {
    localStorage.removeItem(STORAGE_KEY)
    setAuthed(false)
  }

  return (
    <AuthContext.Provider
      value={{ user: authed ? MOCK_USER : null, isAuthenticated: authed, ready, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>")
  return ctx
}
