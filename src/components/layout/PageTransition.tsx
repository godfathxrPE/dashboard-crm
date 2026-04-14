'use client'

import { usePathname } from 'next/navigation'
import { useRef, useLayoutEffect } from 'react'

export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const ref = useRef<HTMLDivElement>(null)
  const isFirst = useRef(true)

  useLayoutEffect(() => {
    if (isFirst.current) {
      isFirst.current = false
      return
    }

    const el = ref.current
    if (!el) return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    el.classList.remove('page-entering')
    void el.offsetHeight
    el.classList.add('page-entering')

    const onEnd = () => el.classList.remove('page-entering')
    el.addEventListener('animationend', onEnd, { once: true })

    return () => el.removeEventListener('animationend', onEnd)
  }, [pathname])

  return <div ref={ref}>{children}</div>
}
