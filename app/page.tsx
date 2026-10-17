import Link from "next/link"

const page = () => {
  return (
    <div className="flex flex-col items-center justify-center h-screen">

<Link href="/auth/sign-in">Sign In</Link> 
      <Link href="/auth/sign-up">Sign Up</Link>

    </div>
  )
}

export default page