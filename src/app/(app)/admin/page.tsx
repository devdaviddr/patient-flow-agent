"use client"

import { useCallback, useEffect, useState } from "react"
import { useAuth } from "../../lib/auth"
import { authClient } from "../../lib/auth"
import { Panel } from "../../components/Panel"
import { ROLES, type Role } from "@/auth/schema"

// Superadmin user administration (spec B4). Lists users; lets a superadmin change a
// role or remove an account via the Better Auth admin plugin. The server re-checks
// superadmin on every admin endpoint (decision 7), so this page is convenience +
// defence-in-depth — it renders nothing useful for a non-superadmin.

interface AdminUser {
  id: string
  name: string
  email: string
  role: string | null
}

interface InviteOverview {
  total: number
  remaining: number
  used: number
}

export default function AdminPage() {
  const { user } = useAuth()
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [invites, setInvites] = useState<InviteOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const isSuperadmin = user?.role === "superadmin"

  const refresh = useCallback(async () => {
    setError(null)
    const res = await authClient.admin.listUsers({ query: { limit: 200 } })
    if (res.error) {
      setError("Could not load users.")
      return
    }
    const data = res.data as unknown as { users: AdminUser[] }
    setUsers(data.users)
    const inv = await fetch("/api/admin/invites")
    if (inv.ok) setInvites((await inv.json()) as InviteOverview)
  }, [])

  useEffect(() => {
    // Initial async load — setState runs after the await, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isSuperadmin) refresh()
  }, [isSuperadmin, refresh])

  const changeRole = async (target: AdminUser, role: Role) => {
    setBusyId(target.id)
    setError(null)
    try {
      // The admin client types `role` with the plugin's built-in "user"|"admin"
      // union; our server stores the app's own role strings (a free `role` column),
      // so the cast is type-only — the real Role value is what gets sent.
      const res = await authClient.admin.setRole({
        userId: target.id,
        role: role as unknown as "admin",
      })
      if (res.error) setError(res.error.message ?? "Could not change role.")
      await refresh()
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (target: AdminUser) => {
    if (!confirm(`Delete ${target.email}? This revokes their sessions.`)) return
    setBusyId(target.id)
    setError(null)
    try {
      const res = await authClient.admin.removeUser({ userId: target.id })
      if (res.error) setError(res.error.message ?? "Could not delete user.")
      await refresh()
    } finally {
      setBusyId(null)
    }
  }

  if (!isSuperadmin) {
    return (
      <div className="mx-auto max-w-lg">
        <Panel title="Administration">
          <p className="text-sm text-muted">
            This area is restricted to superadmins.
          </p>
        </Panel>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">User administration</h1>
        <p className="text-xs text-muted">
          Manage accounts and roles. Synthetic, demo-only — no real PII.
        </p>
      </div>

      {invites && (
        <Panel title="Invites">
          <p className="text-sm text-muted">
            {invites.remaining} of {invites.total} keys remaining ({invites.used} used).
          </p>
        </Panel>
      )}

      <Panel title="Users">
        {error && (
          <p role="alert" className="mb-3 text-sm text-blocked">
            {error}
          </p>
        )}
        {users === null ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-muted">
                <th className="py-2">Name</th>
                <th className="py-2">Email</th>
                <th className="py-2">Role</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.id === user?.id
                return (
                  <tr key={u.id} className="border-t border-border">
                    <td className="py-2">{u.name}</td>
                    <td className="py-2 text-muted">{u.email}</td>
                    <td className="py-2">
                      <select
                        value={(u.role as Role) ?? "viewer"}
                        disabled={isSelf || busyId === u.id}
                        onChange={(e) => changeRole(u, e.target.value as Role)}
                        className="rounded-lg border border-border bg-surface px-2 py-1 text-sm outline-none focus:border-primary disabled:opacity-50"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 text-right">
                      <button
                        disabled={isSelf || busyId === u.id}
                        onClick={() => remove(u)}
                        className="rounded-lg border border-blocked/60 px-2 py-1 text-xs font-medium text-blocked hover:bg-blocked/10 disabled:opacity-40"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  )
}
