import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/cn";

/**
 * Lesson Markdown (copied from the PDF), styled with our tokens. Raw HTML in the source is never
 * rendered (react-markdown's default). Wide tables scroll inside their own box, never the page.
 */
const components: Components = {
  h1: ({ node: _node, children, ...props }) => (
    <h3 className="text-md font-semibold" {...props}>
      {children}
    </h3>
  ),
  h2: ({ node: _node, children, ...props }) => (
    <h3 className="text-md font-semibold" {...props}>
      {children}
    </h3>
  ),
  h3: ({ node: _node, children, ...props }) => (
    <h4 className="font-semibold" {...props}>
      {children}
    </h4>
  ),
  h4: ({ node: _node, children, ...props }) => (
    <h4 className="font-semibold" {...props}>
      {children}
    </h4>
  ),
  p: ({ node: _node, ...props }) => <p {...props} />,
  ul: ({ node: _node, ...props }) => <ul className="flex list-disc flex-col gap-1 pl-5" {...props} />,
  ol: ({ node: _node, ...props }) => <ol className="flex list-decimal flex-col gap-1 pl-5" {...props} />,
  li: ({ node: _node, ...props }) => <li className="pl-1" {...props} />,
  a: ({ node: _node, children, ...props }) => (
    <a className="text-accent-text underline underline-offset-2" target="_blank" rel="noreferrer" {...props}>
      {children}
    </a>
  ),
  blockquote: ({ node: _node, ...props }) => (
    <blockquote className="border-l-2 border-line-strong pl-3 text-fg-2" {...props} />
  ),
  code: ({ node: _node, ...props }) => <code className="rounded-ctl bg-subtle px-1 text-sm" {...props} />,
  hr: () => <hr className="border-line" />,
  table: ({ node: _node, ...props }) => (
    <div className="overflow-x-auto rounded-ctl border border-line">
      <table className="w-full border-collapse text-sm" {...props} />
    </div>
  ),
  th: ({ node: _node, ...props }) => (
    <th className="border-b border-line bg-subtle px-3 py-1.5 text-left font-medium" {...props} />
  ),
  td: ({ node: _node, ...props }) => <td className="border-b border-line px-3 py-1.5 align-top" {...props} />,
};

export function Markdown({
  children,
  inline = false,
  className,
}: {
  children: string;
  /** Inside a label or a single line: paragraphs are unwrapped so only phrasing content remains. */
  inline?: boolean;
  className?: string;
}) {
  if (inline)
    return (
      <span className={className}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={components}
          disallowedElements={["p"]}
          unwrapDisallowed
        >
          {children}
        </ReactMarkdown>
      </span>
    );
  return (
    <div className={cn("flex max-w-prose flex-col gap-3 text-fg", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
