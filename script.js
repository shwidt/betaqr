document.addEventListener('DOMContentLoaded', function() {
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const cameraError = document.getElementById('camera-error');
    const instructions = document.getElementById('instructions');
    const fileUploadContainer = document.getElementById('file-upload-container');
    const fileInput = document.getElementById('qr-file-input');
    const resultsList = document.getElementById('results-list');
    const noResults = document.getElementById('no-results');
    const codesCount = document.getElementById('codes-count');
    const clearAllBtn = document.getElementById('clear-all');
    const copyAllBtn = document.getElementById('copy-all');

    let stream = null;
    let scannedCodes = new Set();
    let codeReader = null;

    async function checkCameraSupport() {
        console.log('Проверка поддержки камеры...');

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.log('MediaDevices API не поддерживается');
            throw new Error('API камеры не поддерживается в этом браузере');
        }

        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            console.log('Все устройства:', devices);

            const cameras = devices.filter(device => device.kind === 'videoinput');
            console.log('Доступные камеры:', cameras.map(camera => ({
                label: camera.label || 'Камера без имени',
                deviceId: camera.deviceId,
                kind: camera.kind
            })));

            if (cameras.length === 0) {
                console.log('Камеры не найдены');
                throw new Error('Камеры не найдены');
            }

            return cameras;
        } catch (error) {
            console.error('Ошибка при перечислении устройств:', error);
            throw error;
        }
    }

    async function setupCamera() {
        try {
            const cameras = await checkCameraSupport();
            console.log('Настройка камеры с доступными устройствами:', cameras.length);

            // Инициализация ZXing
            const hints = new Map();
            hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.QR_CODE]);
            hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
            codeReader = new ZXing.BrowserMultiFormatReader(hints);

            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { 
                        facingMode: "environment",
                        width: 640,
                        height: 480
                    }
                });
                console.log('Камера инициализирована с разрешением:', {
                    width: stream.getVideoTracks()[0].getSettings().width,
                    height: stream.getVideoTracks()[0].getSettings().height
                });
            } catch (err) {
                console.log('Не удалось использовать основную камеру, переход к запасному варианту:', err);
                stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        width: 640,
                        height: 480
                    }
                });
                console.log('Успешно инициализирована запасная камера');
            }

            video.srcObject = stream;
            video.setAttribute("playsinline", true);
            await video.play();

            // Настройка обработчика ZXing
            codeReader.decodeFromVideoDevice(undefined, video, (result, err) => {
                if (result && !scannedCodes.has(result.getText())) {
                    handleSuccess(result.getText());
                }
                if (err && !(err instanceof ZXing.NotFoundException)) {
                    console.error('Ошибка декодирования:', err);
                }
            });

            cameraError.classList.add('d-none');
            instructions.classList.remove('d-none');
            fileUploadContainer.classList.add('d-none');

        } catch (err) {
            console.error('Ошибка настройки камеры:', err);
            handleCameraError(err);
        }
    }

    function handleSuccess(data) {
        if (scannedCodes.has(data)) return;
        scannedCodes.add(data);

        const displayData = data.includes('=') ? data.split('=')[1] : data;

        const resultItem = document.createElement('div');
        resultItem.className = 'list-group-item slide-in';
        resultItem.innerHTML = `
            <div class="d-flex justify-content-between align-items-center">
                <div class="text-truncate">${displayData}</div>
                <div class="btn-group">
                    <button class="btn btn-sm btn-outline-light copy-btn">
                        <i class="fas fa-copy"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-light delete-btn">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;

        resultItem.querySelector('.copy-btn').addEventListener('click', () => {
            navigator.clipboard.writeText(displayData)
                .then(() => {
                    const icon = resultItem.querySelector('.copy-btn i');
                    icon.className = 'fas fa-check';
                    setTimeout(() => {
                        icon.className = 'fas fa-copy';
                    }, 1000);
                });
        });

        resultItem.querySelector('.delete-btn').addEventListener('click', () => {
            scannedCodes.delete(data);
            resultItem.classList.add('fade-out');
            setTimeout(() => {
                resultItem.remove();
                updateResultsView();
            }, 200);
        });

        resultsList.insertBefore(resultItem, resultsList.firstChild);
        updateResultsView();
    }

    function updateResultsView() {
        const count = scannedCodes.size;
        codesCount.textContent = count;
        noResults.style.display = count === 0 ? 'block' : 'none';
        copyAllBtn.disabled = count === 0;
    }

    function handleCameraError(error) {
        console.error('Ошибка доступа к камере:', error);
        cameraError.classList.remove('d-none');
        instructions.classList.add('d-none');
        fileUploadContainer.classList.remove('d-none');
    }

    // Обработчики событий
    copyAllBtn.addEventListener('click', () => {
        const allResults = Array.from(resultsList.children)
            .map(item => item.querySelector('.text-truncate').textContent)
            .join('\n');

        navigator.clipboard.writeText(allResults)
            .then(() => {
                const originalText = copyAllBtn.innerHTML;
                copyAllBtn.innerHTML = '<i class="fas fa-check me-1"></i>Скопировано!';
                setTimeout(() => {
                    copyAllBtn.innerHTML = originalText;
                }, 1000);
            });
    });

    clearAllBtn.addEventListener('click', () => {
        scannedCodes.clear();
        resultsList.innerHTML = '';
        updateResultsView();
    });

    // Загрузка файлов
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length === 0) return;

        Array.from(e.target.files).forEach(file => {
            if (!file.type.match('image.*')) return;

            const reader = new FileReader();
            reader.onload = async (event) => {
                const img = new Image();
                img.onload = async () => {
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d', { alpha: false });
                    ctx.drawImage(img, 0, 0);
                    
                    try {
                        const hints = new Map();
                        hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.QR_CODE]);
                        hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
                        
                        // Создаем временный HTML элемент img для ZXing
                        const tmpImg = document.createElement('img');
                        tmpImg.src = event.target.result;
                        document.body.appendChild(tmpImg);
                        
                        try {
                            // Используем BrowserMultiFormatReader для декодирования изображения
                            const result = await codeReader.decodeFromImage(tmpImg);
                            if (result) {
                                handleSuccess(result.getText());
                            }
                        } catch (error) {
                            console.error('Ошибка при декодировании QR-кода:', error);
                        } finally {
                            // Удаляем временный элемент
                            document.body.removeChild(tmpImg);
                        }
                    } catch (err) {
                        console.error('Ошибка при обработке изображения:', err);
                    }
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        });

        // Сбросить значение, чтобы можно было загрузить тот же файл повторно
        fileInput.value = '';
    });

    window.addEventListener('beforeunload', () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
        
        // Остановить ZXing сканер
        if (codeReader) {
            codeReader.reset();
        }
    });

    // Инициализация
    setupCamera();
});
