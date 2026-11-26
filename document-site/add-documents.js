#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Directory containing your text documents
const docsDir = '/home/D1bakar/projects/web/docs/d1bakar-upgraded-sniffle';

// Read all text files from the directory
function readDocumentsFromDir(dir) {
    const documents = [];
    const files = fs.readdirSync(dir);

    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stats = fs.statSync(filePath);

        if (stats.isFile() && (file.endsWith('.txt') || file.endsWith('.md'))) {
            const content = fs.readFileSync(filePath, 'utf-8');
            documents.push({
                name: file,
                content: content,
                pdfPath: null
            });
        }
    });

    return documents;
}

// Generate HTML code with documents
function generateHTML(documents) {
    const documentsArray = JSON.stringify(documents, null, 2);

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Document Search</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }

        .container {
            max-width: 1000px;
            margin: 0 auto;
            background: white;
            border-radius: 10px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            overflow: hidden;
        }

        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }

        .header h1 {
            font-size: 2.5em;
            margin-bottom: 10px;
        }

        .header p {
            font-size: 1.1em;
            opacity: 0.9;
        }

        .search-box {
            padding: 30px;
            border-bottom: 1px solid #eee;
        }

        .search-box input {
            width: 100%;
            padding: 15px 20px;
            font-size: 1.1em;
            border: 2px solid #ddd;
            border-radius: 8px;
            transition: all 0.3s;
        }

        .search-box input:focus {
            outline: none;
            border-color: #667eea;
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        .results {
            padding: 30px;
        }

        .result {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 15px;
            border-left: 4px solid #667eea;
            transition: all 0.3s;
        }

        .result:hover {
            transform: translateX(5px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }

        .result h3 {
            color: #333;
            margin-bottom: 8px;
        }

        .result p {
            color: #666;
            line-height: 1.6;
        }

        .no-results {
            text-align: center;
            color: #999;
            font-size: 1.2em;
            padding: 40px;
        }

        .loading {
            text-align: center;
            padding: 40px;
            color: #667eea;
            font-size: 1.2em;
        }

        .document-list {
            display: none;
        }

        .document-list.active {
            display: block;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📚 Document Search</h1>
            <p>Search through all your documents</p>
        </div>

        <div class="search-box">
            <input type="text" id="searchInput" placeholder="Search documents by name or content...">
        </div>

        <div class="results">
            <div id="loading" class="loading">
                Loading documents...
            </div>

            <div id="documentList" class="document-list">
                <!-- Documents will be loaded here -->
            </div>

            <div id="noResults" class="no-results" style="display: none;">
                No documents found matching your search
            </div>
        </div>
    </div>

    <script>
        const documents = ${documentsArray};

        document.addEventListener('DOMContentLoaded', function() {
            const documentList = document.getElementById('documentList');
            const loading = document.getElementById('loading');
            const noResults = document.getElementById('noResults');
            const searchInput = document.getElementById('searchInput');

            loading.style.display = 'none';
            documentList.classList.add('active');

            searchInput.addEventListener('input', function() {
                const query = this.value.toLowerCase().trim();

                if (query === '') {
                    documentList.style.display = 'block';
                    noResults.style.display = 'none';
                    return;
                }

                const filtered = documents.filter(doc =>
                    doc.name.toLowerCase().includes(query) ||
                    doc.content.toLowerCase().includes(query)
                );

                if (filtered.length === 0) {
                    documentList.style.display = 'none';
                    noResults.style.display = 'block';
                } else {
                    documentList.style.display = 'block';
                    noResults.style.display = 'none';
                    renderDocuments(filtered);
                }
            });

            function renderDocuments(docs) {
                documentList.innerHTML = docs.map(doc => \`
                    <div class="result">
                        <h3>📄 \${doc.name}</h3>
                        <p>\${doc.content.substring(0, 200)}\${doc.content.length > 200 ? '...' : ''}</p>
                    </div>
                \`).join('');
            }

            renderDocuments(documents);
        });
    </script>
</body>
</html>
`;
}

// Main function
function main() {
    try {
        const documents = readDocumentsFromDir(docsDir);

        if (documents.length === 0) {
            console.log('No text files found in the directory.');
            console.log('Please add .txt or .md files to:', docsDir);
            return;
        }

        console.log(`Found ${documents.length} document(s):`);
        documents.forEach((doc, index) => {
            console.log(`  ${index + 1}. ${doc.name} (${doc.content.length} characters)`);
        });

        const html = generateHTML(documents);
        fs.writeFileSync('index.html', html);

        console.log('\n✅ HTML file generated successfully!');
        console.log('   Open index.html in your browser to use the document search.');
    } catch (error) {
        console.error('Error:', error.message);
    }
}

main();
