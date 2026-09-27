import Link from "next/link"

export default function Home() {
  return (
    <main>
      <p>Open /p/1, wait more than 60 s, open /p/2, wait ~30 s, open /p/3. Then read the function logs.</p>
      <Link href="/p/1">/p/1</Link>
    </main>
  )
}
