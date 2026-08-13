import { Action, ActionPanel, Detail, Form, Icon, Keyboard, showToast, Toast } from "@raycast/api";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { useState } from "react";
import TurndownService from "turndown";

const MAX_PAGE_SIZE_BYTES = 20 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 20_000;

type FormValues = {
  url: string;
};

type Conversion = {
  markdown: string;
  sourceUrl: string;
  title: string;
  siteName?: string | null;
  byline?: string | null;
  excerpt?: string | null;
};

export default function Command() {
  const [conversion, setConversion] = useState<Conversion>();
  const [isConverting, setIsConverting] = useState(false);

  async function handleSubmit(values: FormValues) {
    let sourceUrl: URL;

    try {
      sourceUrl = parseWebUrl(values.url);
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Enter a valid webpage URL",
        message: errorMessage(error),
      });
      return;
    }

    setIsConverting(true);
    const toast = await showToast({ style: Toast.Style.Animated, title: "Converting webpage locally" });

    try {
      const result = await convertWebpage(sourceUrl);
      setConversion(result);
      toast.style = Toast.Style.Success;
      toast.title = "Markdown ready";
      toast.message = "Nothing was sent to a conversion service.";
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Couldn’t convert this webpage";
      toast.message = errorMessage(error);
    } finally {
      setIsConverting(false);
    }
  }

  if (conversion) {
    return <MarkdownDetail conversion={conversion} onConvertAnother={() => setConversion(undefined)} />;
  }

  return (
    <Form
      isLoading={isConverting}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Convert to Markdown" icon={Icon.Document} onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.Description text="Downloads the page directly, then extracts and converts its content on this device. The webpage itself still receives a normal request from your computer." />
      <Form.TextField
        id="url"
        title="Webpage URL"
        placeholder="https://example.com/article"
        autoFocus
        info="The page must be reachable from this computer. Browser sign-in sessions are not shared."
      />
    </Form>
  );
}

function MarkdownDetail({ conversion, onConvertAnother }: { conversion: Conversion; onConvertAnother: () => void }) {
  const metadata = [conversion.siteName, conversion.byline].filter(Boolean).join(" · ");
  const markdown = [
    `# ${conversion.title}`,
    metadata ? `\n${metadata}` : "",
    `\nSource: ${conversion.sourceUrl}`,
    conversion.excerpt ? `\n> ${conversion.excerpt}` : "",
    "\n---\n",
    conversion.markdown,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <Detail
      navigationTitle={conversion.title}
      markdown={markdown}
      actions={
        <ActionPanel>
          <Action.CopyToClipboard title="Copy Markdown" content={markdown} />
          <Action.CopyToClipboard title="Copy Source URL" content={conversion.sourceUrl} />
          <Action.OpenInBrowser title="Open Original Webpage" url={conversion.sourceUrl} />
          <Action
            title="Convert Another Webpage"
            icon={Icon.Plus}
            onAction={onConvertAnother}
            shortcut={Keyboard.Shortcut.Common.New}
          />
        </ActionPanel>
      }
    />
  );
}

async function convertWebpage(sourceUrl: URL): Promise<Conversion> {
  const html = await fetchHtml(sourceUrl);
  const { document } = parseHTML(html);
  const article = new Readability(document).parse();

  const content = article?.content?.trim() || document.body.innerHTML;
  if (!content.trim()) {
    throw new Error("The page did not contain any readable HTML.");
  }

  const { document: contentDocument } = parseHTML(`<!doctype html><html><body>${content}</body></html>`);
  removeNonContentElements(contentDocument);
  makeUrlsAbsolute(contentDocument, sourceUrl);

  const turndownService = new TurndownService({
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "_",
    headingStyle: "atx",
  });
  const markdown = turndownService.turndown(contentDocument.body.innerHTML).trim();

  if (!markdown) {
    throw new Error("The page did not contain any convertible article text.");
  }

  return {
    markdown,
    sourceUrl: sourceUrl.href,
    title: article?.title?.trim() || document.title.trim() || sourceUrl.hostname,
    siteName: article?.siteName,
    byline: article?.byline,
    excerpt: article?.excerpt,
  };
}

async function fetchHtml(url: URL): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "Raycast Webpage to Markdown (Local)",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`The website returned ${response.status} ${response.statusText}.`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      throw new Error("The URL did not return an HTML webpage.");
    }

    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_PAGE_SIZE_BYTES) {
      throw new Error("The webpage is larger than the 20 MB conversion limit.");
    }

    const page = await response.arrayBuffer();
    if (page.byteLength > MAX_PAGE_SIZE_BYTES) {
      throw new Error("The webpage is larger than the 20 MB conversion limit.");
    }

    return new TextDecoder().decode(page);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("The webpage took longer than 20 seconds to respond.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function parseWebUrl(value: string): URL {
  const url = new URL(value.trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Use an http:// or https:// URL.");
  }

  return url;
}

function removeNonContentElements(document: Document) {
  document
    .querySelectorAll("script, style, noscript, iframe, canvas, form, button, input, select, textarea")
    .forEach((element) => element.remove());
}

function makeUrlsAbsolute(document: Document, sourceUrl: URL) {
  document.querySelectorAll<HTMLElement>("[href], [src]").forEach((element) => {
    for (const attribute of ["href", "src"]) {
      const value = element.getAttribute(attribute);
      if (
        !value ||
        value.startsWith("#") ||
        value.startsWith("data:") ||
        value.startsWith("mailto:") ||
        value.startsWith("tel:")
      ) {
        continue;
      }

      try {
        element.setAttribute(attribute, new URL(value, sourceUrl).href);
      } catch {
        // Leave invalid and non-web URLs unchanged rather than dropping their surrounding content.
      }
    }
  });
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "An unexpected error occurred.";
}
