import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Renders an assistant answer as formatted Markdown (GitHub-flavored) instead
// of the raw `**bold**` / `# heading` source the model emits. Used by the chat
// bubbles (live stream, replay and persisted turns). Styling lives in the
// `.md-body` rules in index.css so the rendered blocks stay compact and on-brand
// inside the bubble. Links open in a new tab; everything else maps to plain
// semantic HTML that react-markdown produces by default.
export function Markdown({ text }: { text: string }) {
  return (
    <div className="md-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _node, ...props }) => (
            <a {...props} target="_blank" rel="noreferrer noopener" />
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
