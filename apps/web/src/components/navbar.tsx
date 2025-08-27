'use client'

import Link from "next/link"
import Logo from "@/components/logo"
import UserMenu from "@/components/user-menu"


export default function Navbar() {
  return (
    <header className="border-b px-4 md:px-6">
      <div className="flex h-16 items-center justify-between gap-4">
        {/* Left side */}
        <div className="flex flex-1 items-center gap-3">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <Logo width={32} height={32} />
            <span className="text-xl font-semibold">OpenChat</span>
          </Link>
        </div>
        {/* Right side */}
        <div className="flex flex-1 items-center justify-end gap-2">
          <UserMenu />
        </div>
      </div>
    </header>
  )
}
