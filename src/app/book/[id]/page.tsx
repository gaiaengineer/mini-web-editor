import { Suspense } from "react";
import EditorLoader from "@/components/editor/EditorLoader";

async function Book({ params }: PageProps<"/book/[id]">) {
  const { id } = await params;
  return <EditorLoader draftId={id} />;
}

export default function BookPage(props: PageProps<"/book/[id]">) {
  return (
    <Suspense>
      <Book {...props} />
    </Suspense>
  );
}
