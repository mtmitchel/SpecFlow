import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export const MarkdownView = ({ content }: { content: string }) => (
  <div className="markdown-view">
    <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
  </div>
);
