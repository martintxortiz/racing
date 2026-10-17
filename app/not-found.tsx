"use client"

import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { ArrowLeft } from "@carbon/icons-react"

export default function NotFound() {
  const router = useRouter()

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center text-foreground">
      <h1 className="text-7xl font-semibold leading-none text-red-500 sm:text-9xl">404</h1>
      <Button
        type="button"
        variant="link"
        size={null}
        className="mt-2"
        onClick={() => {
          if (window.history.length > 1) router.back()
          else router.push("/")
        }}
      >
        <ArrowLeft size={16} />
        Go back
      </Button>
    </main>
  )
}
