import React from 'react'

const AuthShell = ({ children, errorMessage: errorMessage }: { children: React.ReactNode, errorMessage?: string }) => {
  return (
    <div className="flex flex-col items-center justify-center h-screen w-screen">
      <div className='min-w-100'>
      {children}
      {errorMessage && <p className='text-red-500'>{errorMessage}</p>}
      </div>
    </div>
  )
}

export default AuthShell