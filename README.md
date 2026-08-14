<p align="center">
  <img width="256" alt="Webpage to Markdown icon" src="webpage-to-markdown-local/assets/webpage-to-markdown-logo.png" />
</p>

# Webpage to Markdown for Raycast

Convert webpages to clean Markdown directly on your computer. The extension downloads pages from your Mac, extracts readable content, and converts it locally. It does not send page contents to an AI or cloud conversion service.

The Raycast extension source lives in [`webpage-to-markdown-local/`](./webpage-to-markdown-local/), a Raycast-generated extension directory.

## Commands

- **Webpage to Markdown** - paste a URL to preview the converted Markdown in Raycast. From the Action Panel, copy it, save it, or open it in a configured text editor or Markdown viewer.
- **Webpage to Offline Markdown** - save a self-contained export immediately. The extension downloads article images and changes image paths to local relative files.

Both commands accept an optional output filename and destination folder. The `.md` extension is optional; the extension never adds it twice.

## Offline export layout

Offline exports are organized as a single folder so the Markdown and downloaded images can travel together:

```text
chosen-destination/
  article-name/
    article-name.md
    assets/
      article-name-image-001.jpg
      article-name-image-002.png
```

The selected destination receives the `article-name` folder. The Markdown file itself is not placed directly in the selected destination.

## Output controls

The command form lets you choose:

| Control | What it does |
| --- | --- |
| **Output File Name** | Sets the filename. Leave it blank to derive a name from the webpage title. |
| **Output Title Format** | Selects lowercase dashes, lowercase underscores, Title Case, date-prefixed lowercase dashes, or the extension default. It applies only when the filename is blank. |
| **Save To** | Chooses a destination for this run. Leave it blank to use the configured default output folder. |

## Preferences

Open the extension preferences in Raycast to configure these defaults:

| Preference | Purpose |
| --- | --- |
| **Default Output Folder** | Where saved Markdown goes when no destination is selected in the command. Defaults to Downloads. |
| **Generated File Name Style** | The naming convention used when no per-run format is selected. |
| **Text Editor Command** | Command used to open generated Markdown. For example: `/opt/homebrew/bin/codium`. |
| **Markdown Viewer App** | The macOS app used to open rendered Markdown. |

The Action Panel includes options to save first before opening an editor or viewer, or to open a temporary file without creating an output-file copy.

## Privacy and limitations

- The target webpage still receives a normal request from your computer.
- Page extraction and HTML-to-Markdown conversion happen locally.
- The extension does not share your browser cookies, so pages that require a browser sign-in may not work.
- Offline exports download readable article images. They do not mirror an entire website or rewrite ordinary article links.
- Typographic single and double quotes are converted to plain ASCII quotes in the generated Markdown.

## Run locally

Install Node.js and [Raycast](https://www.raycast.com/) first, then run the following from the Raycast extension directory:

```sh
cd webpage-to-markdown-local
npm install
npm run dev
```

Raycast imports the extension in development mode and reloads it as source files change. Before publishing or sharing changes, validate it with:

```sh
npm run lint
npm run build
```

## Upstream references

- [Raycast extension development guide](https://developers.raycast.com/basics/getting-started)
- [Raycast CLI documentation](https://developers.raycast.com/information/developer-tools/cli)
- [Raycast extension templates](https://developers.raycast.com/information/developer-tools/templates)
- [Mozilla Readability](https://github.com/mozilla/readability)
- [Turndown](https://github.com/mixmark-io/turndown)

## Administrative notes

This extension is currently intended for local development and installation. It was co-authored with AI assistance.
