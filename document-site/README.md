# Document Search Website

A simple, fast website for searching through your documents.

## Setup

1. Open `index.html` in your browser
2. The website is ready to use!

## Adding Documents

Since the PDF is scanned (image-based), you need to add the text content manually:

### Option 1: Edit the HTML file
1. Open `index.html` in a text editor
2. Find the `documents` array in the JavaScript section
3. Add your documents like this:

```javascript
const documents = [
    {
        name: "My Document.pdf",
        content: "Paste your document text here...",
        pdfPath: "/path/to/your/document.pdf"
    }
];
```

### Option 2: Create separate text files
1. Create text files with your documents (e.g., `doc1.txt`, `doc2.txt`)
2. Update the `documents` array to include these files:

```javascript
const documents = [
    {
        name: "Document 1",
        content: "File content here...",
        pdfPath: null
    }
];
```

### Option 3: Load from external files
You can also load documents from external text files using JavaScript:

```javascript
async function loadDocuments() {
    const response = await fetch('/path/to/documents.json');
    return await response.json();
}
```

## Features

- ✅ Fast search through document names and content
- ✅ Real-time filtering
- ✅ Clean, modern interface
- ✅ Responsive design
- ✅ PDF download/viewing support

## How to Use

1. Open `index.html` in your browser
2. Type in the search box
3. Documents will appear sorted by relevance
4. Click "View/Download PDF" to open the full document

## Next Steps

1. Add your document text to the `documents` array
2. Test the search functionality
3. Customize the design if needed
4. Deploy to your web server

---

**Note:** The website currently has one placeholder document. Add your actual documents to start searching!
