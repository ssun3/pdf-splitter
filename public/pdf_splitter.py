# pdf_splitter.py (Modified for Pyodide/Browser)

from io import BytesIO  # Use in-memory bytes buffer
from pypdf import PdfReader, PdfWriter
from itertools import chain
import json, re, unicodedata as ud


# --- Helper functions (mostly unchanged) ---
def slugify(s: str) -> str:
    if not isinstance(s, str):
        raise TypeError(f"slugify expected str, got {type(s)}: {s}")
    s = ud.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^\w]+", "_", s).strip("_").lower() or "unknown"


def resolve_title(obj) -> str:
    try:
        return obj.title() if callable(obj.title) else obj.title
    except Exception:
        return "unknown"


def outline_to_ranges(reader: PdfReader):
    outlines = list(reader.outline)
    tops = [o for o in outlines if not isinstance(o, list)]
    # Handle cases where outline destinations might be invalid or None
    pages = []
    valid_tops = []
    for o in tops:
        try:
            page_num = reader.get_destination_page_number(o)
            if page_num is not None:
                pages.append(page_num)
                valid_tops.append(o)
            else:
                print(
                    f"Warning: Could not get page number for outline item: {resolve_title(o)}"
                )
        except Exception as e:
            print(f"Warning: Error processing outline item {resolve_title(o)}: {e}")

    if not pages:  # No valid top-level outlines found
        return []

    end_pages = chain(pages[1:], [len(reader.pages)])
    return [
        (f"{i+1:02d}_{slugify(resolve_title(t))}", s, e)
        for i, (t, s, e) in enumerate(zip(valid_tops, pages, end_pages))
        # Ensure start page is less than end page
        if s < e
    ]


# --- Modified functions for browser ---


# Instead of writing to disk, return bytes
def create_slice_data(reader: PdfReader, triple):
    name, start, end = triple
    writer = PdfWriter()
    # Add error handling for page indexing
    try:
        for i in range(start, end):
            if i < len(reader.pages):
                writer.add_page(reader.pages[i])
            else:
                print(
                    f"Warning: Page index {i} out of bounds (total pages: {len(reader.pages)}) for slice {name}"
                )
                break  # Stop adding pages for this slice if out of bounds
    except Exception as e:
        print(f"Error creating slice '{name}' (pages {start}-{end}): {e}")
        return name, None  # Return None for data if error occurs

    if len(writer.pages) == 0:
        print(f"Warning: Slice '{name}' resulted in an empty PDF.")
        return name, None  # No pages added, return None

    # Write to an in-memory buffer
    buffer = BytesIO()
    writer.write(buffer)
    buffer.seek(0)
    return name, buffer.getvalue()  # Return filename slug and bytes


# Instead of writing to disk, return JSON string
def create_toc_json(reader: PdfReader):
    toc = []
    for i, d in enumerate(reader.outline):
        # Check if it's a potential valid outline item before processing
        if hasattr(d, "title"):
            try:
                page_num = reader.get_destination_page_number(d)
                if page_num is not None:
                    toc.append(
                        {
                            "chapter": i + 1,  # Or adjust logic based on nesting
                            "title": resolve_title(d),
                            "page": page_num + 1,  # User-friendly 1-based index
                        }
                    )
                else:
                    print(
                        f"Warning: Could not get page number for TOC item: {resolve_title(d)}"
                    )
            except Exception as e:
                print(f"Warning: Error processing TOC item {resolve_title(d)}: {e}")

    return json.dumps(toc, indent=2)


# Instead of writing to disk, return text string and also collect print output
def create_toc_text(reader: PdfReader):
    toc_lines = ["📚 Table of Contents:"]
    console_output = []  # Collect print statements

    def collect_outline(outline, reader, indent=0):
        for item in outline:
            if isinstance(item, list):
                collect_outline(item, reader, indent + 2)
            else:
                title = resolve_title(item)
                try:
                    page_num = reader.get_destination_page_number(item)
                    if page_num is not None:
                        line = (
                            " " * indent + f"- {title} (p{page_num+1})"  # 1-based index
                        )
                        toc_lines.append(line)
                        console_output.append(line)  # Add to console output too
                    else:
                        print(
                            f"Warning: Could not get page number for outline item: {title}"
                        )
                except Exception as e:
                    print(f"Warning: Error processing outline item {title}: {e}")

    try:
        collect_outline(reader.outline, reader)
    except Exception as e:
        print(f"Error generating text TOC: {e}")
        toc_lines.append(f"\nError generating TOC: {e}")

    # Also print TOC to console (will appear in browser dev tools)
    for l in toc_lines:
        print(l)  # Pyodide redirects this to console

    return "\n".join(toc_lines), "\n".join(
        console_output
    )  # Return text and console log


# Main function to be called from JavaScript
def split_pdf_data(pdf_bytes, original_filename="input.pdf"):
    """
    Splits a PDF given as bytes based on its outline.

    Args:
        pdf_bytes (bytes): The content of the PDF file.
        original_filename (str): The original name of the file (for context).

    Returns:
        dict: A dictionary containing:
            'status': 'success' or 'error'
            'message': A status message or error details.
            'toc_text': The generated plain text TOC.
            'toc_json': The generated JSON TOC string.
            'chapters': A list of tuples, each being (filename, pdf_bytes).
            'console_log': Captured print output from TOC generation.
    """
    results = {
        "status": "error",
        "message": "Processing started...",
        "toc_text": "",
        "toc_json": "",
        "chapters": [],
        "console_log": "",
    }
    try:
        reader = PdfReader(BytesIO(pdf_bytes))
        results["message"] = f"Processing '{original_filename}'..."

        # Generate TOCs first
        results["toc_text"], results["console_log"] = create_toc_text(reader)
        results["toc_json"] = create_toc_json(reader)

        # Get ranges and create chapter slices
        ranges = outline_to_ranges(reader)
        if not ranges:
            results[
                "message"
            ] += "\nWarning: No valid outline items found or usable to define chapter ranges."
            # If no ranges, maybe the whole PDF is one 'chapter'? Decide requirements.
            # For now, we'll just return with no chapters if no ranges.
            results["status"] = (
                "success"  # Technically successful, but maybe with warnings
            )
            return results

        chapters_data = []
        for triple in ranges:
            name, data = create_slice_data(reader, triple)
            if data:  # Only add if slice creation was successful and yielded data
                # Append .pdf extension here
                chapters_data.append((f"{name}.pdf", data))
            else:
                print(f"Skipping empty or errored slice: {name}")
                results[
                    "message"
                ] += f"\nWarning: Slice '{name}' could not be generated or was empty."

        results["chapters"] = chapters_data
        results["status"] = "success"
        results["message"] = (
            f"Successfully processed '{original_filename}'. Found {len(chapters_data)} chapters."
        )

    except Exception as e:
        import traceback

        results["message"] = f"Error processing PDF: {e}\n{traceback.format_exc()}"
        print(f"Error: {e}")  # Log error to console too
        traceback.print_exc()

    return results


# --- No __main__ block needed ---
