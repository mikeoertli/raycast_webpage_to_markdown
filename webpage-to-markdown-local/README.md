# Webpage to Markdown (Local)

Convert a webpage to Markdown without sending its contents to a cloud conversion service.

## Commands

1. Open **Webpage to Markdown** to preview local Markdown conversion. Its Command-K menu can copy Markdown, save it, or open it in a configured editor or Markdown viewer.
2. Open **Webpage to Offline Markdown** to save Markdown immediately and download the article images into an `assets` folder. Each export gets its own folder, named after the Markdown file, containing the `.md` file and `assets` folder. Image paths in the Markdown use local relative links.

Both commands let you optionally name the output file and select a destination folder for that run. The `.md` extension is optional and is never added twice. Offline exports create their own folder inside the selected destination; the `.md` file is not placed in the selected destination directly.

## How it works

1. Enter an `http` or `https` URL and press Enter.
2. Copy, save, or open the converted Markdown from the result view.

The extension downloads the webpage directly from your computer, extracts its readable content with Mozilla Readability, and converts the resulting HTML with Turndown. It does not send page contents to an AI or third-party conversion service. Typographic single and double quotes are converted to plain ASCII quotes in the resulting Markdown.

## Preferences

- **Default Output Folder**: where generated Markdown files are saved; defaults to Downloads.
- **Generated File Name Style**: supports lowercase dashes, lowercase underscores, Title Case, and date-prefixed lowercase dashes.
- **Text Editor Command**: a command to open the Markdown in an editor. Configure this before using the editor actions; for example, `/opt/homebrew/bin/codium`.
- **Markdown Viewer App**: an app that opens rendered Markdown. Configure this before using the Markdown viewer actions.

The "without saving" editor and viewer actions create a temporary Markdown file, not a file in the output folder.

The URL must be reachable from your computer. Pages that require a browser sign-in may not work because the extension does not share browser cookies.
