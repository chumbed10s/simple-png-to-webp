from flask import Flask, render_template, request, jsonify, send_from_directory, send_file
import os
import uuid
import shutil
import zipfile
import io
import base64
from PIL import Image
from werkzeug.utils import secure_filename

app = Flask(__name__)

UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'png'}
THUMBNAIL_SIZE = (100, 100)  # Size for preview thumbnails

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/convert', methods=['POST'])
def convert():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    file = request.files['file']
    
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    
    if file and allowed_file(file.filename):
        # Generate unique ID to avoid name collisions
        file_id = str(uuid.uuid4())
        filename = secure_filename(file.filename)
        base_name = os.path.splitext(filename)[0]
        
        # Create temp folder for this file
        temp_folder = os.path.join(UPLOAD_FOLDER, file_id)
        os.makedirs(temp_folder, exist_ok=True)
        
        # Save PNG file
        png_path = os.path.join(temp_folder, filename)
        file.save(png_path)
        
        # Get PNG size
        png_size = os.path.getsize(png_path)
        
        # Convert to WebP
        webp_filename = f"{base_name}.webp"
        webp_path = os.path.join(temp_folder, webp_filename)
        
        try:
            img = Image.open(png_path)
            
            # Create thumbnail for preview
            thumb = img.copy()
            thumb.thumbnail(THUMBNAIL_SIZE)
            
            # Save thumbnail to memory
            thumb_buffer = io.BytesIO()
            thumb.save(thumb_buffer, format="PNG")
            thumb_base64 = base64.b64encode(thumb_buffer.getvalue()).decode('utf-8')
            
            # Save WebP
            img.save(webp_path, 'WEBP', quality=100, lossless=True)
            
            # Get WebP size
            webp_size = os.path.getsize(webp_path)
            
            # Calculate reduction
            reduction_percent = round((1 - webp_size/png_size) * 100, 2)
            
            return jsonify({
                'success': True,
                'file_id': file_id,
                'original_name': filename,
                'webp_name': webp_filename,
                'png_size': png_size,
                'png_size_formatted': format_size(png_size),
                'webp_size': webp_size,
                'webp_size_formatted': format_size(webp_size),
                'reduction': reduction_percent,
                'thumbnail': thumb_base64
            })
            
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    return jsonify({'error': 'File not allowed. Only PNG files are accepted.'}), 400

@app.route('/download/<file_id>/<filename>')
def download(file_id, filename):
    return send_from_directory(os.path.join(UPLOAD_FOLDER, file_id), filename)

@app.route('/download-all', methods=['POST'])
def download_all():
    data = request.get_json()
    if not data or 'files' not in data or not data['files']:
        return jsonify({'error': 'No files specified'}), 400
    
    files = data['files']
    memory_file = io.BytesIO()
    
    with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as zf:
        for file_info in files:
            file_id = file_info.get('file_id')
            filename = file_info.get('filename')
            
            if file_id and filename:
                file_path = os.path.join(UPLOAD_FOLDER, file_id, filename)
                if os.path.exists(file_path):
                    zf.write(file_path, filename)
    
    memory_file.seek(0)
    return send_file(
        memory_file,
        mimetype='application/zip',
        as_attachment=True,
        download_name='webp_files.zip'
    )

@app.route('/cleanup', methods=['POST'])
def cleanup():
    data = request.get_json()
    if 'file_id' in data:
        file_id = data['file_id']
        folder_path = os.path.join(UPLOAD_FOLDER, file_id)
        if os.path.exists(folder_path):
            shutil.rmtree(folder_path)
            return jsonify({'success': True})
    return jsonify({'success': False}), 400

def format_size(size_bytes):
    """Format size in bytes to a readable unit (KB, MB)"""
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{round(size_bytes/1024, 2)} KB"
    else:
        return f"{round(size_bytes/(1024*1024), 2)} MB"

@app.route('/cleanup-all', methods=['POST'])
def cleanup_all():
    try:
        # Remove all files in the uploads folder
        for folder in os.listdir(UPLOAD_FOLDER):
            folder_path = os.path.join(UPLOAD_FOLDER, folder)
            if os.path.isdir(folder_path):
                shutil.rmtree(folder_path)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True)
