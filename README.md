# PDF Splitter (WebAssembly Edition)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FYOUR_GITHUB_USERNAME%2Fpdf-splitter) <!-- Replace with your actual repo URL -->

A web application that splits a PDF file into multiple separate PDF files, one for each top-level chapter defined in the document's outline (table of contents). This project uniquely performs all PDF processing directly in the user's browser using Python compiled to WebAssembly (WASM) via Pyodide.

## Features

*   **Client-Side Processing:** No server-side PDF handling required. Files are processed locally in the browser.
*   **Drag & Drop Interface:** Easily upload PDF files.
*   **Outline-Based Splitting:** Automatically detects top-level outline items (chapters) to determine split points.
*   **Generates TOC:** Creates downloadable `chapters.txt` and `chapters.json` files representing the PDF's outline.
*   **Individual Downloads:** Download split chapter PDFs individually.
*   **ZIP Download:** Download all generated chapters and TOC files conveniently packaged in a single ZIP archive.
*   **Pure Python Logic:** Leverages the powerful `pypdf` library running via Pyodide.

## How It Works

1.  **Load Pyodide:** The application first initializes the Pyodide runtime, loading the Python interpreter into the browser.
2.  **Install Dependencies:** It uses `micropip` (Pyodide's package manager) to install the `pypdf` library.
3.  **Fetch Python Script:** The `pdf_splitter.py` script containing the PDF processing logic is fetched.
4.  **User Upload:** The user drags & drops or selects a PDF file.
5.  **Pass to Python:** The JavaScript frontend reads the PDF file as raw bytes and passes it to the Python `split_pdf_data` function executed by Pyodide.
6.  **Python Processing:** The Python script uses `pypdf` to:
    *   Read the PDF structure and outline.
    *   Determine page ranges for each top-level outline item.
    *   Generate separate PDF data (in memory) for each chapter.
    *   Generate plain text and JSON representations of the table of contents.
7.  **Return Results:** The Python script returns the generated chapter data (as bytes), TOC strings, and status messages back to JavaScript.
8.  **Display & Download:** JavaScript creates download links for each generated file (chapters and TOCs) and enables the "Download All as ZIP" button, which uses the `JSZip` library to create the archive on the fly.

## Technologies Used

*   **Frontend:** HTML5, CSS3, JavaScript (ES Modules)
*   **WASM Runtime:** [Pyodide](https://pyodide.org/)
*   **Python PDF Library:** [pypdf](https://pypi.org/project/pypdf/)
*   **JS ZIP Library:** [JSZip](https://stuk.github.io/jszip/)
*   **Build Tool:** [Vite](https://vitejs.dev/)
*   **Package Manager:** [pnpm](https://pnpm.io/)
*   **Deployment:** Configured for [Vercel](https://vercel.com/)

## Prerequisites

*   [Node.js](https://nodejs.org/) (Version specified by Vite/project dependencies - generally >=18)
*   [pnpm](https://pnpm.io/installation)

## Getting Started

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/YOUR_GITHUB_USERNAME/pdf-splitter.git # Replace with your repo URL
    cd pdf-splitter
    ```

2.  **Install dependencies:**
    ```bash
    pnpm install
    ```

3.  **Run the development server:**
    ```bash
    pnpm run dev
    ```
    This will start the Vite development server, typically at `http://localhost:3000`. The application will open in your default browser.

    *(Note: Pyodide and `pypdf` will be downloaded and initialized in the browser on first load, which may take a moment.)*

## Building for Production

To create an optimized static build of the application:

```bash
pnpm run build
```

The production-ready files will be generated in the `dist/` directory. You can preview the production build locally using:

```bash
pnpm run preview
```

## Deployment

This project includes a `vercel.json` configuration file, making it ready for seamless deployment on [Vercel](https://vercel.com/).

1.  Push your code to a Git repository (GitHub, GitLab, Bitbucket).
2.  Import the project into Vercel.
3.  Vercel should automatically detect the Vite framework and configure the build settings based on `vercel.json` and `package.json`.
4.  Click "Deploy".

Alternatively, click the "Deploy with Vercel" button at the top of this README after replacing the placeholder URL with your repository's URL.

## Contributing

Contributions are welcome! Please feel free to open an issue or submit a pull request.

(Consider adding more specific contribution guidelines if applicable).

## License

(Specify your license here. MIT is a common choice for open-source projects.)

Example:
This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details (if you create one). 
