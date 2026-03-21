import type { ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { openExternalUrl } from "../../api/transport";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function childrenToText(children: React.ReactNode): string {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) return children.map(childrenToText).join("");
  if (children != null && typeof children === "object" && "props" in children) {
    return childrenToText((children as { props: { children?: React.ReactNode } }).props.children);
  }
  return String(children ?? "");
}

function HeadingWithId(
  Tag: "h2" | "h3",
  props: ComponentPropsWithoutRef<"h2">,
) {
  const text = childrenToText(props.children);
  const id = slugify(text);
  return <Tag {...props} id={id} />;
}

const headingComponents = {
  h2: (props: ComponentPropsWithoutRef<"h2">) => HeadingWithId("h2", props),
  h3: (props: ComponentPropsWithoutRef<"h3">) => HeadingWithId("h3", props),
  a: ({
    href,
    children,
    ...props
  }: ComponentPropsWithoutRef<"a">) => {
    if (!isSafeMarkdownHref(href)) {
      return <span {...props}>{children}</span>;
    }

    const external = isExternalMarkdownHref(href);
    return (
      <a
        {...props}
        href={href}
        rel={external ? "noreferrer noopener" : undefined}
        target={external ? "_blank" : undefined}
        onClick={(event) => {
          if (!external || !href) {
            return;
          }

          event.preventDefault();
          void openExternalUrl(href);
        }}
      >
        {children}
      </a>
    );
  },
};

export const MarkdownView = ({ content }: { content: string }) => (
  <div className="markdown-view">
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={headingComponents}>
      {content}
    </ReactMarkdown>
  </div>
);

export { slugify as slugifyHeading };

const isSafeMarkdownHref = (href?: string): href is string => {
  if (typeof href !== "string") {
    return false;
  }

  const normalized = href.trim();
  if (!normalized) {
    return false;
  }

  return (
    normalized.startsWith("#") ||
    normalized.startsWith("/") ||
    normalized.startsWith("./") ||
    normalized.startsWith("../") ||
    normalized.startsWith("https://") ||
    normalized.startsWith("http://") ||
    normalized.startsWith("mailto:")
  );
};

const isExternalMarkdownHref = (href: string): boolean =>
  href.startsWith("https://") || href.startsWith("http://") || href.startsWith("mailto:");
