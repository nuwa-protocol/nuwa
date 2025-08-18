import React from "react";
import { useParams } from "react-router-dom";
import { DocContent } from "../../components/docs/DocContent";
import { DocSidebar } from "../../components/docs/DocSidebar";
import { SEO } from "../../components/layout/SEO";

export const DocPage: React.FC = () => {
  const { docId } = useParams<{ docId: string }>();
  const [content, setContent] = React.useState<string>("");
  const [title, setTitle] = React.useState<string>("");
  const [description, setDescription] = React.useState<string>("");

  React.useEffect(() => {
    // In a real application, this should fetch from a backend API
    // For now, we're loading from local files
    fetch(`/docs/${docId}.md`)
      .then((response) => response.text())
      .then((text) => {
        setContent(text);
        // Extract title from first h1
        const titleMatch = text.match(/^#\s+(.+)$/m);
        if (titleMatch) {
          setTitle(titleMatch[1]);
        } else {
          setTitle(docId || "Documentation");
        }
        // Extract description from first paragraph
        const descMatch = text.match(/^([^\n#].+)$/m);
        if (descMatch) {
          setDescription(descMatch[1].slice(0, 160)); // Limit to 160 chars for SEO
        } else {
          setDescription(`Documentation for ${docId || "Nuwa platform"}`);
        }
      })
      .catch((error) => console.error("Error loading document:", error));
  }, [docId]);

  return (
    <>
      <SEO
        title={title}
        description={description}
        keywords={`${title}, Documentation, Nuwa, Web3 AI, Blockchain AI, AI Platform`}
        ogUrl={`https://nuwa.dev/docs/${docId}`}
      />
      <div className="flex h-screen dark:bg-gray-900">
        <DocSidebar />
        <main className="flex-1 overflow-y-auto">
          <DocContent content={content} />
        </main>
      </div>
    </>
  );
};
