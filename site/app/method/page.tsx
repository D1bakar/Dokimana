import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const metadata: Metadata = { title: 'Method' }

export default function MethodPage() {
  redirect('/#what-it-does')
}
