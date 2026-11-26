import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const metadata: Metadata = { title: 'Quick start' }

export default function QuickstartPage() {
  redirect('/#setup')
}
