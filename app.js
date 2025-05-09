// 工具函数
function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

function getTimeString() {
    const now = new Date();
    return `${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2, '0')}${
        now.getDate().toString().padStart(2, '0')}_${
        now.getHours().toString().padStart(2, '0')}${
        now.getMinutes().toString().padStart(2, '0')}${
        now.getSeconds().toString().padStart(2, '0')}`;
}

// 创建图片对象
function createImage(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
}

// 压缩图片
async function compressImage(img, type, targetRatio) {
    // 创建画布
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // 获取原始图片数据用于比较
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);
    const originalBlob = await new Promise(resolve => canvas.toBlob(resolve, type, 1.0));
    const originalSize = originalBlob.size;
    
    // 计算目标大小，确保不超过限制
    const absoluteTargetSize = targetRatio * originalSize;
    const targetSize = absoluteTargetSize * 0.95; // 给5%的安全边际
    console.log(`Target size: ${formatSize(targetSize)} (${(targetSize/absoluteTargetSize*100).toFixed(1)}% of target)`);
    
    // 计算初始缩放比例
    const initialScale = Math.min(1, Math.sqrt(targetSize / originalSize));
    
    // 调整画布大小
    canvas.width = Math.floor(img.width * initialScale);
    canvas.height = Math.floor(img.height * initialScale);
    
    // 使用高质量缩放
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // 根据图片类型选择不同的压缩策略
    if (type === 'image/png') {
        // PNG压缩策略
        const compressionSteps = [
            { quality: 1.0, scale: initialScale },
            { quality: 0.9, scale: initialScale },
            { quality: 0.8, scale: initialScale },
            { quality: 0.7, scale: initialScale },
            { quality: 0.6, scale: initialScale * 0.95 },
            { quality: 0.5, scale: initialScale * 0.9 },
            { quality: 0.4, scale: initialScale * 0.85 },
            { quality: 0.3, scale: initialScale * 0.8 }
        ];

        let bestBlob = null;
        let bestDiff = Infinity;

        for (const step of compressionSteps) {
            canvas.width = Math.floor(img.width * step.scale);
            canvas.height = Math.floor(img.height * step.scale);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
            const blob = await new Promise(resolve => canvas.toBlob(resolve, type, step.quality));
            const diff = Math.abs(blob.size - targetSize);
            console.log(`PNG step - scale: ${step.scale.toFixed(2)}, quality: ${step.quality.toFixed(2)}, size: ${formatSize(blob.size)}`);
            
            if (diff < bestDiff) {
                bestDiff = diff;
                bestBlob = blob;
            }
            
            if (blob.size <= targetSize && blob.size >= targetSize * 0.8) {
                return blob;
            }
        }

        return bestBlob;
        
    } else {
        // JPEG/WEBP压缩策略
        const scaleSteps = [1, 0.9, 0.8, 0.7, 0.6, 0.5];
        const qualitySteps = [0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5];
        
        let bestBlob = null;
        let bestDiff = Infinity;
        
        for (const scale of scaleSteps) {
            const currentScale = scale * initialScale;
            canvas.width = Math.floor(img.width * currentScale);
            canvas.height = Math.floor(img.height * currentScale);
            
            for (const quality of qualitySteps) {
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                const blob = await new Promise(resolve => canvas.toBlob(resolve, type, quality));
                console.log(`JPEG/WEBP - scale: ${currentScale.toFixed(2)}, quality: ${quality.toFixed(2)}, size: ${formatSize(blob.size)}`);
                
                const diff = Math.abs(blob.size - targetSize);
                if (diff < bestDiff) {
                    bestDiff = diff;
                    bestBlob = blob;
                }
                
                if (blob.size <= targetSize && blob.size >= targetSize * 0.7) {
                    return blob;
                }
                
                // 如果已经太小了，尝试下一个缩放比例
                if (blob.size < targetSize * 0.7) {
                    break;
                }
            }
        }
        
        return bestBlob;
    }
}

// 支持的图片类型
const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// 主程序
function initializeApp() {
    // 获取DOM元素
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const progressArea = document.getElementById('progressArea');
    const downloadAllButton = document.getElementById('downloadAllButton');
    const settingsPanel = document.getElementById('settingsPanel');
    const previewButton = document.getElementById('previewButton');
    const startButton = document.getElementById('startButton');
    const totalInfo = document.getElementById('totalInfo');

    // 获取预览相关的DOM元素
    const previewImageSelect = document.getElementById('previewImageSelect');
    const originalPreview = document.getElementById('originalPreview');
    const compressedPreview = document.getElementById('compressedPreview');
    const originalSize = document.getElementById('originalSize');
    const compressedSize = document.getElementById('compressedSize');
    const compressionRatioInfo = document.getElementById('compressionRatioInfo');

    // 存储图片信息
    let imageFiles = [];
    let processedImages = [];
    let originalFolderName = '';
    let currentPreviewFile = null;

    // 创建文件项DOM元素
    function createFileItemElement(file, originalSize, previewSize, status, isPreview = true) {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.dataset.filename = file.name;

        const progressBar = document.createElement('div');
        progressBar.className = 'progress-bar';
        fileItem.appendChild(progressBar);

        const fileInfo = document.createElement('div');
        fileInfo.className = 'file-info';
        
        fileInfo.innerHTML = `
            <span class="file-name">${file.name}</span>
            <span class="file-size">${originalSize}</span>
            ${isPreview ? `<span class="preview-size">→ ${previewSize}</span>` : ''}
            <span class="status ${isPreview ? 'preview' : ''}">${status}</span>
            <span class="processing-spinner"></span>
        `;
        
        fileItem.appendChild(fileInfo);
        return fileItem;
    }

    // 预览压缩效果
    async function previewCompression() {
        const settings = getCompressionSettings();
        let totalOriginalSize = 0;
        let totalEstimatedSize = 0;
        let needCompressionCount = 0;

        progressArea.innerHTML = '';
        
        for (const file of imageFiles) {
            totalOriginalSize += file.size;
            
            const originalSize = formatSize(file.size);
            let previewSize = originalSize;
            let status = '无需压缩';
            
            if (file.size > settings.targetSize) {
                needCompressionCount++;
                // 预估压缩后大小
                const estimatedSize = estimateCompressedSize(file.size, settings.targetSize / file.size);
                previewSize = formatSize(estimatedSize);
                status = `将压缩至 ${settings.targetSize / (1024 * 1024)}MB`;
                totalEstimatedSize += estimatedSize;
            } else {
                totalEstimatedSize += file.size;
            }

            const fileItem = createFileItemElement(file, originalSize, previewSize, status);
            progressArea.appendChild(fileItem);
        }

        // 更新总体信息
        const compressionRatio = ((1 - totalEstimatedSize / totalOriginalSize) * 100).toFixed(1);
        totalInfo.innerHTML = `
            共 <span>${imageFiles.length}</span> 个文件，
            需压缩 <span>${needCompressionCount}</span> 个，
            总大小将从 <span>${formatSize(totalOriginalSize)}</span> 
            减少到 <span>${formatSize(totalEstimatedSize)}</span>
            (节省 <span>${compressionRatio}%</span>)
        `;

        // 显示开始压缩按钮
        startButton.style.display = 'block';
    }

    // 获取压缩设置
    function getCompressionSettings() {
        const selectedSizeInput = document.querySelector('input[name="sizeLimit"]:checked');
        if (!selectedSizeInput) {
            console.error('No size limit selected');
            return { targetSize: 1024 * 1024 }; // 默认1MB
        }
        return {
            targetSize: Number(selectedSizeInput.value) * 1024 * 1024 // 转换为字节
        };
    }

    // 预估压缩后的大小
    function estimateCompressedSize(originalSize, ratio) {
        return Math.ceil(originalSize * ratio);
    }

    // 处理单个图片
    async function processImage(file, settings) {
        // 创建文件项
        const fileItem = createFileItemElement(
            file,
            formatSize(file.size),
            '',
            '处理中...',
            false
        );
        progressArea.appendChild(fileItem);
        
        const progressBar = fileItem.querySelector('.progress-bar');
        const statusElement = fileItem.querySelector('.status');
        fileItem.classList.add('processing');

        try {
            let finalBlob;
            let statusText;

            // 更新进度条到25%表示开始处理
            progressBar.style.width = '25%';

            // 将文件大小转换为MB进行比较
            const fileSizeInMB = file.size / (1024 * 1024);
            console.log(`Processing ${file.name}: ${fileSizeInMB.toFixed(2)}MB, Target: ${settings.targetSize / (1024 * 1024)}MB`);

            if (file.size <= settings.targetSize) {
                // 文件已经小于目标大小
                finalBlob = file;
                statusText = '无需压缩';
                console.log(`${file.name} is already under target size, skipping compression`);
            } else {
                // 计算目标压缩比例
                const targetRatio = settings.targetSize / file.size;
                console.log(`Compressing ${file.name} with target ratio: ${(targetRatio * 100).toFixed(1)}%`);

                // 加载图片
                const image = await createImage(file);
                progressBar.style.width = '50%';

                // 压缩图片
                finalBlob = await compressImage(image, file.type, targetRatio);
                
                if (!finalBlob || finalBlob.size === 0) {
                    throw new Error('Compression resulted in invalid file');
                }

                const compressionPercent = ((1 - finalBlob.size / file.size) * 100).toFixed(1);
                console.log(`${file.name} compressed: ${compressionPercent}% reduction, final size: ${formatSize(finalBlob.size)}`);
                
                statusText = `已压缩 ${compressionPercent}% (${formatSize(finalBlob.size)})`;
            }
            
            progressBar.style.width = '100%';
            
            // 存储处理后的图片
            processedImages.push({
                name: file.name,
                blob: finalBlob
            });
            
            // 更新状态
            statusElement.className = 'status success';
            statusElement.textContent = statusText;
            fileItem.classList.remove('processing');
            
        } catch (error) {
            console.error(`Error processing ${file.name}:`, error);
            statusElement.className = 'status error';
            statusElement.textContent = '处理失败';
            fileItem.classList.remove('processing');
            progressBar.style.backgroundColor = 'rgba(255, 59, 48, 0.1)';
            
            // 处理失败时也添加原始文件
            processedImages.push({
                name: file.name,
                blob: file
            });
        }
    }

    // 开始压缩
    async function startCompression() {
        // 清空进度区域和处理结果
        progressArea.innerHTML = '';
        processedImages = [];
        
        const settings = getCompressionSettings();
        console.log('Starting compression with settings:', settings);
        
        try {
            // 使用Promise.all并发处理图片，但限制并发数
            const batchSize = 3; // 同时处理3张图片
            for (let i = 0; i < imageFiles.length; i += batchSize) {
                const batch = imageFiles.slice(i, i + batchSize);
                await Promise.all(batch.map(file => processImage(file, settings)));
            }
            
            // 更新总体信息
            let totalOriginalSize = 0;
            let totalCompressedSize = 0;
            processedImages.forEach(img => {
                totalOriginalSize += imageFiles.find(f => f.name === img.name).size;
                totalCompressedSize += img.blob.size;
            });
            
            const compressionRatio = ((1 - totalCompressedSize / totalOriginalSize) * 100).toFixed(1);
            const needCompressionCount = imageFiles.filter(file => (file.size / (1024 * 1024)) > settings.targetSize / (1024 * 1024)).length;
            
            totalInfo.innerHTML = `
                共 <span>${imageFiles.length}</span> 个文件，
                需压缩 <span>${needCompressionCount}</span> 个，
                总大小从 <span>${formatSize(totalOriginalSize)}</span> 
                减少到 <span>${formatSize(totalCompressedSize)}</span>
                (节省 <span>${compressionRatio}%</span>)
            `;
            
            // 显示下载按钮
            downloadAllButton.style.display = 'block';
        } catch (error) {
            throw error;
        }
    }

    // 下载压缩后的图片
    async function downloadImages() {
        const zip = new JSZip();
        const folder = zip.folder("processed_images");

        // 添加所有处理后的图片到zip
        processedImages.forEach(image => {
            folder.file(image.name, image.blob);
        });

        // 生成zip文件
        const content = await zip.generateAsync({
            type: "blob",
            compression: "DEFLATE",
            compressionOptions: {
                level: 9
            }
        });
        
        // 创建下载链接
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        // 使用文件夹名称和时间戳
        const timestamp = getTimeString();
        link.download = `${originalFolderName}_compressed_${timestamp}.zip`;
        
        // 触发下载
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // 更新预览
    async function updatePreview(file) {
        currentPreviewFile = file;
        
        // 显示原图
        originalPreview.src = URL.createObjectURL(file);
        originalSize.textContent = `大小: ${formatSize(file.size)}`;
        
        // 获取压缩设置
        const settings = getCompressionSettings();
        
        try {
            // 创建图片对象
            const img = await createImage(file);
            
            // 压缩图片
            const compressedBlob = await compressImage(img, file.type, settings.targetSize / file.size);
            
            // 显示压缩后的图片
            compressedPreview.src = URL.createObjectURL(compressedBlob);
            compressedSize.textContent = `大小: ${formatSize(compressedBlob.size)}`;
            
            // 计算实际压缩比例
            const actualRatio = ((1 - compressedBlob.size / file.size) * 100).toFixed(1);
            compressionRatioInfo.textContent = `压缩率: ${actualRatio}%`;
            
        } catch (error) {
            console.error('预览更新失败:', error);
            compressedPreview.src = '';
            compressedSize.textContent = '预览失败';
            compressionRatioInfo.textContent = '';
        }
    }

    // 处理文件
    async function handleFiles(files) {
        console.log('开始处理文件:', files);
        
        // 清空数据
        progressArea.innerHTML = '';
        imageFiles = [];
        processedImages = [];
        previewImageSelect.innerHTML = '<option value="">选择预览图片...</option>';
        
        // 隐藏所有按钮
        downloadAllButton.style.display = 'none';
        startButton.style.display = 'none';
        
        // 获取文件夹名称
        if (files.length > 0) {
            const path = files[0].webkitRelativePath || files[0].name;
            originalFolderName = path.split('/')[0];
        }

        // 过滤出支持的图片文件
        imageFiles = Array.from(files).filter(file => 
            SUPPORTED_TYPES.includes(file.type)
        );

        console.log('过滤后的图片文件:', imageFiles);

        if (imageFiles.length === 0) {
            alert('没有找到支持的图片文件！');
            return;
        }

        // 添加图片到预览选择框
        imageFiles.forEach((file, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = `${file.name} (${formatSize(file.size)})`;
            previewImageSelect.appendChild(option);
        });

        // 显示设置面板和开始按钮
        settingsPanel.style.display = 'block';
        startButton.style.display = 'block';
        
        // 默认预览第一张图片
        if (imageFiles.length > 0) {
            previewImageSelect.value = "0";
            await updatePreview(imageFiles[0]);
        }

        // 显示文件列表
        await previewCompression();
    }

    // 设置事件监听器
    function setupEventListeners() {
        console.log('设置事件监听器');
        
        // 处理拖放事件
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.style.borderColor = '#0071e3';
            dropZone.style.backgroundColor = 'rgba(0, 113, 227, 0.05)';
        });

        dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.style.borderColor = '#86868b';
            dropZone.style.backgroundColor = 'transparent';
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.style.borderColor = '#86868b';
            dropZone.style.backgroundColor = 'transparent';
            const items = e.dataTransfer.items;
            if (items && items.length > 0) {
                const item = items[0].webkitGetAsEntry();
                if (item && item.isDirectory) {
                    handleFiles(e.dataTransfer.files);
                } else {
                    alert('请选择文件夹！');
                }
            }
        });

        // 点击上传
        dropZone.addEventListener('click', () => {
            console.log('点击上传区域');
            fileInput.value = ''; // 清除之前的选择
            fileInput.click();
        });

        fileInput.addEventListener('change', (e) => {
            console.log('文件输入变化:', e.target.files);
            if (e.target.files && e.target.files.length > 0) {
                handleFiles(e.target.files);
            }
        });

        // 监听预览图片选择
        previewImageSelect.addEventListener('change', (e) => {
            const selectedIndex = e.target.value;
            if (selectedIndex !== '') {
                updatePreview(imageFiles[selectedIndex]);
            } else {
                // 清空预览
                originalPreview.src = '';
                compressedPreview.src = '';
                originalSize.textContent = '大小: --';
                compressedSize.textContent = '大小: --';
                compressionRatioInfo.textContent = '压缩率: --';
                currentPreviewFile = null;
            }
        });

        // 开始压缩按钮事件
        startButton.addEventListener('click', async () => {
            startButton.disabled = true;
            previewButton.style.display = 'none';
            downloadAllButton.style.display = 'none';
            
            try {
                await startCompression();
            } catch (error) {
                console.error('压缩过程中出现错误：', error);
                alert('压缩过程中出现错误，请重试');
            } finally {
                startButton.disabled = false;
            }
        });

        // 下载按钮事件
        downloadAllButton.addEventListener('click', async () => {
            if (processedImages.length === 0) {
                alert('没有可下载的图片！');
                return;
            }

            downloadAllButton.disabled = true;
            downloadAllButton.textContent = '正在打包...';

            try {
                await downloadImages();
            } catch (error) {
                console.error('打包下载失败：', error);
                alert('打包下载失败，请重试！');
            } finally {
                downloadAllButton.disabled = false;
                downloadAllButton.textContent = '打包下载';
            }
        });

        // 监听压缩设置变化
        document.querySelectorAll('input[name="sizeLimit"]').forEach(input => {
            input.addEventListener('change', async () => {
                if (currentPreviewFile) {
                    await updatePreview(currentPreviewFile);
                }
                await previewCompression();
            });
        });
    }

    // 初始化应用
    setupEventListeners();
    console.log('应用初始化完成');
}

// 等待DOM加载完成后初始化应用
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
} 