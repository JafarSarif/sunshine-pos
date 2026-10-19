/**
 * Infinatort Camera Barcode Scanner
 * Powered by html5-qrcode with smartphone optimization & audio synthesizer
 */

class InfinatortScanner {
  constructor() {
    this.html5QrCode = null;
    this.isScanning = false;
    this.torchEnabled = false;
    this.currentCameraId = null;
    this.cameras = [];
    this.lastScannedCode = null;
    this.lastScanTime = 0;
    this.debounceMs = 1500; // 1.5 second cooldown for the same code

    // UI Elements
    this.readerElem = document.getElementById('reader');
    this.statusBadge = document.getElementById('scannerStatusBadge');
    this.statusText = document.getElementById('scannerStatusText');
    this.btnToggle = document.getElementById('btnToggleScanner');
    this.btnSwitchCam = document.getElementById('btnSwitchCamera');
    this.btnTorch = document.getElementById('btnToggleTorch');
    this.scanBox = document.querySelector('.scan-box');

    this.initAudio();
    this.bindEvents();
  }

  // Web Audio API Synthesizer (Instant sensory feedback without external MP3 assets)
  initAudio() {
    this.audioCtx = null;
  }

  ensureAudioContext() {
    if (!this.audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.audioCtx = new AudioCtx();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  playBeep(type = 'success') {
    try {
      this.ensureAudioContext();
      if (!this.audioCtx) return;

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      if (type === 'success') {
        // High crisp retail POS beep
        osc.frequency.setValueAtTime(1400, this.audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1800, this.audioCtx.currentTime + 0.08);
      } else {
        // Low double buzz for not found / error
        osc.frequency.setValueAtTime(320, this.audioCtx.currentTime);
      }

      gain.gain.setValueAtTime(0.2, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.audioCtx.currentTime + 0.12);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.12);
    } catch (e) {
      console.warn('Audio feedback failed:', e);
    }
  }

  bindEvents() {
    if (this.btnToggle) {
      this.btnToggle.addEventListener('click', () => {
        this.ensureAudioContext();
        if (this.isScanning) {
          this.stop();
        } else {
          this.start();
        }
      });
    }

    if (this.btnSwitchCam) {
      this.btnSwitchCam.addEventListener('click', () => {
        this.switchCamera();
      });
    }

    if (this.btnTorch) {
      this.btnTorch.addEventListener('click', () => {
        this.toggleTorch();
      });
    }
  }

  async start() {
    if (this.isScanning) return;

    if (typeof Html5Qrcode === 'undefined') {
      this.updateStatus('error', 'html5-qrcode library not loaded.');
      return;
    }

    try {
      this.updateStatus('scanning', 'Requesting camera access...');
      if (!this.html5QrCode) {
        this.html5QrCode = new Html5Qrcode('reader', {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.QR_CODE
          ],
          verbose: false
        });
      }

      // Check available cameras
      try {
        this.cameras = await Html5Qrcode.getCameras();
      } catch (err) {
        console.warn('Could not enumerate cameras:', err);
      }

      // Config: prefer environment (rear camera on phones), 10 FPS scan rate
      const config = {
        fps: 15,
        qrbox: { width: 220, height: 130 },
        aspectRatio: 1.777778
      };

      const cameraSelection = this.currentCameraId
        ? { deviceId: { exact: this.currentCameraId } }
        : { facingMode: 'environment' };

      await this.html5QrCode.start(
        cameraSelection,
        config,
        (decodedText, decodedResult) => this.onScanSuccess(decodedText, decodedResult),
        (errorMessage) => {
          // Frame-level decode failure is normal while scanning
        }
      );

      this.isScanning = true;
      const wrapper = document.getElementById('scannerViewportWrapper');
      if (wrapper) wrapper.style.display = 'flex';

      this.updateStatus('active', 'Camera active — Aim at barcode');
      if (this.btnToggle) {
        this.btnToggle.innerHTML = '⏹ Close Camera';
        this.btnToggle.classList.replace('btn-primary', 'btn-danger');
      }

      // Check if Torch is supported
      this.checkTorchSupport();

    } catch (err) {
      console.error('Camera start failed:', err);
      let msg = 'Failed to start camera.';
      if (err.name === 'NotAllowedError') {
        msg = 'Camera permission denied. Please allow camera in browser.';
      } else if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        msg = 'Camera on mobile requires HTTPS or localhost.';
      }
      this.updateStatus('idle', msg);
    }
  }

  async stop() {
    if (!this.isScanning || !this.html5QrCode) return;

    try {
      await this.html5QrCode.stop();
      this.isScanning = false;
      this.torchEnabled = false;

      const wrapper = document.getElementById('scannerViewportWrapper');
      if (wrapper) wrapper.style.display = 'none';

      this.updateStatus('idle', 'Camera standby — Tap "Open Camera" to scan');
      if (this.btnToggle) {
        this.btnToggle.innerHTML = '📷 Open Camera';
        this.btnToggle.classList.replace('btn-danger', 'btn-primary');
      }
    } catch (err) {
      console.error('Failed to stop camera:', err);
    }
  }

  async switchCamera() {
    if (!this.cameras || this.cameras.length < 2) {
      alert('Only one camera detected on this device.');
      return;
    }

    const currentIndex = this.cameras.findIndex(c => c.id === this.currentCameraId);
    const nextIndex = (currentIndex + 1) % this.cameras.length;
    this.currentCameraId = this.cameras[nextIndex].id;

    if (this.isScanning) {
      await this.stop();
      await this.start();
    }
  }

  async checkTorchSupport() {
    try {
      const capabilities = this.html5QrCode.getRunningTrackCapabilities();
      if (capabilities && capabilities.torch && this.btnTorch) {
        this.btnTorch.style.display = 'inline-flex';
      }
    } catch {
      if (this.btnTorch) this.btnTorch.style.display = 'none';
    }
  }

  async toggleTorch() {
    if (!this.isScanning || !this.html5QrCode) return;
    try {
      this.torchEnabled = !this.torchEnabled;
      await this.html5QrCode.applyVideoConstraints({
        advanced: [{ torch: this.torchEnabled }]
      });
      if (this.btnTorch) {
        this.btnTorch.style.color = this.torchEnabled ? '#facc15' : 'inherit';
      }
    } catch (err) {
      console.warn('Torch toggle not supported on this device:', err);
    }
  }

  onScanSuccess(decodedText, decodedResult) {
    const now = Date.now();
    // Debounce duplicate scans of the exact same barcode within debounceMs
    if (this.lastScannedCode === decodedText && (now - this.lastScanTime) < this.debounceMs) {
      return;
    }

    this.lastScannedCode = decodedText;
    this.lastScanTime = now;

    // Visual trigger
    if (this.scanBox) {
      this.scanBox.style.borderColor = '#10b981';
      this.scanBox.style.boxShadow = '0 0 20px #10b981';
      setTimeout(() => {
        this.scanBox.style.borderColor = 'rgba(6, 182, 212, 0.8)';
        this.scanBox.style.boxShadow = '0 0 15px rgba(6, 182, 212, 0.4)';
      }, 500);
    }

    // Audio beep
    this.playBeep('success');

    // Notify POS controller
    if (window.InfinatortPOS && typeof window.InfinatortPOS.handleScannedBarcode === 'function') {
      window.InfinatortPOS.handleScannedBarcode(decodedText);
    }
  }

  updateStatus(type, message) {
    if (!this.statusBadge || !this.statusText) return;

    this.statusBadge.className = `status-badge ${type}`;
    this.statusText.textContent = message;
  }

  // ==========================================
  // MODAL CAMERA SCANNER (FOR ADDING PRODUCTS)
  // ==========================================
  async openModalScanner(onScanCallback, title = "Scan Product Barcode") {
    this.ensureAudioContext();
    this.modalOnScan = onScanCallback;
    const modal = document.getElementById('cameraScannerModal');
    const titleElem = document.getElementById('cameraScannerModalTitle');
    const statusElem = document.getElementById('modalScannerStatus');
    if (!modal) return;

    if (titleElem) titleElem.textContent = title;
    if (statusElem) statusElem.textContent = 'Starting camera...';
    modal.classList.add('active');

    // If main POS camera was running, pause it so camera is free
    this.wasPosScanning = this.isScanning;
    if (this.isScanning) {
      await this.stop();
    }

    try {
      if (!this.modalQrCode) {
        this.modalQrCode = new Html5Qrcode('modalScannerReader', {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.QR_CODE
          ],
          verbose: false
        });
      }

      const cameraSelection = this.currentCameraId
        ? { deviceId: { exact: this.currentCameraId } }
        : { facingMode: 'environment' };

      await this.modalQrCode.start(
        cameraSelection,
        { fps: 15, qrbox: { width: 220, height: 130 } },
        (decodedText) => {
          this.playBeep('success');
          this.closeModalScanner();
          if (typeof this.modalOnScan === 'function') {
            this.modalOnScan(decodedText.trim());
          }
        },
        () => {}
      );

      if (statusElem) statusElem.textContent = 'Aim camera at product barcode...';
      this.isModalScanning = true;
    } catch (err) {
      console.error('Modal camera error:', err);
      if (statusElem) statusElem.textContent = 'Camera failed: ' + (err.message || 'Permission denied');
    }
  }

  async closeModalScanner() {
    const modal = document.getElementById('cameraScannerModal');
    if (modal) modal.classList.remove('active');

    if (this.modalQrCode && this.isModalScanning) {
      try {
        await this.modalQrCode.stop();
      } catch (e) {
        console.warn('Error stopping modal camera:', e);
      }
      this.isModalScanning = false;
    }

    // Resume POS scanner if it was active beforehand
    if (this.wasPosScanning) {
      this.wasPosScanning = false;
      this.start();
    }
  }
}

// Instantiate and expose globally
window.InfinatortScanner = new InfinatortScanner();
