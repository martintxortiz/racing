import { FcGoogle } from "react-icons/fc"

import AuthShell from "@/components/auth/auth-shell"
import { Button } from "@/components/ui/button"
import { Form } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const SignInPage = () => {
  return (
    <AuthShell>
      <Form className="flex flex-col gap-6">
      <Label className="bg-red-600/30 text-red-500 px-2.5 py-2 rounded-[2px] flex items-center justify-center">ERROR MESSAGE EXAMPLE</Label>
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-0.5">
            <Label>Email</Label>
            <Input type="email" name="email" placeholder="Your Email" size="default" />
          </div>
          <div className="flex flex-col gap-0.5">
            <Label>Password</Label>
            <Input type="password" name="password" placeholder="Your Password" size="default" />
          </div>
          <div className="flex items-center justify-between">
            <Label className="hover:text-white/90 hover:cursor-pointer hover:underline">Reset Password</Label>
            <Label className="hover:text-white/90 hover:cursor-pointer hover:underline">Sign-Up</Label>
          </div>
        </div>

        <div className="flex flex-col gap-2">
        <Button type="submit" variant="primary" size="default" className="text-sm font-medium">
          Sign in
        </Button>
        <Button type="submit" variant="secondary" size="default" className="w-full">
          <FcGoogle size={16} />
          Google
        </Button>
        <div className="flex items-center justify-between">
            <Label className="hover:text-white/90 opacity-50 hover:cursor-pointer">Privacy Policy</Label>
            <Label className="hover:text-white/90 opacity-50 hover:cursor-pointer">Terms of Service</Label>
          </div>
        </div>
      </Form>
    </AuthShell>
  )
}

export default SignInPage
