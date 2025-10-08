from flask import Flask, send_from_directory
import os

app = Flask(__name__)

# Path to the static files (in the mounted volume)
STATIC_DIR = '/website'

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    if path == '':
        path = 'index.html'
    
    # Construct the full file path
    file_path = os.path.join(STATIC_DIR, path)
    
    # If the path is a directory, try to serve index.html from it
    if os.path.isdir(file_path):
        return send_from_directory(file_path, 'index.html')
    
    # Otherwise, serve the file from the appropriate directory
    directory = os.path.dirname(path)
    filename = os.path.basename(path)
    
    if directory:
        return send_from_directory(os.path.join(STATIC_DIR, directory), filename)
    else:
        return send_from_directory(STATIC_DIR, filename)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
