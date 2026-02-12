# Melati Print Service

Automated printing service untuk Melati App yang menangani pencetakan thermal receipt dan invoice A4 tanpa dialog printer.

## 🎯 Fitur

- ✅ **Silent Printing** - Cetak otomatis tanpa popup dialog
- ✅ **Auto-routing** - Receipt ke thermal, Invoice ke A4
- ✅ **ESC/POS Support** - Native thermal printer commands
- ✅ **PDF Generation** - Invoice A4 dengan Puppeteer
- ✅ **Windows Service** - Auto-start saat boot
- ✅ **Queue Management** - Automatic job queueing dengan retry
- ✅ **CORS Ready** - Support localhost & Live Server
- ✅ **Fallback** - Web app tetap bisa pakai window.print()

## 📋 Requirements

- Windows 10/11
- Node.js 16+ ([Download](https://nodejs.org/))
- **Google Chrome** ATAU **Microsoft Edge** (untuk generate PDF)
- Printer thermal (80mm) untuk receipt
- Printer A4 (inkjet/laser) untuk invoice

### 🌐 Browser Requirement

Service ini memerlukan browser berbasis Chromium untuk generate PDF:

- ✅ **Google Chrome** (Recommended) - [Download](https://www.google.com/chrome/)
- ✅ **Microsoft Edge** (Biasanya sudah terinstall di Windows 10/11)
- ✅ **Chromium via Puppeteer** (Fallback jika tidak ada Chrome/Edge)

## 🚀 Quick Start

### For New Device Setup

```bash
# 1. Test browser compatibility FIRST
npm run test:browser
# atau double-click: test-browser.bat

# 2. If test passed, install dependencies
npm install

# 3. Configure printers
notepad config\printer-config.json

# 4. Start service
npm start

# 5. Test endpoint
curl http://localhost:3001/api/health
```

### For Existing Installation

```powershell
# 1. Klik kanan → Run as Administrator
install-auto-start.bat

# 2. Konfigurasi printer
notepad config\printers.json

# 3. Restart service
net restart MelatiPrintService

# 4. Test
curl http://localhost:3001/api/health
```

**✅ Done!** Service siap digunakan.

## 📖 Dokumentasi Lengkap

**[📘 INSTALL.md](INSTALL.md)** - Panduan instalasi lengkap step-by-step

**[🚀 DEPLOY_GUIDE.md](DEPLOY_GUIDE.md)** - Panduan deploy ke multiple devices

**[✅ DEVICE_SETUP_CHECKLIST.md](DEVICE_SETUP_CHECKLIST.md)** - Checklist untuk setiap device baru

Berisi:

- Instalasi detail untuk komputer baru
- Deploy ke multiple PC
- Browser compatibility test
- Konfigurasi printer
- Troubleshooting lengkap
- Management commands
- Best practices

## 🧪 Testing

### Test Browser Compatibility

Sebelum deploy ke device baru, **WAJIB** jalankan test ini:

```bash
# Via npm
npm run test:browser

# Atau via batch file
test-browser.bat

# Atau langsung
node test-browser.js
```

Test ini akan:

- ✅ Detect Chrome/Edge installation
- ✅ Launch Puppeteer browser
- ✅ Generate test PDF
- ✅ Verify all requirements met

**Expected Output:**

```
✅ Chrome found at: C:\Program Files\Google\Chrome\Application\chrome.exe
✅ Browser launched successfully!
✅ PDF generated successfully
✅ ALL TESTS PASSED!
```

**Jika test GAGAL, service TIDAK akan bisa print invoice!**

## ⚙️ Konfigurasi

Edit `server.js` line 10:

```javascript
const corsOptions = {
  origin: [
    "https://YOURNAME.github.io", // ⚠️ GANTI INI!
    "http://localhost:8080",
  ],
  // ...
};
```

### 2. Konfigurasi Printer

Edit `config/printers.json`:

```json
{
  "receipt": "EPSON TM-T20II", // Nama printer thermal
  "invoice": "EPSON L3210", // Nama printer A4
  "default": "EPSON L3210"
}
```

**Cara cek nama printer:**

1. Buka Control Panel → Devices and Printers
2. Copy nama printer persis seperti yang tertera

### 3. Test Service

Buka browser: `http://localhost:3000/api/health`

Response:

```json
{
  "status": "ok",
  "timestamp": "2026-01-24T10:30:00.000Z",
  "uptime": 123.45,
  "version": "1.0.0"
}
```

## 📡 API Endpoints

### Health Check

```
GET /api/health
```

### List Printers

```
GET /api/printers
```

### Print Receipt

```
POST /api/print/receipt
Content-Type: application/json

{
  "items": [...],
  "totalHarga": 500000,
  "jumlahBayar": 500000,
  "kembalian": 0,
  "sales": "Budi",
  "tanggal": "24/01/2026",
  "metodeBayar": "tunai"
}
```

### Print Invoice

```
POST /api/print/invoice
Content-Type: application/json

{
  "items": [...],
  "totalHarga": 500000,
  "invoiceNumber": "INV-001",
  "tanggal": "24/01/2026",
  "sales": "Budi"
}
```

## 🔧 Troubleshooting

### Service tidak bisa start

**Solusi:**

1. Buka Services (Win+R → `services.msc`)
2. Cari "Melati Print Service"
3. Klik Start
4. Jika error, cek logs: `logs/error.log`

### Port 3000 sudah dipakai

**Solusi:**

1. Edit `server.js` line 6:
   ```javascript
   const PORT = process.env.PORT || 3001; // Ganti ke 3001
   ```
2. Restart service

### Printer tidak ditemukan

**Solusi:**

1. Pastikan printer online
2. Cek nama printer di Control Panel
3. Update `config/printers.json`
4. Restart service

### CORS Error dari web app

**Solusi:**

1. Update `server.js` corsOptions
2. Tambahkan URL GitHub Pages Anda
3. Restart service

## 📝 Logs

Logs tersimpan di folder `logs/`:

- `error.log` - Error saja
- `combined.log` - Semua log

**Cara lihat log real-time:**

```bash
# Windows PowerShell
Get-Content logs\combined.log -Wait

# Command Prompt
type logs\combined.log
```

## 🔄 Update Service

```bash
# Stop service
net stop "Melati Print Service"

# Update code
git pull

# Install dependencies
npm install

# Start service
net start "Melati Print Service"
```

## 🗑️ Uninstall

```bash
# Stop service
net stop "Melati Print Service"

# Uninstall
sc delete "Melati Print Service"

# Delete folder
cd ..
rmdir /s printing-service
```

## 📞 Support

- Logs: `printing-service/logs/`
- Config: `printing-service/config/printers.json`
- Documentation: `docs/FITUR_PRINT-OTOMATIS.md`

## 📄 License

MIT
