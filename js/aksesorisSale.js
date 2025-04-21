// Import data dari tambahAksesoris.js
import { OPSI_KOTAK, OPSI_AKSESORIS } from './tambahAksesoris.js';

// Utility functions
const formatRupiah = (angka) => {
    const number = typeof angka === 'string' ? parseInt(angka) : angka;
    return new Intl.NumberFormat('id-ID').format(number);
};

const unformatRupiah = (rupiah) => {
    return rupiah ? parseInt(rupiah.replace(/[^\d]/g, '')) : 0;
};

// Fungsi untuk mendapatkan data aksesoris dari localStorage
const getAksesorisData = () => {
    const data = localStorage.getItem('aksesorisData');
    return data ? JSON.parse(data) : [];
};

// Fungsi untuk mendapatkan stok aksesoris
const getAksesorisStock = () => {
    const aksesorisData = getAksesorisData();
    const stock = {};
    
    // Hitung stok dari data tambah aksesoris
    aksesorisData.forEach(data => {
        data.items.forEach(item => {
            const key = `${item.kodeText}`;
            if (!stock[key]) {
                stock[key] = {
                    kode: item.kode,
                    kodeText: item.kodeText,
                    nama: item.nama,
                    stok: 0,
                    harga: item.hargaSatuan
                };
            }
            stock[key].stok += item.jumlah;
        });
    });
    
    // Kurangi stok dari data penjualan
    const penjualanData = getPenjualanData();
    penjualanData.forEach(data => {
        data.items.forEach(item => {
            const key = `${item.kodeText}`;
            if (stock[key]) {
                stock[key].stok -= item.jumlah;
            }
        });
    });
    
    return Object.values(stock);
};

// Fungsi untuk mendapatkan data penjualan dari localStorage
const getPenjualanData = () => {
    const data = localStorage.getItem('penjualanAksesorisData');
    return data ? JSON.parse(data) : [];
};

// Fungsi untuk menyimpan data penjualan ke localStorage
const savePenjualanData = (data) => {
    const penjualanData = getPenjualanData();
    penjualanData.push(data);
    localStorage.setItem('penjualanAksesorisData', JSON.stringify(penjualanData));
};

// Fungsi untuk menghasilkan nomor penjualan otomatis
const generateNoPenjualan = () => {
    const date = new Date();
    const year = date.getFullYear().toString().substr(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    
    const penjualanData = getPenjualanData();
    const count = penjualanData.length + 1;
    
    return `PJ${year}${month}${day}-${count.toString().padStart(3, '0')}`;
};

// Fungsi untuk menampilkan data aksesoris di modal
const displayAksesorisInModal = (filter = '') => {
    const tableBody = document.querySelector('#tableAksesoris tbody');
    if (!tableBody) return;
    
    tableBody.innerHTML = '';
    
    const stock = getAksesorisStock();
    const filteredStock = filter 
        ? stock.filter(item => 
            item.kodeText.toLowerCase().includes(filter.toLowerCase()) || 
            item.nama.toLowerCase().includes(filter.toLowerCase())
          )
        : stock;
    
    if (filteredStock.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" class="text-center">Tidak ada data aksesoris</td></tr>`;
        return;
    }
    
    filteredStock.forEach(item => {
        if (item.stok <= 0) return; // Skip item dengan stok 0
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.kodeText}</td>
            <td>${item.nama}</td>
            <td>${item.stok}</td>
            <td>${formatRupiah(item.harga)}</td>
            <td>
                <button class="btn btn-sm btn-primary btn-pilih" 
                    data-kode="${item.kode}" 
                    data-kode-text="${item.kodeText}" 
                    data-nama="${item.nama}" 
                    data-harga="${item.harga}" 
                    data-stok="${item.stok}">
                    <i class="fas fa-check"></i> Pilih
                </button>
            </td>
        `;
        tableBody.appendChild(row);
    });
    
    // Tambahkan event listener untuk tombol pilih
    document.querySelectorAll('.btn-pilih').forEach(btn => {
        btn.addEventListener('click', function() {
            const kode = this.getAttribute('data-kode');
            const kodeText = this.getAttribute('data-kode-text');
            const nama = this.getAttribute('data-nama');
            const harga = this.getAttribute('data-harga');
            const stok = this.getAttribute('data-stok');
            
            // Tambahkan item ke tabel penjualan
            addItemToSaleTable(kode, kodeText, nama, harga, stok);
            
            // Tutup modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('modalPilihAksesoris'));
            modal.hide();
        });
    });
};

// Fungsi untuk menambahkan item ke tabel penjualan
const addItemToSaleTable = (kode, kodeText, nama, harga, stok) => {
    const tableBody = document.querySelector('#tableKotak tbody');
    if (!tableBody) return;
    
    // Cek apakah item sudah ada di tabel
    const existingRow = Array.from(tableBody.querySelectorAll('tr')).find(row => {
        const kodeCell = row.querySelector('td:first-child input');
        return kodeCell && kodeCell.value === kodeText;
    });
    
    if (existingRow) {
        // Update jumlah jika item sudah ada
        const jumlahInput = existingRow.querySelector('.jumlah-barang');
        const currentJumlah = parseInt(jumlahInput.value) || 0;
        if (currentJumlah < parseInt(stok)) {
            jumlahInput.value = currentJumlah + 1;
            // Trigger event untuk menghitung ulang total
            jumlahInput.dispatchEvent(new Event('input'));
        } else {
            alert(`Stok ${nama} tidak mencukupi!`);
        }
        return;
    }
    
    // Tambahkan baris baru jika item belum ada
    const newRow = document.createElement('tr');
    newRow.innerHTML = `
        <td>
            <input type="text" class="form-control" value="${kodeText}" readonly>
            <input type="hidden" class="kode-barang" value="${kode}">
        </td>
        <td><input type="text" class="form-control nama-barang" value="${nama}" readonly></td>
        <td>
            <input type="number" class="form-control jumlah-barang" value="1" min="1" max="${stok}">
            <input type="hidden" class="stok-barang" value="${stok}">
        </td>
        <td><input type="number" class="form-control berat-barang" value="0" min="0" step="0.01"></td>
        <td><input type="number" class="form-control harga-per-gram" value="${harga}" min="0"></td>
        <td><input type="text" class="form-control total-harga" value="${formatRupiah(harga)}" readonly></td>
        <td>
            <button class="btn btn-danger btn-sm btn-hapus">
                <i class="fas fa-trash"></i>
            </button>
        </td>
    `;
    
    tableBody.appendChild(newRow);
    
    // Tambahkan event listeners
    attachRowEventListeners(newRow);
    updateGrandTotal();
};

// Fungsi untuk menambahkan event listeners ke baris tabel
const attachRowEventListeners = (row) => {
    const jumlahInput = row.querySelector('.jumlah-barang');
    const beratInput = row.querySelector('.berat-barang');
    const hargaInput = row.querySelector('.harga-per-gram');
    const totalInput = row.querySelector('.total-harga');
    const stokInput = row.querySelector('.stok-barang');
    const deleteButton = row.querySelector('.btn-hapus');
    
    // Event listener untuk input jumlah
    jumlahInput.addEventListener('input', function() {
        const jumlah = parseInt(this.value) || 0;
        const stok = parseInt(stokInput.value) || 0;
        
        if (jumlah > stok) {
            alert(`Stok tidak mencukupi! Stok tersedia: ${stok}`);
            this.value = stok;
        }
        
        calculateRowTotal(row);
    });
    
    // Event listener untuk input berat
    beratInput.addEventListener('input', function() {
        calculateRowTotal(row);
    });
    
    // Event listener untuk input harga per gram
    hargaInput.addEventListener('input', function() {
        calculateRowTotal(row);
    });
    
    // Event listener untuk tombol hapus
    deleteButton.addEventListener('click', function() {
        row.remove();
        updateGrandTotal();
    });
};

// Fungsi untuk menghitung total per baris
const calculateRowTotal = (row) => {
    const jumlahInput = row.querySelector('.jumlah-barang');
    const beratInput = row.querySelector('.berat-barang');
    const hargaInput = row.querySelector('.harga-per-gram');
    const totalInput = row.querySelector('.total-harga');
    
    const jumlah = parseInt(jumlahInput.value) || 0;
    const berat = parseFloat(beratInput.value) || 0;
    const harga = parseInt(hargaInput.value) || 0;
    
    let total;
    if (berat > 0) {
        // Jika berat diisi, hitung berdasarkan berat
        total = berat * harga * jumlah;
    } else {
        // Jika berat tidak diisi, hitung berdasarkan harga per item
        total = harga * jumlah;
    }
    totalInput.value = formatRupiah(total);
    updateGrandTotal();
};

// Fungsi untuk menghitung grand total
const updateGrandTotal = () => {
    const totalInputs = document.querySelectorAll('#tableKotak tbody .total-harga');
    let grandTotal = 0;
    
    totalInputs.forEach(input => {
        grandTotal += unformatRupiah(input.value);
    });
    
    const grandTotalElement = document.getElementById('grand-total');
    if (grandTotalElement) {
        grandTotalElement.textContent = formatRupiah(grandTotal);
    }
    
    const totalOngkosInput = document.getElementById('totalOngkos');
    if (totalOngkosInput) {
        totalOngkosInput.value = formatRupiah(grandTotal);
    }
};

// Fungsi untuk menghitung kembalian
const calculateKembalian = () => {
    const totalOngkosInput = document.getElementById('totalOngkos');
    const jumlahBayarInput = document.getElementById('jumlahBayar');
    const kembalianInput = document.getElementById('kembalian');
    
    if (!totalOngkosInput || !jumlahBayarInput || !kembalianInput) return;
    
    const totalOngkos = unformatRupiah(totalOngkosInput.value);
    const jumlahBayar = unformatRupiah(jumlahBayarInput.value);
    
    const kembalian = jumlahBayar - totalOngkos;
    kembalianInput.value = formatRupiah(kembalian > 0 ? kembalian : 0);
};

// Fungsi untuk menyimpan data penjualan
const saveSale = () => {
    const tanggal = document.getElementById('tanggal').value;
    const noPenjualan = document.getElementById('noPenjualan').value;
    const sales = document.getElementById('sales').value;
    const namaPelanggan = document.getElementById('namaPelanggan').value;
    const noHp = document.getElementById('noHp').value;
    const alamatPelanggan = document.getElementById('alamatPelanggan').value;
    const metodeBayar = document.getElementById('metodeBayar');
    const metodeBayarText = metodeBayar.options[metodeBayar.selectedIndex].text;
    const totalOngkos = document.getElementById('totalOngkos').value;
    const jumlahBayar = document.getElementById('jumlahBayar').value;
    const kembalian = document.getElementById('kembalian').value;
    const keterangan = document.getElementById('keterangan').value;
    
    // Validasi data
    if (!tanggal) {
        alert('Tanggal harus diisi!');
        return false;
    }
    
    if (!sales) {
        alert('Nama sales harus diisi!');
        return false;
    }
    
    if (!namaPelanggan) {
        alert('Nama pelanggan harus diisi!');
        return false;
    }
    
    const tableBody = document.querySelector('#tableKotak tbody');
    if (!tableBody || tableBody.querySelectorAll('tr').length === 0) {
        alert('Detail barang harus diisi!');
        return false;
    }
    
    if (!jumlahBayar || unformatRupiah(jumlahBayar) === 0) {
        alert('Jumlah bayar harus diisi!');
        return false;
    }
    
    if (unformatRupiah(jumlahBayar) < unformatRupiah(totalOngkos) && metodeBayar.value === '1') {
        alert('Jumlah bayar kurang dari total!');
        return false;
    }
    
    // Kumpulkan data dari tabel
    const items = [];
    const rows = tableBody.querySelectorAll('tr');
    
    rows.forEach(row => {
        const kodeInput = row.querySelector('.kode-barang');
        const kodeText = row.querySelector('td:first-child input').value;
        const namaBarang = row.querySelector('.nama-barang').value;
        const jumlah = row.querySelector('.jumlah-barang').value;
        const berat = row.querySelector('.berat-barang').value;
        const hargaPerGram = row.querySelector('.harga-per-gram').value;
        const totalHarga = row.querySelector('.total-harga').value;
        
        items.push({
            kode: kodeInput.value,
            kodeText: kodeText,
            nama: namaBarang,
            jumlah: parseInt(jumlah),
            berat: parseFloat(berat) || 0,
            hargaPerGram: parseInt(hargaPerGram),
            totalHarga: unformatRupiah(totalHarga)
        });
    });
    
    // Data yang akan disimpan
    const data = {
        id: Date.now(),
        tanggal: tanggal,
        noPenjualan: noPenjualan,
        sales: sales,
        pelanggan: {
            nama: namaPelanggan,
            noHp: noHp,
            alamat: alamatPelanggan
        },
        metodeBayar: metodeBayar.value,
        metodeBayarText: metodeBayarText,
        totalOngkos: unformatRupiah(totalOngkos),
        jumlahBayar: unformatRupiah(jumlahBayar),
        kembalian: unformatRupiah(kembalian),
        keterangan: keterangan,
        items: items
    };
    
    // Simpan data
    try {
        savePenjualanData(data);
        alert('Data penjualan berhasil disimpan!');
        return true;
    } catch (error) {
        console.error('Gagal menyimpan data:', error);
        alert('Gagal menyimpan data: ' + error.message);
        return false;
    }
};

// Fungsi untuk mencetak nota
const printReceipt = () => {
    // Implementasi cetak nota
    alert('Fitur cetak nota akan segera tersedia!');
};

// Fungsi untuk mereset form
const resetForm = () => {
    document.getElementById('tanggal').value = '';
    document.getElementById('noPenjualan').value = generateNoPenjualan();
    document.getElementById('sales').value = '';
    document.getElementById('namaPelanggan').value = '';
    document.getElementById('noHp').value = '';
    document.getElementById('alamatPelanggan').value = '';
    document.getElementById('metodeBayar').value = '1';
    document.getElementById('totalOngkos').value = '0';
    document.getElementById('jumlahBayar').value = '';
    document.getElementById('kembalian').value = '0';
    document.getElementById('keterangan').value = '';
    
    const tableBody = document.querySelector('#tableKotak tbody');
    if (tableBody) {
        tableBody.innerHTML = '';
    }
    
    const grandTotalElement = document.getElementById('grand-total');
    if (grandTotalElement) {
        grandTotalElement.textContent = '0';
    }
};

// Inisialisasi halaman penjualan aksesoris
export const initializeSalePage = () => {
    // Set tanggal hari ini
    const today = new Date();
    const day = today.getDate().toString().padStart(2, '0');
    const month = (today.getMonth() + 1).toString().padStart(2, '0');
    const year = today.getFullYear();
    
    const tanggalInput = document.getElementById('tanggal');
    if (tanggalInput) {
        tanggalInput.value = `${day}/${month}/${year}`;
    }
    
    // Set nomor penjualan otomatis
    const noPenjualanInput = document.getElementById('noPenjualan');
    if (noPenjualanInput) {
        noPenjualanInput.value = generateNoPenjualan();
    }
    
    // Event listener untuk tombol tambah
    const btnTambah = document.getElementById('btnTambah');
    if (btnTambah) {
        btnTambah.addEventListener('click', function() {
            // Tampilkan modal pilih aksesoris
            const modal = new bootstrap.Modal(document.getElementById('modalPilihAksesoris'));
            displayAksesorisInModal();
            modal.show();
        });
    }
    
    // Event listener untuk pencarian aksesoris
    const searchAksesoris = document.getElementById('searchAksesoris');
    if (searchAksesoris) {
        searchAksesoris.addEventListener('input', function() {
            displayAksesorisInModal(this.value);
        });
    }
    
    // Event listener untuk input jumlah bayar
    const jumlahBayarInput = document.getElementById('jumlahBayar');
    if (jumlahBayarInput) {
        jumlahBayarInput.addEventListener('input', function() {
            // Format input sebagai rupiah
            const value = this.value.replace(/[^\d]/g, '');
            this.value = formatRupiah(value);
            
            // Hitung kembalian
            calculateKembalian();
        });
    }
    
    // Event listener untuk tombol simpan penjualan
    const btnSimpanPenjualan = document.getElementById('btnSimpanPenjualan');
    if (btnSimpanPenjualan) {
        btnSimpanPenjualan.addEventListener('click', function() {
            if (saveSale()) {
                resetForm();
            }
        });
    }
    
    // Event listener untuk tombol cetak
    const btnCetak = document.getElementById('btnCetak');
    if (btnCetak) {
        btnCetak.addEventListener('click', function() {
            printReceipt();
        });
    }
    
    // Event listener untuk tombol batal
    const btnBatal = document.getElementById('btnBatal');
    if (btnBatal) {
        btnBatal.addEventListener('click', function() {
            if (confirm('Apakah Anda yakin ingin membatalkan penjualan ini?')) {
                resetForm();
            }
        });
    }
};

// Inisialisasi saat dokumen siap
document.addEventListener('DOMContentLoaded', function() {
    // Cek apakah kita berada di halaman penjualan aksesoris
    if (document.getElementById('tableKotak')) {
        initializeSalePage();
    }
});

  
