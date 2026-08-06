import { Children, isValidElement } from "react";
import type { ComponentProps, ReactNode } from "react";
import { Code2 } from "lucide-react";
import type { BundledLanguage } from "shiki";
import type { Components, ExtraProps } from "streamdown";

import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockHeader,
  CodeBlockTitle,
} from "@/components/ai-elements/code-block";
import { MessageResponse } from "@/components/ai-elements/message";

const languageAliases: Record<string, BundledLanguage> = {
  bash: "shellscript",
  csharp: "csharp",
  cs: "csharp",
  html: "html",
  java: "java",
  js: "javascript",
  json: "json",
  jsx: "jsx",
  kotlin: "kotlin",
  kt: "kotlin",
  markdown: "markdown",
  md: "markdown",
  plaintext: "text" as BundledLanguage,
  ps1: "powershell",
  py: "python",
  python: "python",
  sh: "shellscript",
  shell: "shellscript",
  sql: "sql",
  text: "text" as BundledLanguage,
  ts: "typescript",
  tsx: "tsx",
  typescript: "typescript",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
};

const nodeText = (node: ReactNode): string => {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return nodeText(node.props.children);
  return "";
};

const CodeFence = ({ children }: ComponentProps<"pre"> & ExtraProps) => {
  const child = Children.toArray(children)[0];
  if (!isValidElement<{ className?: string; children?: ReactNode }>(child)) return <pre>{children}</pre>;
  const match = /language-([^\s]+)/.exec(child.props.className ?? "");
  const rawLanguage = match?.[1]?.toLowerCase() ?? "text";
  const language = languageAliases[rawLanguage] ?? ("text" as BundledLanguage);
  const code = nodeText(child.props.children).replace(/\n$/, "");
  return (
    <CodeBlock code={code} language={language} showLineNumbers>
      <CodeBlockHeader>
        <CodeBlockTitle><Code2 className="size-3.5" /><CodeBlockFilename>{rawLanguage}</CodeBlockFilename></CodeBlockTitle>
        <CodeBlockActions><CodeBlockCopyButton aria-label="复制代码" title="复制代码" /></CodeBlockActions>
      </CodeBlockHeader>
    </CodeBlock>
  );
};

const components: Components = { pre: CodeFence };

export function MarkdownResponse(props: ComponentProps<typeof MessageResponse>) {
  return <MessageResponse components={components} isAnimating={false} mode="static" {...props} />;
}
