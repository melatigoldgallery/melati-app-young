// Data constants
export const OPSI_KOTAK = [
    { value: "0", text: "Pilih Kategori Kotak" },
    { value: "1", text: "K30", nama: "Kotak 30" },
    { value: "2", text: "K40", nama: "Kotak 40" },
    { value: "3", text: "KC50", nama: "Kotak 50 Cincin" },
    { value: "4", text: "KK50", nama: "Kotak 50 Kalung" },
    { value: "5", text: "K60", nama: "Kotak 60" },
    { value: "6", text: "KG70", nama: "Kotak 70 Gelang" },
    { value: "7", text: "KGB70", nama: "Kotak 70 Giftbox" },
    { value: "8", text: "K80", nama: "Kotak 80" },
    { value: "9", text: "K150", nama: "Kotak 150" },
    { value: "10", text: "K200", nama: "Kotak 200" }
];

export const OPSI_AKSESORIS = [
    { value: "0", text: "Pilih Kategori Aksesoris" },
    { value: "1", text: "LS", nama: "Lock S" },
    { value: "2", text: "LB", nama: "Lock Bulat" },
    { value: "3", text: "LL", nama: "Lock Lobster" },
    { value: "4", text: "LLM", nama: "Lock Lobster Medium" },
    { value: "5", text: "BT", nama: "Butterfly Giwang" },
    { value: "6", text: "SL", nama: "Silikon Cincin" },
    { value: "7", text: "LAP", nama: "Lap Perhiasan" },
    { value: "8", text: "CR", nama: "Gift Card" },
    { value: "9", text: "TG", nama: "Tali Gelang" }
];

// Utility functions
export const aksesorisSaleHandler = {
    formatRupiah(angka) {
        const number = typeof angka === 'string' ? parseInt(angka) : angka;
        return new Intl.NumberFormat('id-ID').format(number);
    },

    unformatRupiah(rupiah) {
        return rupiah ? parseInt(rupiah.replace(/[^\d]/g, '')) : 0;
    },

    init() {
        const selectKategori = document.getElementById("jenis-aksesoris");
        const btnTambahAksesoris = document.getElementById("btnTambahAksesoris");
        const tbody = document.querySelector("#tableTambahAksesoris tbody");
        const btnSimpanData = document.getElementById("btnSimpanData");
        const btnBatal = document.getElementById("btnBatal");

        if (!selectKategori || !btnTambahAksesoris || !tbody) {
            console.error("Elemen DOM yang dibutuhkan tidak ditemukan.");
            return;
        }

        // Event listener for category change
        selectKategori.addEventListener("change", () => {
            this.handleCategoryChange(selectKategori.value, tbody);
        });

        // Event listener for adding a new row
        btnTambahAksesoris.addEventListener("click", () => {
            this.tambahBaris(selectKategori.value, tbody);
        });

        // Event listener for saving data
        if (btnSimpanData) {
            btnSimpanData.addEventListener("click", () => {
                this.simpanData();
            });
        }

        // Event listener for cancel button
        if (btnBatal) {
            btnBatal.addEventListener("click", () => {
                if (confirm("Apakah Anda yakin ingin membatalkan?")) {
                    tbody.innerHTML = "";
                    this.handleCategoryChange(selectKategori.value, tbody);
                    document.getElementById("grand-total").textContent = "0";
                }
            });
        }

        // Initialize table
        this.handleCategoryChange(selectKategori.value, tbody);
    },

    handleCategoryChange(kategori, tbody) {
        tbody.innerHTML = ""; // Clear table
        const options = kategori === "1" ? OPSI_KOTAK : kategori === "2" ? OPSI_AKSESORIS : [];
        this.updateAllKodeBarangOptions(options);
        if (options.length) {
            this.tambahBaris(kategori, tbody);
        }
        document.getElementById("grand-total").textContent = "0";
    },

    updateAllKodeBarangOptions(options) {
        const kodeBarangSelects = document.querySelectorAll(".kode-barang");
        kodeBarangSelects.forEach(select => {
            select.innerHTML = options.map(option =>
                `<option value="${option.value}" data-nama="${option.nama}">${option.text}</option>`
            ).join("");
        });
    },

    tambahBaris(kategori, tbody) {
        const newRow = document.createElement("tr");
        const rowCount = tbody.children.length + 1;

        const options = kategori === "1" ? OPSI_KOTAK : OPSI_AKSESORIS;

        newRow.innerHTML = `
            <td>${rowCount}</td>
            <td>
                <select class="form-select kode-barang">
                    ${options.map(option =>
                        `<option value="${option.value}" data-nama="${option.nama}">${option.text}</option>`
                    ).join("")}
                </select>
            </td>
            <td><input type="text" class="form-control nama-barang" placeholder="Nama Barang" readonly></td>
            <td><input type="number" class="form-control jumlah-barang" placeholder="Jumlah" min="1"></td>
            <td><input type="number" class="form-control harga-satuan" placeholder="Harga Per Pcs" min="0"></td>
            <td><input type="text" class="form-control total-harga" placeholder="Total Harga" readonly></td>
            <td><button type="button" class="btn btn-danger btn-sm btn-hapus"><i class="fas fa-trash"></i></button></td>
        `;

        tbody.appendChild(newRow);
        this.attachRowEventListeners(newRow, tbody);
    },

    attachRowEventListeners(row, tbody) {
        this.attachCalculationListeners(row, tbody);
        this.attachDeleteListener(row, tbody);
        this.attachKodeBarangListener(row);
    },

    attachCalculationListeners(row, tbody) {
        const jumlahInput = row.querySelector(".jumlah-barang");
        const hargaInput = row.querySelector(".harga-satuan");
        const totalHargaInput = row.querySelector(".total-harga");

        hargaInput.addEventListener("input", (e) => {
            const value = e.target.value;
            this.hitungTotalHarga(jumlahInput, hargaInput, totalHargaInput);
            this.updateGrandTotal(tbody);
        });

        jumlahInput.addEventListener("input", () => {
            this.hitungTotalHarga(jumlahInput, hargaInput, totalHargaInput);
            this.updateGrandTotal(tbody);
        });
    },

    attachDeleteListener(row, tbody) {
        const deleteButton = row.querySelector(".btn-hapus");
        deleteButton.addEventListener("click", () => {
            if (tbody.children.length > 1) {
                row.remove();
                this.renumberRows(tbody);
                this.updateGrandTotal(tbody);
            } else {
                alert("Minimal harus ada satu baris!");
            }
        });
    },

    attachKodeBarangListener(row) {
        const kodeBarangSelect = row.querySelector(".kode-barang");
        const namaBarangInput = row.querySelector(".nama-barang");

        kodeBarangSelect.addEventListener("change", () => {
            const selectedOption = kodeBarangSelect.options[kodeBarangSelect.selectedIndex];
            const nama = selectedOption.getAttribute("data-nama");
            namaBarangInput.value = nama || "";
        });

        // Trigger change event to set initial value
        kodeBarangSelect.dispatchEvent(new Event("change"));
    },

    hitungTotalHarga(jumlahInput, hargaInput, totalHargaInput) {
        const jumlah = parseInt(jumlahInput.value) || 0;
        const harga = parseInt(hargaInput.value) || 0;
        const total = jumlah * harga;
        totalHargaInput.value = this.formatRupiah(total);
    },

    renumberRows(tbody) {
        const rows = tbody.querySelectorAll("tr");
        rows.forEach((row, index) => {
            row.cells[0].textContent = index + 1;
        });
    },

    updateGrandTotal(tbody) {
        const totalHargaInputs = tbody.querySelectorAll(".total-harga");
        let grandTotal = 0;
        
        totalHargaInputs.forEach(input => {
            grandTotal += this.unformatRupiah(input.value);
        });
        
        const grandTotalElement = document.getElementById("grand-total");
        if (grandTotalElement) {
            grandTotalElement.textContent = this.formatRupiah(grandTotal);
        }
    },

    simpanData() {
        const tanggal = document.getElementById("tanggal").value;
        const jenisAksesoris = document.getElementById("jenis-aksesoris");
        const jenisText = jenisAksesoris.options[jenisAksesoris.selectedIndex].text;
        const tbody = document.querySelector("#tableTambahAksesoris tbody");
        const rows = tbody.querySelectorAll("tr");
        
        // Validasi data
        if (!tanggal) {
            alert("Tanggal harus diisi!");
            return;
        }
        
        if (jenisAksesoris.value === "Pilih Kategori") {
            alert("Jenis aksesoris harus dipilih!");
            return;
        }
        
        // Kumpulkan data dari tabel
        const items = [];
        let isValid = true;
        
        rows.forEach((row, index) => {
            const kodeSelect = row.querySelector(".kode-barang");
            const kodeValue = kodeSelect.value;
            const kodeText = kodeSelect.options[kodeSelect.selectedIndex].text;
            const namaBarang = row.querySelector(".nama-barang").value;
            const jumlah = row.querySelector(".jumlah-barang").value;
            const hargaSatuan = row.querySelector(".harga-satuan").value;
            const totalHarga = row.querySelector(".total-harga").value;
            
            if (kodeValue === "0" || !jumlah || !hargaSatuan) {
                alert(`Data pada baris ${index + 1} belum lengkap!`);
                isValid = false;
                return;
            }
            
            items.push({
                kode: kodeValue,
                kodeText: kodeText,
                nama: namaBarang,
                jumlah: parseInt(jumlah),
                hargaSatuan: parseInt(hargaSatuan),
                totalHarga: this.unformatRupiah(totalHarga)
            });
        });
        
        if (!isValid) return;
        
        // Data yang akan disimpan
        const data = {
            tanggal: tanggal,
            jenisAksesoris: jenisAksesoris.value,
            jenisText: jenisText,
            items: items,
            grandTotal: this.unformatRupiah(document.getElementById("grand-total").textContent)
        };
        
        // Simpan data (contoh menggunakan localStorage)
        try {
            // Ambil data yang sudah ada
            const existingData = localStorage.getItem('aksesorisData');
            const aksesorisData = existingData ? JSON.parse(existingData) : [];
            
            // Tambahkan data baru
            data.id = Date.now(); // Tambahkan ID unik
            aksesorisData.push(data);
            
            // Simpan kembali ke localStorage
            localStorage.setItem('aksesorisData', JSON.stringify(aksesorisData));
            
            alert("Data berhasil disimpan!");
            
            // Reset form
            document.getElementById("tanggal").value = "";
            jenisAksesoris.value = "Pilih Kategori";
            tbody.innerHTML = "";
            this.tambahBaris(jenisAksesoris.value, tbody);
            document.getElementById("grand-total").textContent = "0";
            
        } catch (error) {
            console.error("Gagal menyimpan data:", error);
            alert("Gagal menyimpan data: " + error.message);
        }
    }
};

// Initialize when document is ready
document.addEventListener('DOMContentLoaded', function() {
    aksesorisSaleHandler.init();
});
   