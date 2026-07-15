import {
  createElement,
  Fragment,
  type CSSProperties,
  type ReactNode,
} from "react";

import type {
  AssetReference,
  CompiledDocument,
  DocumentNode,
  HighlightedToken,
  LinkRecord,
} from "@/compiler/model";
import { CopyButton } from "@/components/reader/copy-button";
import { withBookBasePath } from "@/runtime/base-path";

interface RenderContext {
  readonly document: CompiledDocument;
  readonly linksByNodeId: ReadonlyMap<string, LinkRecord>;
  readonly assetsByNodeId: ReadonlyMap<string, AssetReference>;
  readonly tableHeader: boolean;
  readonly tableCellIndex?: number;
  readonly tableAlign?: readonly ("left" | "right" | "center" | null)[];
}

interface DocumentRendererProperties {
  readonly document: CompiledDocument;
}

function tokenStyle(
  light: HighlightedToken,
  dark?: HighlightedToken,
): CSSProperties {
  const fontStyle = light.fontStyle ?? dark?.fontStyle ?? 0;
  return {
    "--token-light": light.color ?? "inherit",
    "--token-dark": dark?.color ?? light.color ?? "inherit",
    ...(fontStyle & 1 ? { fontStyle: "italic" } : {}),
    ...(fontStyle & 2 ? { fontWeight: 700 } : {}),
    ...(fontStyle & 4 ? { textDecoration: "underline" } : {}),
  } as CSSProperties;
}

function renderHighlightedCode(
  node: Extract<DocumentNode, { type: "code" }>,
): ReactNode {
  const highlighted = node.highlightedRepresentation;
  if (highlighted === undefined) {
    return node.displayCode;
  }

  return highlighted.light.map((line, lineIndex) => {
    const darkLine = highlighted.dark[lineIndex] ?? [];
    return (
      <span className="code-line" key={`${node.nodeId}:line:${lineIndex}`}>
        {line.map((token, tokenIndex) => (
          <span
            className="code-token"
            key={`${node.nodeId}:token:${lineIndex}:${tokenIndex}`}
            style={tokenStyle(token, darkLine[tokenIndex])}
          >
            {token.content}
          </span>
        ))}
        {lineIndex + 1 < highlighted.light.length ? "\n" : ""}
      </span>
    );
  });
}

function resolvedLink(
  nodeId: string,
  context: RenderContext,
): LinkRecord | undefined {
  return context.linksByNodeId.get(nodeId);
}

function renderChildren(
  children: readonly DocumentNode[],
  context: RenderContext,
  keyPrefix: string,
): ReactNode {
  return children.map((child, index) => (
    <Fragment key={`${keyPrefix}:${child.nodeId}:${index}`}>
      {renderNode(child, context)}
    </Fragment>
  ));
}

function renderNode(node: DocumentNode, context: RenderContext): ReactNode {
  switch (node.type) {
    case "root":
      return renderChildren(node.children, context, node.nodeId);
    case "text":
      return node.value;
    case "paragraph":
      return <p>{renderChildren(node.children, context, node.nodeId)}</p>;
    case "blockquote":
      return (
        <blockquote>
          {renderChildren(node.children, context, node.nodeId)}
        </blockquote>
      );
    case "strong":
      return (
        <strong>{renderChildren(node.children, context, node.nodeId)}</strong>
      );
    case "emphasis":
      return <em>{renderChildren(node.children, context, node.nodeId)}</em>;
    case "delete":
      return <del>{renderChildren(node.children, context, node.nodeId)}</del>;
    case "heading": {
      const headingTag = `h${node.depth}` as const;
      return createElement(
        headingTag,
        { id: node.effectiveId },
        renderChildren(node.children, context, node.nodeId),
      );
    }
    case "list": {
      const children = renderChildren(node.children, context, node.nodeId);
      return node.ordered ? (
        <ol start={node.start}>{children}</ol>
      ) : (
        <ul>{children}</ul>
      );
    }
    case "listItem":
      return (
        <li>
          {node.checked === undefined ? (
            <></>
          ) : (
            <input
              aria-label={node.checked ? "Completed task" : "Incomplete task"}
              checked={node.checked}
              readOnly
              type="checkbox"
            />
          )}
          {renderChildren(node.children, context, node.nodeId)}
        </li>
      );
    case "break":
      return <br />;
    case "thematicBreak":
      return <hr />;
    case "inlineCode":
      return <code>{node.value}</code>;
    case "code":
      return (
        <figure className="code-block">
          <figcaption className="code-header">
            <span>{node.infoString ?? node.language ?? "Code"}</span>
            <CopyButton value={node.displayCode} />
          </figcaption>
          <pre tabIndex={0}>
            <code>{renderHighlightedCode(node)}</code>
          </pre>
        </figure>
      );
    case "link":
    case "linkReference": {
      const link = resolvedLink(node.nodeId, context);
      const href = link?.rewrittenTarget ?? link?.resolvedTarget ?? node.url;
      const children = renderChildren(node.children, context, node.nodeId);
      if (
        href === undefined ||
        link?.status === "broken" ||
        link?.status === "unsupported"
      ) {
        return (
          <span
            aria-label="Unresolved link"
            data-link-status={link?.status ?? "unresolved"}
          >
            {children}
          </span>
        );
      }
      const external =
        link?.linkKind === "external" || link?.linkKind === "protocol-specific";
      return (
        <a
          href={withBookBasePath(href)}
          {...(external
            ? { rel: "noopener noreferrer", target: "_blank" }
            : {})}
          {...(node.title === undefined ? {} : { title: node.title })}
        >
          {children}
          {external ? (
            <span className="sr-only"> (opens in a new tab)</span>
          ) : (
            <></>
          )}
        </a>
      );
    }
    case "image":
    case "imageReference": {
      const asset = context.assetsByNodeId.get(node.nodeId);
      const source = asset?.outputPath ?? node.url;
      if (source === undefined) {
        return (
          <span role="img">
            [Unresolved image: {node.alt ?? "no alternate text"}]
          </span>
        );
      }
      return (
        <figure>
          {/* The original asset remains available; generated variants never replace this source. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt={node.alt ?? ""}
            loading="lazy"
            src={withBookBasePath(source)}
          />
          {node.title === undefined ? (
            <></>
          ) : (
            <figcaption>{node.title}</figcaption>
          )}
        </figure>
      );
    }
    case "definition":
      return <></>;
    case "html":
      if (
        node.disposition === "sanitized" &&
        node.sanitizedValue !== undefined
      ) {
        return (
          <div dangerouslySetInnerHTML={{ __html: node.sanitizedValue }} />
        );
      }
      return (
        <aside className="raw-html-source">
          <strong>Raw HTML preserved as source</strong>
          <pre>{node.value}</pre>
        </aside>
      );
    case "inlineMath":
      return node.renderedHtml === undefined ? (
        <code className="math-fallback">{node.source}</code>
      ) : (
        <span
          aria-label={`Mathematical expression: ${node.source}`}
          dangerouslySetInnerHTML={{ __html: node.renderedHtml }}
        />
      );
    case "math":
      return (
        <div className="math-scroll" role="math">
          {node.renderedHtml === undefined ? (
            <pre className="math-fallback">{node.source}</pre>
          ) : (
            <div
              aria-label={`Mathematical expression: ${node.source}`}
              dangerouslySetInnerHTML={{ __html: node.renderedHtml }}
            />
          )}
        </div>
      );
    case "table":
      return (
        <div
          className="table-scroll"
          role="region"
          aria-label="Scrollable table"
          tabIndex={0}
        >
          <table>
            <tbody>
              {node.children.map((child, rowIndex) => (
                <Fragment key={`${node.nodeId}:row:${child.nodeId}`}>
                  {renderNode(child, {
                    ...context,
                    tableHeader: rowIndex === 0,
                    ...(node.align === undefined
                      ? {}
                      : { tableAlign: node.align }),
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "tableRow":
      return (
        <tr>
          {node.children.map((child, cellIndex) => (
            <Fragment key={`${node.nodeId}:cell:${child.nodeId}`}>
              {renderNode(child, { ...context, tableCellIndex: cellIndex })}
            </Fragment>
          ))}
        </tr>
      );
    case "tableCell": {
      const align =
        context.tableCellIndex === undefined
          ? undefined
          : context.tableAlign?.[context.tableCellIndex];
      const style =
        align === null || align === undefined
          ? undefined
          : { textAlign: align };
      return context.tableHeader ? (
        <th scope="col" style={style}>
          {renderChildren(node.children, context, node.nodeId)}
        </th>
      ) : (
        <td style={style}>
          {renderChildren(node.children, context, node.nodeId)}
        </td>
      );
    }
    case "footnoteDefinition":
      return (
        <li id={`footnote-${node.identifier ?? node.nodeId}`}>
          {renderChildren(node.children, context, node.nodeId)}
        </li>
      );
    case "footnoteReference":
      return (
        <sup>
          <a href={`#footnote-${node.identifier}`}>
            {node.label ?? node.identifier}
          </a>
        </sup>
      );
    case "containerDirective":
    case "leafDirective":
    case "textDirective":
      return (
        <aside
          className={`directive directive-${node.name}`}
          data-security-level={node.securityLevel}
        >
          {renderChildren(node.children, context, node.nodeId)}
        </aside>
      );
    case "mdxFlowExpression":
    case "mdxTextExpression":
    case "mdxJsxFlowElement":
    case "mdxJsxTextElement":
    case "mdxjsEsm":
      return (
        <aside className="unknown-node">
          <strong>Executable MDX quarantined</strong>
          <pre>{node.rawSource}</pre>
        </aside>
      );
    case "unsupported":
      return (
        <aside className="unknown-node">
          <strong>Unsupported syntax preserved: {node.originalType}</strong>
          <pre>{node.rawSource}</pre>
        </aside>
      );
  }
}

export function DocumentRenderer({ document }: DocumentRendererProperties) {
  const linksByNodeId = new Map(
    document.links.map((link) => [link.sourceNodeId, link]),
  );
  const assetsByNodeId = new Map(
    document.assets.map((asset) => [asset.sourceNodeId, asset]),
  );

  return (
    <div className="prose" dir="auto">
      {renderNode(document.root, {
        document,
        linksByNodeId,
        assetsByNodeId,
        tableHeader: true,
      })}
    </div>
  );
}
