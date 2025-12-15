import { useEffect, useState } from 'react'

const welcomeText = [
  'Welcome !',
  'ようこそ !',
  '환영합니다 !',
  '欢迎 !',
  'Selamat Datang !',
]

export function WelcomeGreeting() {
  const [text, setText] = useState(welcomeText[0])

  useEffect(() => {
    const id = setInterval(() => {
      setText(welcomeText[Math.floor(Math.random() * welcomeText.length)])
    }, 2500)

    return () => {
      clearInterval(id)
    }
  }, [])

  return <h1 className="text-center text-3xl">{text}</h1>
}
