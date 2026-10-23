// Import core HTTP module
const http = require("http");

// Define server configuration
const PORT = 3000;
const HOSTNAME = "localhost";

// Create HTTP server instance
const appServer = http.createServer((request, response) => {
    // Log incoming client requests to terminal
    console.log(`Received request for URL: ${request.url}`);

    // Set HTTP response status and header content type
    response.writeHead(200, { "Content-Type": "text/html" });

    // Send structured HTML payload to the browser
    response.end(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Node.js Server Application</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    background-color: #f4f6f9;
                    padding: 40px;
                    text-align: center;
                }
                .card {
                    max-width: 450px;
                    margin: 0 auto;
                    padding: 30px;
                    background-color: #ffffff;
                    border-radius: 8px;
                    box-shadow: 0 4px 10px rgba(0,0,0,0.1);
                }
                h1 {
                    color: #2c3e50;
                }
                p {
                    color: #555555;
                    font-size: 16px;
                }
            </style>
        </head>
        <body>
            <div class="card">
                <h1>Welcome to Node.js Web Server</h1>
                <p>This is a custom server-side application built with Node.js.</p>
            </div>
        </body>
        </html>
    `);
});

// Start listening for client connections
appServer.listen(PORT, HOSTNAME, () => {
    console.log(`Server running at http://${HOSTNAME}:${PORT}`);
});