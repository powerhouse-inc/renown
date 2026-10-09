import type { GetServerSideProps } from 'next'
import { renderRobots } from '../lib/sitemap'
import { publicOrigin } from '../utils/seo'

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Cache-Control', 'public, s-maxage=86400')
  res.write(renderRobots(publicOrigin()))
  res.end()
  return { props: {} }
}

export default function Robots() {
  return null
}
