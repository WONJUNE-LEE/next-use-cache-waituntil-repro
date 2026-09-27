import { Suspense } from "react"
import { cacheLife } from "next/cache"

// A cached read that takes a few hundred milliseconds: several sequential fetches.
// cacheLife("minutes") => revalidate 60 s, expire 1 h. Between 60 s and 1 h a read is stale and
// Next 16.3 regenerates it in the background (vercel/next.js#92636).
async function getData() {
  "use cache: remote"
  cacheLife("minutes")
  const run = Math.random().toString(36).slice(2, 8)
  console.log(`[repro] regeneration ${run} start ${new Date().toISOString()}`)
  try {
    let bytes = 0
    for (let i = 1; i <= 10; i++) {
      const res = await fetch(`https://jsonplaceholder.typicode.com/posts/${i}`)
      bytes += (await res.text()).length
      console.log(`[repro] regeneration ${run} fetch ${i}/10 ok ${new Date().toISOString()}`)
    }
    console.log(`[repro] regeneration ${run} done ${new Date().toISOString()}`)
    return { bytes, at: new Date().toISOString() }
  } catch (error) {
    console.log(`[repro] regeneration ${run} FAILED ${new Date().toISOString()} ${error?.name}: ${error?.message}`)
    throw error
  }
}

async function Data({ params }) {
  const { id } = await params // request-time data: this part renders during the streaming resume
  const data = await getData()
  return <p>page {id} — cached at {data.at} ({data.bytes} bytes)</p>
}

export default function Page({ params }) {
  return (
    <main>
      <Suspense fallback={<p>loading…</p>}>
        <Data params={params} />
      </Suspense>
    </main>
  )
}
