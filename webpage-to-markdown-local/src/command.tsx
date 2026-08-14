import {
  Action,
  ActionPanel,
  Detail,
  Form,
  getPreferenceValues,
  Icon,
  Keyboard,
  open,
  openExtensionPreferences,
  showInFinder,
  showToast,
  Toast,
} from "@raycast/api";
import { Readability } from "@mozilla/readability";
import { access, mkdir, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { spawn } from "node:child_process";
import { parseHTML } from "linkedom";
import { useState } from "react";
import TurndownService from "turndown";

const MAX_PAGE_SIZE_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 20_000;

type FormValues = {
  url: string;
  outputFileName?: string;
  outputDirectory?: string[];
  outputTitleFormat: "default" | FileNameStyle;
};

type Preferences = {
  outputDirectory?: string;
  fileNameStyle?: FileNameStyle;
  editorCommand?: string;
  markdownViewer?: string;
};

type FileNameStyle = "kebab-case" | "snake_case" | "title-case" | "dated-kebab-case";

type ExtractedPage = {
  contentHtml: string;
  sourceUrl: string;
  title: string;
  siteName?: string | null;
  byline?: string | null;
  excerpt?: string | null;
};

type Conversion = Omit<ExtractedPage, "contentHtml"> & {
  markdown: string;
  outputFileName?: string;
  outputDirectory?: string;
  fileNameStyle?: FileNameStyle;
  savedPath?: string;
  offline?: boolean;
};

type AssetOptions = {
  directory: string;
  filePrefix: string;
};

export function WebpageToMarkdownCommand({ offline = false }: { offline?: boolean }) {
  const [conversion, setConversion] = useState<Conversion>();
  const [isConverting, setIsConverting] = useState(false);
  const preferences = getPreferenceValues<Preferences>();

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
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: offline ? "Creating offline Markdown" : "Converting webpage locally",
    });

    try {
      const extractedPage = await extractWebpage(sourceUrl);
      const fileNameStyle = selectedFileNameStyle(values.outputTitleFormat, preferences);
      let result: Conversion;

      if (offline) {
        const output = await getAvailableOfflineOutput(
          extractedPage.title,
          values.outputFileName,
          preferences,
          values.outputDirectory?.[0],
          fileNameStyle,
        );
        result = await createConversion(extractedPage, values.outputFileName, {
          directory: output.assetsDirectory,
          filePrefix: basename(output.markdownPath, extname(output.markdownPath)),
        });
        await writeFile(output.markdownPath, formatDocument(result), "utf8");
        result.savedPath = output.markdownPath;
        result.outputDirectory = values.outputDirectory?.[0];
        result.fileNameStyle = fileNameStyle;
        result.offline = true;
        toast.style = Toast.Style.Success;
        toast.title = "Offline Markdown saved";
        toast.message = basename(output.directory);
      } else {
        result = await createConversion(extractedPage, values.outputFileName);
        result.outputDirectory = values.outputDirectory?.[0];
        result.fileNameStyle = fileNameStyle;
        toast.style = Toast.Style.Success;
        toast.title = "Markdown ready";
        toast.message = "Nothing was sent to a conversion service.";
      }

      setConversion(result);
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = offline ? "Could not create offline Markdown" : "Could not convert this webpage";
      toast.message = errorMessage(error);
    } finally {
      setIsConverting(false);
    }
  }

  if (conversion) {
    return (
      <MarkdownDetail
        conversion={conversion}
        preferences={preferences}
        onConvertAnother={() => setConversion(undefined)}
      />
    );
  }

  return (
    <Form
      isLoading={isConverting}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title={offline ? "Create Offline Markdown" : "Convert to Markdown"}
            icon={Icon.Document}
            onSubmit={handleSubmit}
          />
          <Action title="Configure Output and Editors" icon={Icon.Gear} onAction={openExtensionPreferences} />
        </ActionPanel>
      }
    >
      <Form.Description
        text={
          offline
            ? "Downloads the page and its article images directly to your computer. Markdown is saved immediately, with local images in an assets folder."
            : "Downloads the page directly, then extracts and converts its content on this device. The webpage itself still receives a normal request from your computer."
        }
      />
      <Form.TextField
        id="url"
        title="Webpage URL"
        placeholder="https://example.com/article"
        autoFocus
        info="The page must be reachable from this computer. Browser sign-in sessions are not shared."
      />
      <Form.TextField
        id="outputFileName"
        title="Output File Name"
        placeholder="Optional - generated from the page title"
        info="Optional. You can include .md, but it is not required and will not be duplicated."
      />
      <Form.Dropdown
        id="outputTitleFormat"
        title="Output Title Format"
        defaultValue="default"
        info="Used to generate the output file name when Output File Name is left blank."
      >
        <Form.Dropdown.Item value="default" title="Use Default Preference" />
        <Form.Dropdown.Item value="kebab-case" title="lowercase-with-dashes" />
        <Form.Dropdown.Item value="snake_case" title="lowercase_with_underscores" />
        <Form.Dropdown.Item value="title-case" title="Title Case" />
        <Form.Dropdown.Item value="dated-kebab-case" title="date-lowercase-with-dashes" />
      </Form.Dropdown>
      <Form.FilePicker
        id="outputDirectory"
        title="Save To"
        allowMultipleSelection={false}
        canChooseDirectories
        canChooseFiles={false}
        info={
          offline
            ? "Optional. The selected folder will contain a new folder named after the Markdown file; that folder contains the .md file and assets folder."
            : "Optional. Used when you save the Markdown from the result screen. Leave blank to use the default output folder."
        }
      />
    </Form>
  );
}

function MarkdownDetail({
  conversion,
  preferences,
  onConvertAnother,
}: {
  conversion: Conversion;
  preferences: Preferences;
  onConvertAnother: () => void;
}) {
  const [savedPath, setSavedPath] = useState(conversion.savedPath);
  const markdown = formatDocument(conversion);

  async function saveMarkdown(): Promise<string> {
    if (savedPath) {
      return savedPath;
    }

    const outputPath = await getAvailableOutputPath(
      conversion.title,
      conversion.outputFileName,
      preferences,
      conversion.outputDirectory,
      conversion.fileNameStyle,
    );
    await writeFile(outputPath, markdown, "utf8");
    setSavedPath(outputPath);
    await showToast({ style: Toast.Style.Success, title: "Markdown saved", message: basename(outputPath) });
    return outputPath;
  }

  async function openInEditor(saveFirst: boolean) {
    const editorCommand = preferences.editorCommand?.trim();
    if (!editorCommand) {
      throw new Error("Configure Text Editor Command in this extension's preferences first.");
    }

    const filePath = saveFirst ? await saveMarkdown() : await writeTemporaryMarkdown(markdown, conversion.title);
    launchEditor(editorCommand, filePath);
    await showToast({ style: Toast.Style.Success, title: "Opened in text editor", message: basename(filePath) });
  }

  async function openInMarkdownViewer(saveFirst: boolean) {
    const markdownViewer = preferences.markdownViewer?.trim();
    if (!markdownViewer) {
      throw new Error("Configure Markdown Viewer App in this extension's preferences first.");
    }

    const filePath = saveFirst ? await saveMarkdown() : await writeTemporaryMarkdown(markdown, conversion.title);
    await open(filePath, markdownViewer);
  }

  return (
    <Detail
      navigationTitle={conversion.title}
      markdown={markdown}
      actions={
        <ActionPanel>
          <Action.CopyToClipboard title="Copy Markdown" content={markdown} />
          <Action
            title={savedPath ? "Show Saved Markdown" : "Save Markdown"}
            icon={Icon.Folder}
            onAction={() => runAction(savedPath ? () => showInFinder(savedPath) : saveMarkdown)}
          />
          <Action
            title="Save and Open in Text Editor"
            icon={Icon.Text}
            onAction={() => runAction(() => openInEditor(true))}
          />
          <Action
            title="Open in Text Editor Without Saving"
            icon={Icon.Text}
            onAction={() => runAction(() => openInEditor(false))}
          />
          <Action
            title="Save and Open in Markdown Viewer"
            icon={Icon.Eye}
            onAction={() => runAction(() => openInMarkdownViewer(true))}
          />
          <Action
            title="Open in Markdown Viewer Without Saving"
            icon={Icon.Eye}
            onAction={() => runAction(() => openInMarkdownViewer(false))}
          />
          <Action.CopyToClipboard title="Copy Source URL" content={conversion.sourceUrl} />
          <Action.OpenInBrowser title="Open Original Webpage" url={conversion.sourceUrl} />
          <Action
            title="Convert Another Webpage"
            icon={Icon.Plus}
            onAction={onConvertAnother}
            shortcut={Keyboard.Shortcut.Common.New}
          />
          <Action title="Configure Output and Editors" icon={Icon.Gear} onAction={openExtensionPreferences} />
        </ActionPanel>
      }
    />
  );
}

async function runAction(action: () => Promise<unknown>) {
  try {
    await action();
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Action could not be completed",
      message: errorMessage(error),
    });
  }
}

async function extractWebpage(sourceUrl: URL): Promise<ExtractedPage> {
  const html = await fetchHtml(sourceUrl);
  const { document } = parseHTML(html);
  const article = new Readability(document).parse();
  const contentHtml = article?.content?.trim() || document.body.innerHTML;

  if (!contentHtml.trim()) {
    throw new Error("The page did not contain any readable HTML.");
  }

  return {
    contentHtml,
    sourceUrl: sourceUrl.href,
    title: normalizeQuotes(article?.title?.trim() || document.title.trim() || sourceUrl.hostname),
    siteName: normalizeQuotes(article?.siteName),
    byline: normalizeQuotes(article?.byline),
    excerpt: normalizeQuotes(article?.excerpt),
  };
}

async function createConversion(
  extractedPage: ExtractedPage,
  outputFileName?: string,
  assetOptions?: AssetOptions,
): Promise<Conversion> {
  const { document } = parseHTML(`<!doctype html><html><body>${extractedPage.contentHtml}</body></html>`);
  removeNonContentElements(document);
  promoteLazyImageSources(document);
  makeUrlsAbsolute(document, new URL(extractedPage.sourceUrl));

  if (assetOptions) {
    await localizeImages(document, assetOptions);
  }

  const turndownService = new TurndownService({
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "_",
    headingStyle: "atx",
  });
  const markdown = normalizeQuotes(turndownService.turndown(document.body.innerHTML).trim());

  if (!markdown) {
    throw new Error("The page did not contain any convertible article text.");
  }

  return { ...extractedPage, markdown, outputFileName };
}

async function localizeImages(document: Document, assetOptions: AssetOptions) {
  const downloadedImages = new Map<string, string>();
  let imageNumber = 1;
  await mkdir(assetOptions.directory, { recursive: true });

  for (const image of document.querySelectorAll<HTMLElement>("img[src]")) {
    const source = image.getAttribute("src");
    if (!source || source.startsWith("data:")) {
      continue;
    }

    try {
      const imageUrl = new URL(source);
      if (imageUrl.protocol !== "http:" && imageUrl.protocol !== "https:") {
        image.remove();
        continue;
      }

      let fileName = downloadedImages.get(imageUrl.href);
      if (!fileName) {
        const downloadedImage = await fetchImage(imageUrl);
        const extension = imageExtension(downloadedImage.contentType, imageUrl);
        fileName = await writeUniqueImage(
          assetOptions.directory,
          `${assetOptions.filePrefix}-image-${String(imageNumber).padStart(3, "0")}.${extension}`,
          downloadedImage.contents,
        );
        imageNumber += 1;
        downloadedImages.set(imageUrl.href, fileName);
      }

      image.setAttribute("src", `assets/${fileName}`);
      image.removeAttribute("srcset");
    } catch {
      // A missing image must not make the saved Markdown refer to an online resource.
      image.remove();
    }
  }
}

async function writeUniqueImage(directory: string, suggestedFileName: string, contents: Uint8Array): Promise<string> {
  const extension = extname(suggestedFileName);
  const stem = basename(suggestedFileName, extension);

  for (let suffix = 0; ; suffix += 1) {
    const fileName = `${stem}${suffix ? `-${suffix + 1}` : ""}${extension}`;
    try {
      await writeFile(join(directory, fileName), contents, { flag: "wx" });
      return fileName;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
    }
  }
}

async function fetchHtml(url: URL): Promise<string> {
  const response = await fetchWithTimeout(url, { Accept: "text/html,application/xhtml+xml" });

  if (!response.ok) {
    throw new Error(`The website returned ${response.status} ${response.statusText}.`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
    throw new Error("The URL did not return an HTML webpage.");
  }

  const contents = await decodeResponse(
    response,
    MAX_PAGE_SIZE_BYTES,
    "The webpage is larger than the 20 MB conversion limit.",
  );
  return new TextDecoder().decode(contents);
}

async function fetchImage(url: URL): Promise<{ contents: Uint8Array; contentType: string }> {
  const response = await fetchWithTimeout(url, {
    Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
  });
  if (!response.ok) {
    throw new Error(`Image returned ${response.status}.`);
  }

  return {
    contents: await decodeResponse(response, MAX_IMAGE_SIZE_BYTES, "An image is larger than the 20 MB limit."),
    contentType: response.headers.get("content-type") ?? "",
  };
}

async function fetchWithTimeout(url: URL, headers: Record<string, string>): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      headers: { ...headers, "User-Agent": "Raycast Webpage to Markdown (Local)" },
      redirect: "follow",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("The webpage took longer than 20 seconds to respond.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function decodeResponse(response: Response, maxSize: number, sizeError: string): Promise<Uint8Array> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxSize) {
    throw new Error(sizeError);
  }

  const contents = new Uint8Array(await response.arrayBuffer());
  if (contents.byteLength > maxSize) {
    throw new Error(sizeError);
  }

  return contents;
}

function imageExtension(contentType: string, url: URL): string {
  const typeToExtension: Record<string, string> = {
    "image/avif": "avif",
    "image/bmp": "bmp",
    "image/gif": "gif",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/svg+xml": "svg",
    "image/webp": "webp",
    "image/x-icon": "ico",
  };
  const mimeType = contentType.split(";", 1)[0].toLowerCase();
  if (typeToExtension[mimeType]) {
    return typeToExtension[mimeType];
  }

  const urlExtension = extname(url.pathname).slice(1).toLowerCase();
  return /^[a-z0-9]{1,5}$/.test(urlExtension) ? urlExtension : "img";
}

function formatDocument(conversion: Conversion): string {
  const metadata = [conversion.siteName, conversion.byline].filter(Boolean).join(" - ");
  return [
    `# ${conversion.title}`,
    metadata ? `\n${metadata}` : "",
    `\nSource: ${conversion.sourceUrl}`,
    conversion.excerpt ? `\n> ${conversion.excerpt}` : "",
    "\n---\n",
    conversion.markdown,
  ]
    .filter(Boolean)
    .join("\n");
}

async function getAvailableOutputPath(
  title: string,
  requestedFileName: string | undefined,
  preferences: Preferences,
  requestedDirectory?: string,
  fileNameStyle?: FileNameStyle,
) {
  const directory = outputDirectory(requestedDirectory || preferences.outputDirectory);
  await mkdir(directory, { recursive: true });

  const stem = requestedFileName?.trim()
    ? customFileStem(requestedFileName)
    : generatedFileStem(title, fileNameStyle ?? preferences.fileNameStyle ?? "kebab-case");

  for (let suffix = 0; ; suffix += 1) {
    const outputPath = join(directory, `${stem}${suffix ? `-${suffix + 1}` : ""}.md`);
    if (!(await pathExists(outputPath))) {
      return outputPath;
    }
  }
}

async function getAvailableOfflineOutput(
  title: string,
  requestedFileName: string | undefined,
  preferences: Preferences,
  requestedDirectory?: string,
  fileNameStyle?: FileNameStyle,
): Promise<{ directory: string; markdownPath: string; assetsDirectory: string }> {
  const parentDirectory = outputDirectory(requestedDirectory || preferences.outputDirectory);
  await mkdir(parentDirectory, { recursive: true });

  const stem = requestedFileName?.trim()
    ? customFileStem(requestedFileName)
    : generatedFileStem(title, fileNameStyle ?? preferences.fileNameStyle ?? "kebab-case");

  for (let suffix = 0; ; suffix += 1) {
    const folderName = `${stem}${suffix ? `-${suffix + 1}` : ""}`;
    const directory = join(parentDirectory, folderName);
    if (!(await pathExists(directory))) {
      await mkdir(directory);
      return {
        directory,
        markdownPath: join(directory, `${folderName}.md`),
        assetsDirectory: join(directory, "assets"),
      };
    }
  }
}

function outputDirectory(configuredDirectory?: string): string {
  const value = configuredDirectory?.trim();
  if (!value) {
    return join(homedir(), "Downloads");
  }

  return value === "~" ? homedir() : value.startsWith("~/") ? join(homedir(), value.slice(2)) : value;
}

function selectedFileNameStyle(value: FormValues["outputTitleFormat"], preferences: Preferences): FileNameStyle {
  return value === "default" ? (preferences.fileNameStyle ?? "kebab-case") : value;
}

function customFileStem(fileName: string): string {
  const withoutExtension = basename(fileName.replaceAll("\\", "/")).replace(/(?:\.md)+$/i, "");
  const cleaned = withoutExtension
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^\.+|\.+$/g, "")
    .trim();
  return cleaned || "webpage";
}

function generatedFileStem(title: string, style: FileNameStyle): string {
  const words = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .match(/[A-Za-z0-9]+/g);
  const safeWords = words?.length ? words : ["webpage"];
  const lowercaseWords = safeWords.map((word) => word.toLowerCase());

  switch (style) {
    case "snake_case":
      return lowercaseWords.join("_");
    case "title-case":
      return safeWords.map((word) => `${word[0].toUpperCase()}${word.slice(1).toLowerCase()}`).join(" ");
    case "dated-kebab-case":
      return `${new Date().toISOString().slice(0, 10)}-${lowercaseWords.join("-")}`;
    case "kebab-case":
    default:
      return lowercaseWords.join("-");
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function writeTemporaryMarkdown(markdown: string, title: string): Promise<string> {
  const directory = join(tmpdir(), "raycast-webpage-to-markdown");
  await mkdir(directory, { recursive: true });
  const filePath = join(directory, `${generatedFileStem(title, "kebab-case")}-${Date.now()}.md`);
  await writeFile(filePath, markdown, "utf8");
  return filePath;
}

function launchEditor(command: string, filePath: string) {
  const isWindows = process.platform === "win32";
  const shell = isWindows ? "cmd.exe" : "/bin/sh";
  const commandLine = isWindows
    ? `${command} "${filePath.replaceAll('"', '\\"')}"`
    : `${command} ${shellQuote(filePath)}`;
  const child = spawn(shell, isWindows ? ["/d", "/s", "/c", commandLine] : ["-lc", commandLine], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
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

function promoteLazyImageSources(document: Document) {
  document.querySelectorAll<HTMLElement>("img:not([src])").forEach((image) => {
    const source =
      image.getAttribute("data-src") || image.getAttribute("data-original") || image.getAttribute("data-lazy-src");
    if (source) {
      image.setAttribute("src", source);
    }
  });
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

function normalizeQuotes(value: string): string;
function normalizeQuotes(value: string | null | undefined): string | null | undefined;
function normalizeQuotes(value: string | null | undefined): string | null | undefined {
  return value
    ?.replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036\u00AB\u00BB]/g, '"');
}
