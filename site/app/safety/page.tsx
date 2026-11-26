import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const metadata: Metadata = { title: 'Safety' }

export default function SafetyPage() {
  redirect('/#limits')
}
