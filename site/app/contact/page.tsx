import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const metadata: Metadata = { title: 'Contact' }

export default function ContactPage() {
  redirect('https://github.com/D1bakar/Dokimana/issues/new')
}
