// main.js
import './style.css';
import JSZip from 'jszip';

// Wait for DOM to be fully loaded before initializing
document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const dropZone = document.getElementById('dropZone');
  const pdfInputElement = document.getElementById('pdfInput');
  const fileNameElement = document.getElementById('fileName');
  const zipButton = document.getElementById('zipButton');
  const outputElement = document.getElementById('output');
  const downloadsElement = document.getElementById('downloads');
  const loaderElement = document.getElementById('loader');

  // State variables
  let pyodide = null;
  let pythonScript = '';
  let generatedFiles = [];
  let isPyodideReady = false; // Flag to track pyodide status

  // Disable buttons initially
  zipButton.disabled = true;
  outputElement.textContent = 'Loading Pyodide (Python runtime)... Please wait.';

  // --- 1. Load Pyodide and Python Script ---
  async function loadPyodideAndScript() {
    try {
      console.log('Loading Pyodide...');

      // Use the globally available loadPyodide function (from the script tag in index.html)
      pyodide = await loadPyodide();

      console.log('Pyodide loaded. Loading micropip...');
      outputElement.textContent = 'Pyodide loaded. Loading micropip package...';
      await pyodide.loadPackage(['micropip']);
      const micropip = pyodide.pyimport('micropip');

      console.log('Micropip loaded. Installing pypdf...');
      outputElement.textContent = 'Installing pypdf...';
      await micropip.install('pypdf');

      console.log('pypdf installed. Fetching Python script...');
      outputElement.textContent = 'pypdf installed. Fetching Python splitter script...';

      const response = await fetch('/pdf_splitter.py');
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      pythonScript = await response.text();

      console.log('Python script fetched. Defining in Pyodide scope...');
      // Define script functions in Pyodide global scope *once*
      pyodide.runPython(pythonScript);

      console.log('Pyodide and script ready.');
      outputElement.textContent = 'Ready. Drop or select a PDF file.';
      isPyodideReady = true;
    } catch (error) {
      outputElement.textContent = `Error loading Pyodide or dependencies: ${error}. Check console for details. Please refresh the page.`;
      console.error('Pyodide loading error:', error);
    }
  }

  // --- 2. Drag and Drop Event Handlers ---

  // Prevent default behaviors for drag events
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, preventDefaults, false);
    document.body.addEventListener(eventName, preventDefaults, false); // Prevent browser opening file on accidental drop outside zone
  });

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  // Highlight drop zone when item is dragged over it
  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, highlight, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, unhighlight, false);
  });

  function highlight(e) {
    if (!dropZone.classList.contains('dragover')) {
      dropZone.classList.add('dragover');
    }
  }

  function unhighlight(e) {
    dropZone.classList.remove('dragover');
  }

  // Handle dropped files
  dropZone.addEventListener('drop', handleDrop, false);

  function handleDrop(e) {
    console.log('File dropped!');
    const dt = e.dataTransfer;
    const files = dt.files;

    // Process the first file dropped
    if (files.length > 0) {
      handleFile(files[0]); // Pass the File object directly
    } else {
      outputElement.textContent = 'No file detected in drop.';
    }
  }

  // --- 3. Click Handling (Fallback to File Input) ---
  dropZone.addEventListener('click', () => {
    if (!isPyodideReady) {
      outputElement.textContent = 'Please wait for the Python environment to load.';
      return;
    }
    pdfInputElement.click(); // Trigger the hidden file input
  });

  pdfInputElement.addEventListener('change', (event) => {
    if (event.target.files.length > 0) {
      handleFile(event.target.files[0]);
    }
  });

  // --- 4. Central File Handling Function ---
  async function handleFile(file) {
    console.log('Handling file:', file.name);
    if (!file) {
      outputElement.textContent = 'No file provided.';
      return;
    }

    // Basic validation (check if PDF)
    if (!file.type || !file.type.includes('pdf')) {
      outputElement.textContent = `Error: Selected file (${file.name}) is not a PDF. Please select a PDF file.`;
      fileNameElement.textContent = ''; // Clear file name display
      pdfInputElement.value = ''; // Reset file input
      return;
    }

    if (!isPyodideReady || !pyodide || !pythonScript) {
      outputElement.textContent = 'Environment not ready (Pyodide, Python script). Please wait or refresh.';
      return;
    }

    // Reset state
    zipButton.disabled = true;
    loaderElement.style.display = 'inline-block';
    downloadsElement.innerHTML = '(Processing...)';
    generatedFiles = [];
    fileNameElement.textContent = `Selected: ${file.name}`; // Show selected file name
    outputElement.textContent = `Reading file: ${file.name}...`;

    try {
      const fileBuffer = await file.arrayBuffer();
      outputElement.textContent = `File read (${(fileBuffer.byteLength / 1024 / 1024).toFixed(2)} MB). Running Python script... This may take a moment.`;

      // Check if the function exists in Pyodide scope (it should due to initial runPython)
      if (!pyodide.globals.has('split_pdf_data')) {
        console.error('Python function \'split_pdf_data\' not found in Pyodide scope!');
        throw new Error('Python environment error. Please refresh.');
      }

      const splitPdfData = pyodide.globals.get('split_pdf_data');
      const pdfBytesPy = pyodide.toPy(new Uint8Array(fileBuffer));

      console.time('Python Processing');
      // IMPORTANT: Use await if the Python function could potentially be async
      const resultJs = await splitPdfData(pdfBytesPy, file.name);
      console.timeEnd('Python Processing');

      // Convert result if necessary
      const results = typeof resultJs?.toJs === 'function'
        ? resultJs.toJs({ dict_converter: Object.fromEntries })
        : resultJs;

      // --- Process Results (same as before) ---
      outputElement.textContent = `Python script finished.\nStatus: ${results.status}\nMessage: ${results.message}`;
      if (results.console_log) {
        outputElement.textContent += '\n\n--- Console Log (from TOC generation) ---\n' + results.console_log;
      }

      downloadsElement.innerHTML = ''; // Clear processing message

      if (results.status === 'success') {
        // Store TOC text
        if (results.toc_text) {
          generatedFiles.push({
            name: 'chapters.txt',
            data: results.toc_text,
            type: 'text/plain',
          });
          createDownloadLink(results.toc_text, 'chapters.txt', 'text/plain', downloadsElement);
        }

        // Store TOC JSON
        if (results.toc_json) {
          generatedFiles.push({
            name: 'chapters.json',
            data: results.toc_json,
            type: 'application/json',
          });
          createDownloadLink(results.toc_json, 'chapters.json', 'application/json', downloadsElement);
        }

        // Store chapter PDFs
        if (results.chapters && results.chapters.length > 0) {
          for (const chapter of results.chapters) {
            const filename = chapter[0];
            const pdfData = chapter[1];
            let pdfBytes = null;

            if (typeof pdfData?.toJs === 'function') {
              const jsBytes = pdfData.toJs();
              if (jsBytes instanceof Uint8Array) pdfBytes = jsBytes;
              else try {
                pdfBytes = new Uint8Array(jsBytes);
              } catch (e) {
                console.warn('Failed Uint8Array conversion for', filename, e);
              }
            } else if (pdfData instanceof Uint8Array) {
              pdfBytes = pdfData;
            } else if (pdfData instanceof ArrayBuffer) {
              pdfBytes = new Uint8Array(pdfData);
            } else {
              console.error(`Unsupported data type for chapter ${filename}:`, typeof pdfData);
            }

            if (pdfBytes) {
              generatedFiles.push({
                name: filename,
                data: pdfBytes,
                type: 'application/pdf',
              });
              createDownloadLink(pdfBytes, filename, 'application/pdf', downloadsElement);
            } else {
              downloadsElement.innerHTML += `<p>Error preparing download for ${filename}: Invalid data.</p>`;
            }
          }
        }

        if (generatedFiles.length > 0) {
          zipButton.disabled = false;
          downloadsElement.innerHTML += `<p style="margin-top:15px; font-weight:bold;">${generatedFiles.length} file(s) generated. Download individually above or use the 'Download All' button.</p>`;
        } else {
          downloadsElement.innerHTML = '(No valid chapters/files were generated based on the PDF outline.)';
          if (results.message.includes('Warning:')) {
            // Add warning if present
            downloadsElement.innerHTML += '<br/>' + results.message.split('\n')
              .filter(line => line.includes('Warning:'))
              .join('<br/>');
          }
        }
      } else {
        downloadsElement.innerHTML = `(Processing failed: ${results.message})`;
        zipButton.disabled = true;
      }

      // Clean up Python objects
      pdfBytesPy.destroy();
      // resultJs?.destroy(); // If it was a PyProxy
    } catch (error) {
      outputElement.textContent = `JavaScript error during processing: ${error}\n${error.stack}`;
      console.error('Processing error:', error);
      downloadsElement.innerHTML = '(Processing failed - See Console)';
      zipButton.disabled = true;
    } finally {
      loaderElement.style.display = 'none';
      pdfInputElement.value = ''; // Reset file input to allow selecting the same file again
    }
  }

  // --- 5. Handle ZIP Button Click ---
  zipButton.addEventListener('click', async () => {
    if (generatedFiles.length === 0) {
      alert('No files available to zip.');
      return;
    }

    zipButton.disabled = true;
    loaderElement.style.display = 'inline-block';
    let originalFileNameBase = generatedFiles.find(f => f.name.toLowerCase().endsWith('.pdf'))
      ?.name.replace(/\.pdf$/i, '').substring(3) || // Try to get base name from first chapter
      fileNameElement.textContent.replace(/^Selected: /, '').replace(/\.pdf$/i, '') || // Fallback to input file name
      'split_output';

    outputElement.textContent += `\nCreating ZIP file '${originalFileNameBase}_chapters.zip'...`;

    try {
      const zip = new JSZip();
      generatedFiles.forEach(file => zip.file(file.name, file.data)); // Add files

      console.time('ZIP Generation');
      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });
      console.timeEnd('ZIP Generation');

      // Trigger download
      const link = document.createElement('a');
      link.href = URL.createObjectURL(zipBlob);
      link.download = `${originalFileNameBase}_chapters.zip`;
      document.body.appendChild(link); // Required for firefox
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href); // Clean up blob URL

      outputElement.textContent += `\nZIP created. Download started.`;
    } catch (error) {
      outputElement.textContent += `\nError creating ZIP file: ${error}`;
      console.error('ZIP creation error:', error);
    } finally {
      zipButton.disabled = false;
      loaderElement.style.display = 'none';
    }
  });

  // --- 6. Helper Function to Create Download Links ---
  function createDownloadLink(data, filename, mimeType, containerElement) {
    const blob = new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.textContent = `Download ${filename}`;
    a.style.marginRight = '10px';

    const p = document.createElement('p'); // Wrap link in paragraph
    p.appendChild(a);
    containerElement.appendChild(p);

    // Optional: Clean up the object URL later
    // setTimeout(() => URL.revokeObjectURL(url), 60000 * 5); // Revoke after 5 minutes
  }

  // --- Start Loading Pyodide ---
  loadPyodideAndScript();
});
