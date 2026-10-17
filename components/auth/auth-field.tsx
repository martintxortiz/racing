"use client"

import { ViewOffFilled, ViewFilled } from "@carbon/icons-react"
import React, { useState } from "react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

interface AuthFieldProps extends React.ComponentProps<typeof Input> {
  label: string
  labelExtra?: React.ReactNode
  error?: boolean
}

const AuthField = ({
  id,
  label,
  type = "text",
  name,
  labelExtra,
  error,
  className,
  ...props
}: AuthFieldProps) => {
  const isPassword = type === "password"
  const [visible, setVisible] = useState(false)
  const inputId = id ?? name

  return (
    <div className={cn("flex flex-col gap-2", error && "animate-shake")}>
      <div className="flex items-center justify-between">
        <Label htmlFor={inputId} className="text-sm text-white/50">
          {label}
        </Label>
        {labelExtra}
      </div>
      <div className="relative flex">
        <Input
          id={inputId}
          name={name}
          type={isPassword && visible ? "text" : type}
          aria-invalid={Boolean(error)}
          className={cn(
            "text-base sm:text-sm",
            isPassword ? "w-full pr-9" : "w-full",
            error && "!ring-1 !ring-red-500 !focus-visible:ring-1 !focus-visible:ring-red-500",
            className
          )}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-white/30 hover:text-white/70 transition-colors cursor-pointer"
            aria-label={visible ? "Hide password" : "Show password"}
          >
            {visible ? <ViewOffFilled size={16} /> : <ViewFilled size={16} />}
          </button>
        )}
      </div>
    </div>
  )
}

export default AuthField
