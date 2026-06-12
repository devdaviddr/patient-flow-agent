"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, LogOut, Settings } from "lucide-react"
import { useAuth } from "../../lib/auth"

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/settings", label: "Settings", icon: Settings },
]

export function Sidebar({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname()
  const { logout } = useAuth()

  return (
    <aside
      className={`${collapsed ? "w-16" : "w-60"} flex shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200`}
    >
      <nav className="flex-1 space-y-1 p-2">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              title={label}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                active
                  ? "bg-primary-weak font-medium text-primary"
                  : "text-text hover:bg-surface-2"
              } ${collapsed ? "justify-center" : ""}`}
            >
              <Icon size={18} className="shrink-0" />
              {!collapsed && <span>{label}</span>}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-border p-2">
        <button
          onClick={logout}
          title="Log out"
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-text hover:bg-surface-2 ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <LogOut size={18} className="shrink-0" />
          {!collapsed && <span>Log out</span>}
        </button>
      </div>
    </aside>
  )
}
