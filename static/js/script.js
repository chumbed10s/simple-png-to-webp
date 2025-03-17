document.addEventListener('DOMContentLoaded', function() {
    const dropArea = document.getElementById('drop-area');
    const fileInput = document.getElementById('fileInput');
    const progressContainer = document.getElementById('progress-container');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    const resultsContainer = document.getElementById('results-container');
    const summaryContainer = document.getElementById('summary-container');
    const resultsList = document.getElementById('results-list');
    const downloadAllBtn = document.getElementById('download-all-btn');
    const resetBtn = document.getElementById('reset-btn');
    const themeToggle = document.getElementById('theme-toggle');
    const colorButtons = document.querySelectorAll('.color-btn');
    
    // Summary elements
    const totalOriginalSize = document.getElementById('total-original-size');
    const totalConvertedSize = document.getElementById('total-converted-size');
    const totalSaved = document.getElementById('total-saved');
    const totalProgressBar = document.getElementById('total-progress-bar');
    
    // Initialize summary stats
    let totalPngSize = 0;
    let totalWebpSize = 0;
    
    // Load saved theme preferences
    loadThemePreferences();
    
    // Theme toggle functionality
    themeToggle.addEventListener('change', () => {
        const isDarkMode = themeToggle.checked;
        setColorTheme(isDarkMode ? 'dark' : 'light');
        
        // Save preference
        localStorage.setItem('darkMode', isDarkMode);
    });
    
    // Color theme functionality
    colorButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove active class from all buttons
            colorButtons.forEach(btn => btn.classList.remove('active'));
            
            // Add active class to clicked button
            button.classList.add('active');
            
            // Set theme
            const theme = button.getAttribute('data-theme');
            setAccentColor(theme);
            
            // Save preference
            localStorage.setItem('accentColor', theme);
        });
    });
    
    // Function to load theme preferences
    function loadThemePreferences() {
        // Load dark/light mode preference
        const savedDarkMode = localStorage.getItem('darkMode');
        const isDarkMode = savedDarkMode === null ? true : savedDarkMode === 'true';
        
        // Set the toggle state
        themeToggle.checked = isDarkMode;
        
        // Apply the theme
        setColorTheme(isDarkMode ? 'dark' : 'light');
        
        // Load accent color preference
        const savedAccentColor = localStorage.getItem('accentColor') || 'blue';
        
        // Find and activate the correct color button
        colorButtons.forEach(btn => {
            if (btn.getAttribute('data-theme') === savedAccentColor) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        
        // Apply the accent color
        setAccentColor(savedAccentColor);
    }
    
    // Function to set color theme (dark/light)
    function setColorTheme(theme) {
        document.documentElement.setAttribute('data-bs-theme', theme);
    }
    
    // Function to set accent color
    function setAccentColor(color) {
        document.body.className = '';
        document.body.classList.add(`theme-${color}`);
    }
    
    // Store converted files for batch download
    let convertedFiles = [];
    
    // Reset functionality
    resetBtn.addEventListener('click', () => {
        // Show confirmation dialog
        if (confirm('Are you sure you want to clear all results? This will delete all converted files.')) {
            // Clear the results list
            resultsList.innerHTML = '';
            
            // Reset statistics
            totalPngSize = 0;
            totalWebpSize = 0;
            updateSummary();
            
            // Hide containers
            resultsContainer.classList.add('d-none');
            summaryContainer.classList.add('d-none');
            
            // Clean up files on server
            if (convertedFiles.length > 0) {
                convertedFiles.forEach(file => {
                    fetch('/cleanup', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ file_id: file.file_id }),
                    });
                });
            }
            
            // Reset converted files array
            convertedFiles = [];
        }
    });
    
    // Prevent default behavior for drag events
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, preventDefaults, false);
    });
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    // Highlight drop area when dragging a file over it
    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, highlight, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, unhighlight, false);
    });
    
    function highlight() {
        dropArea.classList.add('highlight');
    }
    
    function unhighlight() {
        dropArea.classList.remove('highlight');
    }
    
    // Handle dropped files
    dropArea.addEventListener('drop', handleDrop, false);
    
    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFiles(files);
    }
    
    // Handle file selection through input
    dropArea.addEventListener('click', () => {
        fileInput.click();
    });
    
    fileInput.addEventListener('change', function() {
        handleFiles(this.files);
    });
    
    // Download all files
    downloadAllBtn.addEventListener('click', () => {
        if (convertedFiles.length === 0) return;
        
        fetch('/download-all', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ files: convertedFiles })
        })
        .then(response => {
            if (response.ok) {
                return response.blob();
            }
            throw new Error('Network response was not ok');
        })
        .then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = 'webp_files.zip';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
        })
        .catch(error => {
            console.error('Error downloading files:', error);
            alert('Error downloading files. Please try again.');
        });
    });
    
    function handleFiles(files) {
        if (files.length === 0) return;
        
        // Reset converted files array and summary stats
        convertedFiles = [];
        totalPngSize = 0;
        totalWebpSize = 0;
        
        // Update summary display
        updateSummary();
        
        // Clear previous results
        resultsList.innerHTML = '';
        
        // Show progress bar
        progressContainer.classList.remove('d-none');
        progressBar.style.width = '0%';
        progressText.textContent = 'Processing files...';
        
        // Show results container
        resultsContainer.classList.remove('d-none');
        summaryContainer.classList.remove('d-none');
        
        let filesProcessed = 0;
        const totalFiles = files.length;
        
        // Convert each file
        Array.from(files).forEach(file => {
            if (!file.name.toLowerCase().endsWith('.png')) {
                // Show error for non-PNG files
                const errorItem = document.createElement('div');
                errorItem.className = 'list-group-item';
                errorItem.innerHTML = `
                    <div class="d-flex justify-content-between align-items-center">
                        <div class="file-info">
                            <h5 class="mb-1 file-name">${file.name}</h5>
                            <p class="mb-0 error-message">Error: Only PNG files are allowed</p>
                        </div>
                    </div>
                `;
                resultsList.appendChild(errorItem);
                
                filesProcessed++;
                updateProgress(filesProcessed, totalFiles);
                return;
            }
            
            convertFile(file, function(result) {
                // Create result element
                const resultItem = document.createElement('div');
                resultItem.className = 'list-group-item';
                
                if (result.error) {
                    resultItem.innerHTML = `
                        <div class="d-flex justify-content-between align-items-center">
                            <div class="file-info">
                                <h5 class="mb-1 file-name">${file.name}</h5>
                                <p class="mb-0 error-message">Error: ${result.error}</p>
                            </div>
                        </div>
                    `;
                } else {
                    resultItem.innerHTML = `
                        <div class="d-flex justify-content-between align-items-center">
                            <img src="data:image/png;base64,${result.thumbnail}" alt="Preview" class="thumbnail-preview me-3">
                            <div class="file-info">
                                <h5 class="mb-1 file-name">${result.original_name}</h5>
                                <p class="mb-0 text-muted">
                                    PNG: ${result.png_size_formatted} → WebP: ${result.webp_size_formatted}
                                    <span class="fw-bold accent-color">(${result.reduction}% smaller)</span>
                                </p>
                            </div>
                            <button class="btn btn-primary btn-sm download-btn" data-file-id="${result.file_id}" data-filename="${result.webp_name}">
                                <i class="bi bi-download"></i>
                            </button>
                        </div>
                    `;
                    
                    // Add to converted files array for batch download
                    convertedFiles.push({
                        file_id: result.file_id,
                        filename: result.webp_name
                    });
                    
                    // Update summary stats
                    totalPngSize += result.png_size;
                    totalWebpSize += result.webp_size;
                    updateSummary();
                    
                    // Add event listener for download button
                    setTimeout(() => {
                        const downloadBtn = resultItem.querySelector('.download-btn');
                        downloadBtn.addEventListener('click', function() {
                            const fileId = this.getAttribute('data-file-id');
                            const filename = this.getAttribute('data-filename');
                            window.location.href = `/download/${fileId}/${filename}`;
                        });
                    }, 0);
                }
                
                resultsList.appendChild(resultItem);
                
                filesProcessed++;
                updateProgress(filesProcessed, totalFiles);
            });
        });
    }
    
    function convertFile(file, callback) {
        const formData = new FormData();
        formData.append('file', file);
        
        fetch('/convert', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            callback(data);
        })
        .catch(error => {
            callback({ error: 'Error processing file: ' + error.message });
        });
    }
    
    function updateProgress(processed, total) {
        const percentage = Math.round((processed / total) * 100);
        progressBar.style.width = percentage + '%';
        progressText.textContent = `Processing: ${processed} of ${total} files (${percentage}%)`;
        
        if (processed === total) {
            setTimeout(() => {
                progressContainer.classList.add('d-none');
            }, 1000);
        }
    }
    
    function updateSummary() {
        if (totalPngSize === 0) {
            totalOriginalSize.textContent = '0 KB';
            totalConvertedSize.textContent = '0 KB';
            totalSaved.textContent = '0 KB (0%)';
            totalProgressBar.style.width = '0%';
            return;
        }
        
        const savedSize = totalPngSize - totalWebpSize;
        const savedPercent = Math.round((savedSize / totalPngSize) * 100);
        
        totalOriginalSize.textContent = formatSize(totalPngSize);
        totalConvertedSize.textContent = formatSize(totalWebpSize);
        totalSaved.textContent = `${formatSize(savedSize)} (${savedPercent}%)`;
        totalProgressBar.style.width = `${savedPercent}%`;
    }
    
    function formatSize(size) {
        if (size < 1024) {
            return `${size} B`;
        } else if (size < 1024 * 1024) {
            return `${(size / 1024).toFixed(2)} KB`;
        } else {
            return `${(size / (1024 * 1024)).toFixed(2)} MB`;
        }
    }
});
