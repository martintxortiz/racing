"use client"

import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"

function DashboardPage() {
  const router = useRouter()

  return (
    <main className="flex min-h-screen items-center justify-center gap-4">
      <h1>Dashboard</h1>
      <Button
        variant="secondary"
        onClick={() => router.push("/auth/sign-out")}
      >
        Log out
      </Button>
    </main>
  )
}

export default DashboardPage
