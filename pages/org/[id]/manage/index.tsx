import type { GetServerSideProps } from 'next'

/** /org/<id>/manage opens the members section. */
export const getServerSideProps: GetServerSideProps = async ({ params }) => ({
  redirect: {
    destination: `/org/${encodeURIComponent(String(params?.id ?? ''))}/manage/members`,
    permanent: false,
  },
})

export default function ManageIndex() {
  return null
}
